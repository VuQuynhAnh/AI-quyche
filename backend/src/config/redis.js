// Kết nối Redis — dùng làm CACHE cho các API đọc dữ liệu lớn, ít thay đổi
// (xem cache/cachedServices.js). Redis là TUỲ CHỌN:
//  - Không đặt REDIS_URL -> không tạo client, mọi API chạy thẳng vào DB như cũ.
//  - Redis chết / chưa kết nối được -> cache tự bỏ qua (client.isReady = false),
//    API vẫn chạy bình thường, chỉ chậm hơn. Client tự kết nối lại ở nền.
import { createClient } from "redis";
import "dotenv/config";

const MAX_RECONNECT_DELAY_MS = 30 * 1000;

function createRedisClient() {
  const url = process.env.REDIS_URL;
  if (!url) return null;

  const client = createClient({
    url,
    // Mặc định khi mất kết nối, lệnh được xếp hàng chờ -> request bị treo.
    // Tắt để lệnh báo lỗi NGAY, cache bỏ qua và đọc thẳng DB.
    disableOfflineQueue: true,
    socket: {
      connectTimeout: 5000,
      reconnectStrategy: (retries) => Math.min(1000 * 2 ** retries, MAX_RECONNECT_DELAY_MS),
    },
  });

  // Chỉ log lỗi 1 lần mỗi đợt mất kết nối (client thử lại liên tục, tránh rối log)
  let errorLogged = false;
  client.on("error", (err) => {
    if (errorLogged) return;
    errorLogged = true;
    console.error("[redis] Lỗi kết nối:", err.message, "→ API vẫn chạy, tạm thời không dùng cache.");
  });
  client.on("ready", () => {
    errorLogged = false;
    console.log("✅ Đã kết nối Redis (cache)");
  });

  return client;
}

export const redis = createRedisClient();

// Gọi lúc khởi động server — KHÔNG chặn việc khởi động (giống MongoDB)
export function connectRedisInBackground() {
  if (!redis) return;
  redis.connect().catch(() => {}); // lỗi đã được log ở sự kiện "error"
}
