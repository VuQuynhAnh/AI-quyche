// COMPOSITION ROOT — nơi DUY NHẤT "lắp ráp" toàn bộ ứng dụng (Dependency Injection).
//
// Mỗi repository / service / router là 1 hàm factory `createXxx(deps)`: nó KHÔNG
// tự `import` các phụ thuộc của mình mà nhận chúng qua tham số. File này tạo
// từng đối tượng theo đúng thứ tự phụ thuộc (tầng dưới trước, tầng trên sau)
// rồi truyền vào nhau:
//
//   config (pool, mongoose, gemini)
//     → repositories / providers   (chỉ kết nối & truy vấn)
//       → services                 (toàn bộ logic nghiệp vụ)
//         → routers                (nhận request, gọi service, trả response)
//
// Lợi ích:
//  - Muốn đổi 1 thành phần (VD lưu file lên S3 thay vì đĩa, thêm Redis cache
//    cho 1 repository) chỉ cần sửa ở đây, không đụng tới service.
//  - Viết test dễ: gọi `createXxxService({ ...repo giả })` là chạy được, không
//    cần DB thật.
//  - Nhìn file này là thấy ngay ai phụ thuộc vào ai.
import mongoose from "mongoose";
import { query, pool } from "./config/db.js";
import { chatModel, embeddingModel } from "./config/gemini.js";
import { Conversation } from "./models/conversation.model.js";
import { Message } from "./models/message.model.js";
import { signToken, verifyToken } from "./utils/jwt.js";
import { createPasswordHasher } from "./utils/password.js";

// Repositories & providers
import { createTransactionManager } from "./repositories/transaction.js";
import { createStoreRepository } from "./repositories/store.repository.js";
import { createAccountRepository } from "./repositories/account.repository.js";
import { createEmployeeRepository } from "./repositories/employee.repository.js";
import { createClockingRepository } from "./repositories/clocking.repository.js";
import { createPaysheetRepository } from "./repositories/paysheet.repository.js";
import { createDocumentRepository } from "./repositories/document.repository.js";
import { createConversationRepository } from "./repositories/conversation.repository.js";
import { createMessageRepository } from "./repositories/message.repository.js";
import { createFileStorage } from "./repositories/fileStorage.repository.js";
import { createAiProvider } from "./providers/ai.provider.js";

// Services
import { createAuthService } from "./services/auth.service.js";
import { createStorePlanService } from "./services/storePlan.service.js";
import { createAccountAccessGuard } from "./middleware/accountAccess.js";
import { createSuperadminService } from "./services/superadmin.service.js";
import { createStoreSettingService } from "./services/storeSetting.service.js";
import { createEmployeeService } from "./services/employee.service.js";
import { createTimesheetService } from "./services/timesheet.service.js";
import { createPaysheetService } from "./services/paysheet.service.js";
import { createClockingService } from "./services/clocking.service.js";
import { createClockingManagementService } from "./services/clockingManagement.service.js";
import { createDashboardService } from "./services/dashboard.service.js";
import { createSalaryInquiryService } from "./services/salaryInquiry.service.js";
import { createAssistantService } from "./services/assistant.service.js";
import { createConversationSummaryService } from "./services/conversationSummary.service.js";
import { createChatService } from "./services/chat.service.js";
import { createSupportInboxService } from "./services/supportInbox.service.js";
import { createRegulationDocumentService } from "./services/regulationDocument.service.js";

// Routers
import { createAuthRouter } from "./routes/auth.routes.js";
import { createSuperadminRouter } from "./routes/superadmin.routes.js";
import { createHrRouter } from "./routes/hr.routes.js";
import { createClockingRouter } from "./routes/clocking.routes.js";
import { createAdminRouter } from "./routes/admin.routes.js";
import { createDocumentsRouter } from "./routes/documents.routes.js";
import { createDocumentFilesRouter } from "./routes/documentFiles.routes.js";
import { createChatRouter } from "./routes/chat.routes.js";
import { createAvatarsRouter } from "./routes/avatars.routes.js";

export function createContainer() {
  // ---------- Hạ tầng ----------
  const db = { query }; // dùng helper query() để giữ log DEBUG_SQL
  const transaction = createTransactionManager({ pool });
  const passwordHasher = createPasswordHasher();
  const tokenService = { sign: signToken, verify: verifyToken };

  // ---------- Repositories & providers ----------
  const storeRepository = createStoreRepository({ db });
  const accountRepository = createAccountRepository({ db });
  const employeeRepository = createEmployeeRepository({ db });
  const clockingRepository = createClockingRepository({ db });
  const paysheetRepository = createPaysheetRepository({ db });
  const documentRepository = createDocumentRepository({ db });
  const conversationRepository = createConversationRepository({ Conversation, mongoose });
  const messageRepository = createMessageRepository({ Message });
  const fileStorage = createFileStorage();
  const aiProvider = createAiProvider({ chatModel, embeddingModel });

  // ---------- Services: tài khoản & cửa hàng ----------
  const authService = createAuthService({ accountRepository, passwordHasher, tokenService });
  const storePlanService = createStorePlanService({ storeRepository, accountRepository });
  const superadminService = createSuperadminService({
    transaction,
    storeRepository,
    accountRepository,
    employeeRepository,
    passwordHasher,
  });
  const storeSettingService = createStoreSettingService({ storeRepository });
  const employeeService = createEmployeeService({
    transaction,
    accountRepository,
    employeeRepository,
    passwordHasher,
    storePlanService,
    fileStorage,
  });

  // ---------- Services: chấm công & lương ----------
  const timesheetService = createTimesheetService({ storeRepository, clockingRepository, paysheetRepository });
  const paysheetService = createPaysheetService({
    transaction,
    paysheetRepository,
    employeeRepository,
    clockingRepository,
    timesheetService,
  });
  const clockingService = createClockingService({
    transaction,
    storeRepository,
    employeeRepository,
    clockingRepository,
    timesheetService,
    paysheetService,
  });
  const clockingManagementService = createClockingManagementService({
    transaction,
    employeeRepository,
    clockingRepository,
    timesheetService,
  });

  // ---------- Services: trợ lý AI ----------
  const dashboardService = createDashboardService({
    documentRepository,
    conversationRepository,
    messageRepository,
  });
  const salaryInquiryService = createSalaryInquiryService({ employeeRepository, paysheetService });
  const assistantService = createAssistantService({ documentRepository, aiProvider, salaryInquiryService });
  const conversationSummaryService = createConversationSummaryService({ aiProvider });
  const chatService = createChatService({
    conversationRepository,
    messageRepository,
    assistantService,
    conversationSummaryService,
  });
  const supportInboxService = createSupportInboxService({
    conversationRepository,
    messageRepository,
    chatService,
  });
  const regulationDocumentService = createRegulationDocumentService({
    documentRepository,
    fileStorage,
    aiProvider,
    transaction,
  });

  // ---------- Routers (gắn vào /api/<key> trong app.js) ----------
  const routers = {
    auth: createAuthRouter({ authService }),
    superadmin: createSuperadminRouter({ superadminService }),
    hr: createHrRouter({ storeSettingService, employeeService, clockingManagementService, paysheetService }),
    clocking: createClockingRouter({ clockingService }),
    admin: createAdminRouter({ dashboardService, supportInboxService }),
    documents: createDocumentsRouter({ regulationDocumentService }),
    "doc-files": createDocumentFilesRouter({ regulationDocumentService }),
    chat: createChatRouter({ chatService }),
    avatars: createAvatarsRouter({ fileStorage }),
  };

  return {
    routers,
    accountAccessGuard: createAccountAccessGuard({ accountRepository, tokenService }),
    // Xuất thêm để script (db/seed.js) và test dùng lại
    transaction,
    repositories: {
      storeRepository,
      accountRepository,
      employeeRepository,
      clockingRepository,
      paysheetRepository,
      documentRepository,
      conversationRepository,
      messageRepository,
      fileStorage,
    },
    providers: { aiProvider },
    services: {
      superadminService,
      employeeService,
      timesheetService,
      paysheetService,
      clockingService,
      clockingManagementService,
      regulationDocumentService,
      chatService,
    },
  };
}
