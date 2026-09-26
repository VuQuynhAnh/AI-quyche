// Bảo vệ các route cần MongoDB (lịch sử hội thoại) — trả lỗi rõ ràng NGAY LẬP
// TỨC nếu chưa kết nối được, thay vì để mongoose âm thầm chờ rồi ném lỗi kỹ
// thuật khó hiểu (xem thêm comment trong config/mongodb.js).
// readyState: 0 = disconnected, 1 = connected, 2 = connecting, 3 = disconnecting
import mongoose from "mongoose";

export function requireMongo(req, res, next) {
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({
      error:
        "Chưa kết nối được MongoDB (dùng để lưu lịch sử hội thoại). " +
        "Kiểm tra MONGODB_URI trong .env và đảm bảo MongoDB đang chạy, sau đó khởi động lại backend.",
    });
  }
  next();
}
