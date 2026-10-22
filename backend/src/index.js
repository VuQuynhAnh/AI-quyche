import "dotenv/config";

import { connectMongoInBackground } from "./config/mongodb.js";
import { connectRedisInBackground } from "./config/redis.js";
import { createContainer } from "./container.js";
import { createApp } from "./app.js";

const app = createApp(createContainer());

// Bắt các Promise bị reject mà không ai xử lý (VD: tác vụ chạy nền) để log ra
process.on("unhandledRejection", (reason) => {
  console.error("[unhandledRejection]", reason);
});

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`✅ Backend đang chạy tại http://localhost:${PORT}`);
});

// MongoDB chỉ dùng cho lịch sử chat — kết nối ở nền, không chặn khởi động
connectMongoInBackground();

// Redis chỉ làm cache (tuỳ chọn, bật bằng REDIS_URL) — cũng kết nối ở nền
connectRedisInBackground();
