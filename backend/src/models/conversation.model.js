// Model MongoDB đại diện cho "1 đoạn chat" (thread) của 1 nhân viên.
//
// THIẾT KẾ: mỗi nhân viên chỉ có ĐÚNG 1 đoạn chat đang hoạt động tại 1 thời
// điểm (isDeleted = false) — giống 1 cuộc trò chuyện liên tục kiểu Messenger/
// Zalo, không phải nhiều "hội thoại" tách rời như thiết kế trước đây. Khi
// nhân viên xoá cả đoạn chat, document này được XOÁ MỀM (isDeleted = true,
// deletedAt = thời điểm xoá) và 1 document mới được tạo cho các tin nhắn tiếp
// theo — xem chatThread.service.js (hàm getOrCreateActiveThread).
//
// Tin nhắn KHÔNG còn lồng (embed) trong document này nữa — xem models/message.model.js
// và comment giải thích lý do (tránh mảng phát triển không giới hạn).
import mongoose from "mongoose";

const conversationSchema = new mongoose.Schema(
  {
    // Tham chiếu "mềm" tới bảng users bên PostgreSQL (không dùng foreign key
    // thật vì khác hệ quản trị CSDL) — lưu kèm tên/email để trang admin hiển
    // thị log mà không phải query chéo sang Postgres.
    // LƯU Ý: không đặt thêm "index: true" ở đây — cột này đã được đánh index
    // (dạng partial unique) ở conversationSchema.index(...) bên dưới; khai
    // báo cả 2 nơi sẽ tạo trùng index và Mongoose sẽ cảnh báo lúc khởi động.
    userId: { type: String, required: true },
    userName: String,
    userEmail: String,
    title: { type: String, default: "Hội thoại mới" },

    // Trạng thái xử lý của đoạn chat:
    //  - 'normal'   : bình thường, chatbot tự trả lời được
    //  - 'flagged'  : CẦN ADMIN TRẢ LỜI — do (a) hệ thống tự phát hiện câu hỏi
    //                 trùng chủ đề tài liệu nhạy cảm (autoEscalated = true),
    //                 hoặc (b) chính nhân viên tự đánh dấu "câu hỏi khó, cần
    //                 admin hỗ trợ" (autoEscalated = false)
    //  - 'resolved' : admin đã vào trả lời trực tiếp
    status: {
      type: String,
      enum: ["normal", "flagged", "resolved"],
      default: "normal",
      index: true,
    },
    autoEscalated: { type: Boolean, default: false },
    flaggedAt: Date,
    resolvedAt: Date,

    // Đếm CỘNG DỒN số LẦN đoạn chat này từng chuyển sang "flagged" (mỗi lần
    // chuyển từ trạng thái khác sang "flagged" — kể cả sau khi đã "resolved"
    // rồi cần admin hỗ trợ lại — đều +1), bất kể tự động hay nhân viên tự
    // đánh dấu. KHÁC với "status"/"flaggedAt" (chỉ phản ánh LẦN GẦN NHẤT):
    // trường này giữ lại lịch sử để tính "tỷ lệ câu hỏi cần admin hỗ trợ"
    // (escalationCount cộng dồn TOÀN BỘ hội thoại / tổng số câu hỏi) ở
    // Dashboard admin — xem GET /admin/stats.
    escalationCount: { type: Number, default: 0 },

    // Tóm tắt ngắn (do Gemini sinh ra) lúc đoạn chat CHUYỂN SANG "flagged" —
    // hiển thị ở trang quản trị (Logs.jsx) để admin nắm nhanh nội dung mà
    // không cần mở xem toàn bộ tin nhắn. Sinh 1 LẦN tại thời điểm gắn cờ (xem
    // chatThread.service.js#generateConversationSummaryAsync), không tự cập
    // nhật theo các tin nhắn gửi thêm sau đó — đây là lựa chọn đơn giản hoá có
    // chủ đích cho bản demo, đủ để nắm bối cảnh ban đầu của vướng mắc.
    summary: String,
    summaryGeneratedAt: Date,

    // Xoá mềm cả đoạn chat (nhân viên bấm "Xoá đoạn chat"). Đoạn chat cũ vẫn
    // còn nguyên trong DB để admin xem lại khi cần (đối soát/kiểm tra), chỉ
    // không còn được coi là đoạn chat "đang hoạt động" của nhân viên đó nữa.
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: Date,
  },
  { timestamps: true }
);

// Đảm bảo ở tầng CSDL (không chỉ ở tầng code) rằng 1 nhân viên không thể có 2
// đoạn chat "đang hoạt động" (isDeleted = false) cùng lúc — partial unique
// index chỉ áp dụng cho các document có isDeleted = false.
conversationSchema.index(
  { userId: 1 },
  { unique: true, partialFilterExpression: { isDeleted: false } }
);

export const Conversation = mongoose.model("Conversation", conversationSchema);
