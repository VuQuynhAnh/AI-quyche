// BỘ ENUM DÙNG CHUNG — nguồn DUY NHẤT cho mọi giá trị cố định (role, trạng
// thái...). Code KHÔNG viết chuỗi "admin", "draft"... trực tiếp mà luôn dùng
// hằng số ở đây (VD: ROLE.ADMIN, PAYSHEET_STATUS.DRAFT).
//
// Các kiểu ENUM của PostgreSQL được SINH TỰ ĐỘNG từ file này (xem
// POSTGRES_ENUM_TYPES bên dưới + db/seed.js), nên thêm/bớt giá trị chỉ cần sửa
// ở đây rồi chạy lại `npm run db:reset`.
//
// Frontend có bản sao tại frontend/src/constants/enums.js — sửa ở đây thì sửa
// cả bên đó.

// Vai trò tài khoản
//  - superadmin: quản trị toàn hệ thống — tạo cửa hàng (kèm admin đầu tiên) và
//                tạo superadmin khác; KHÔNG quản lý admin/user của cửa hàng
//  - admin     : quản lý 1 cửa hàng (nhân viên, chấm công, bảng lương, quy chế)
//  - user      : nhân viên của cửa hàng (chấm công, xem lương, chat)
export const ROLE = Object.freeze({
  SUPERADMIN: "superadmin",
  ADMIN: "admin",
  USER: "user",
});

// Role được gán cho tài khoản thuộc 1 cửa hàng (admin cửa hàng tự quản lý)
export const STORE_ROLES = Object.freeze([ROLE.ADMIN, ROLE.USER]);

// Loại 1 lần bấm chấm công
export const CLOCKING_ACTION = Object.freeze({
  CHECK_IN: "check_in",
  CHECK_OUT: "check_out",
});

// Ai tạo ra 1 dòng lịch sử chấm công
export const CLOCKING_SOURCE = Object.freeze({
  EMPLOYEE: "employee", // nhân viên tự chấm (GPS + QR)
  ADMIN: "admin", // admin chỉnh sửa giờ
});

// Trạng thái 1 dòng lịch sử chấm công (không xoá — chỉ huỷ)
export const CLOCKING_HISTORY_STATUS = Object.freeze({
  VALID: "valid",
  VOIDED: "voided",
});

// Vòng đời bảng lương tháng:
//   draft ──(chốt)──▶ finalized
//     │                  │
//     └──(huỷ)──▶ cancelled ◀──(huỷ)──┘
// Mỗi cửa hàng chỉ có 1 bảng lương KHÁC "cancelled" cho mỗi tháng.
export const PAYSHEET_STATUS = Object.freeze({
  DRAFT: "draft",
  FINALIZED: "finalized",
  CANCELLED: "cancelled",
});

// Trạng thái xử lý văn bản quy chế (trích xuất text + embedding chạy nền)
export const DOCUMENT_PROCESSING_STATUS = Object.freeze({
  PROCESSING: "processing",
  READY: "ready",
  FAILED: "failed",
});

// Trạng thái đoạn chat (MongoDB)
export const CONVERSATION_STATUS = Object.freeze({
  NORMAL: "normal",
  FLAGGED: "flagged", // cần admin trả lời
  RESOLVED: "resolved",
});

// Người gửi 1 tin nhắn (MongoDB)
export const MESSAGE_SENDER = Object.freeze({
  USER: "user",
  ASSISTANT: "assistant",
  ADMIN: "admin",
});

// Đánh giá câu trả lời của chatbot
export const MESSAGE_FEEDBACK = Object.freeze({
  HELPFUL: "helpful",
  UNHELPFUL: "unhelpful",
});

// Tên kiểu ENUM trong PostgreSQL -> enum JS tương ứng
export const POSTGRES_ENUM_TYPES = Object.freeze({
  account_role: ROLE,
  clocking_action_type: CLOCKING_ACTION,
  clocking_source: CLOCKING_SOURCE,
  clocking_history_status: CLOCKING_HISTORY_STATUS,
  paysheet_status: PAYSHEET_STATUS,
  document_processing_status: DOCUMENT_PROCESSING_STATUS,
});

export const enumValues = (enumObject) => Object.values(enumObject);

export const isEnumValue = (enumObject, value) => enumValues(enumObject).includes(value);
