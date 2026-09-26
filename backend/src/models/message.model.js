// Model MongoDB cho 1 tin nhắn — TÁCH RIÊNG khỏi Conversation (không lồng
// (embed) như thiết kế trước) vì lý do sau:
//
// Trước đây mỗi Conversation có 1 mảng "messages" lồng bên trong. Với mô hình
// mới "1 nhân viên = 1 đoạn chat liên tục", 1 đoạn chat có thể tích luỹ HÀNG
// NGÀN tin nhắn theo thời gian — nhồi tất cả vào 1 mảng trong 1 document Mongo
// là một "anti-pattern" được chính MongoDB khuyến cáo tránh (mảng không giới
// hạn, document có thể chạm giới hạn 16MB, và mỗi lần đọc/ghi phải tải toàn bộ
// mảng dù chỉ cần vài tin nhắn gần nhất). Tách thành collection riêng cho phép
// PHÂN TRANG hiệu quả bằng index (VD: "load 20 tin nhắn gần nhất, kéo lên load
// thêm 20 tin cũ hơn") mà không phải tải nguyên document.
import mongoose from "mongoose";

const sourceSchema = new mongoose.Schema(
  {
    documentId: String, // UUID của tài liệu bên PostgreSQL
    title: String,
  },
  { _id: false }
);

const messageSchema = new mongoose.Schema(
  {
    conversationId: { type: mongoose.Schema.Types.ObjectId, ref: "Conversation", required: true },

    // 'user'      : câu hỏi của nhân viên
    // 'assistant' : câu trả lời tự động của chatbot (Gemini)
    // 'admin'     : câu trả lời TRỰC TIẾP của quản trị viên
    role: { type: String, enum: ["user", "assistant", "admin"], required: true },
    content: { type: String, required: true },
    sources: { type: [sourceSchema], default: [] },

    // Đánh giá "hữu ích"/"không hữu ích" của NHÂN VIÊN cho 1 câu trả lời của
    // chatbot — chỉ áp dụng cho tin nhắn role "assistant" (xem route PATCH
    // /chat/thread/messages/:messageId/feedback). null = chưa đánh giá. Dùng
    // để đo chất lượng trả lời tự động, tổng hợp ở Dashboard admin (GET
    // /admin/stats -> feedbackBreakdown).
    feedback: { type: String, enum: ["helpful", "unhelpful", null], default: null },

    // Xoá mềm 1 tin nhắn lẻ (nhân viên xoá 1 tin nhắn trong đoạn chat của họ,
    // không ảnh hưởng tới các tin nhắn khác hay trạng thái cả đoạn chat).
    // Admin vẫn xem được nội dung đã xoá (phục vụ kiểm tra/đối soát nội bộ).
    isDeleted: { type: Boolean, default: false },
    deletedAt: Date,
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// Truy vấn phổ biến nhất: "lấy N tin nhắn gần nhất/cũ hơn của 1 đoạn chat,
// sắp theo thời gian" — index này giúp truy vấn đó nhanh dù có rất nhiều tin nhắn.
messageSchema.index({ conversationId: 1, createdAt: -1 });

export const Message = mongoose.model("Message", messageSchema);
