// Kết nối MongoDB — dùng riêng để lưu lịch sử hội thoại (conversations/messages).
// Lý do dùng Mongo cho phần này thay vì PostgreSQL: mỗi tin nhắn có thể có số
// lượng "nguồn trích dẫn" khác nhau, cấu trúc lồng nhau (1 hội thoại - nhiều tin
// nhắn) khá tự nhiên để lưu dưới dạng document thay vì phải join nhiều bảng.
import mongoose from "mongoose";
import "dotenv/config";

// Mặc định Mongoose sẽ "buffer" (xếp hàng chờ) các lệnh truy vấn tới 10 giây
// nếu chưa kết nối xong, rồi mới báo lỗi — nghĩa là nếu quên bật MongoDB, các
// API liên quan tới hội thoại sẽ bị "treo" 10 giây trước khi trả lỗi, trải
// nghiệm rất khó chịu khi demo/dạy học. Tắt buffering để báo lỗi NGAY LẬP TỨC
// khi chưa kết nối được, dễ nhận biết và debug hơn nhiều.
mongoose.set("bufferCommands", false);

export async function connectMongo({ quiet = false } = {}) {
  const uri = process.env.MONGODB_URI || "mongodb://localhost:27017/ai_quyche_chat";
  try {
    // serverSelectionTimeoutMS ngắn (mặc định Mongoose là 30s) để lúc demo/dạy học,
    // nếu quên bật MongoDB thì server Node vẫn khởi động nhanh thay vì bị treo lâu.
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
    console.log("✅ Đã kết nối MongoDB (lưu lịch sử chat)");
  } catch (err) {
    if (quiet) return;
    console.error("[mongodb] Kết nối thất bại:", err.message);
    console.error(
      "  → Kiểm tra MONGODB_URI trong .env và đảm bảo MongoDB đang chạy (mongod / Docker / Atlas)."
    );
  }
}

// Dùng khi chạy server: KHÔNG chặn việc khởi động — các phần khác (chấm công,
// lương... trên PostgreSQL) vẫn chạy khi Mongo lỗi. Kết nối thất bại thì tự
// thử lại định kỳ (không log nữa cho đỡ rối), nên bật Mongo / whitelist IP xong
// là chat dùng được ngay mà không phải khởi động lại backend.
const RETRY_MS = 30 * 1000;

export function connectMongoInBackground() {
  const attempt = async (quiet) => {
    await connectMongo({ quiet });
    if (mongoose.connection.readyState === 1) return;
    if (!quiet) console.error(`  → Server vẫn chạy (trừ phần chat); tự thử kết nối lại mỗi ${RETRY_MS / 1000}s.`);
    setTimeout(() => attempt(true), RETRY_MS).unref();
  };
  attempt(false);
}
