// Tạo Express app từ các router đã được container lắp ráp sẵn. Tách khỏi
// index.js (nơi kết nối DB + listen) để có thể dựng app trong test mà không
// cần mở cổng mạng.
import express from "express";
import cors from "cors";
import { errorHandler } from "./middleware/errorHandler.js";

export function createApp({ routers, accountAccessGuard }) {
  const app = express();

  app.use(cors({ origin: process.env.CORS_ORIGIN || "*" }));
  app.use(express.json({ limit: "2mb" }));

  app.get("/api/health", (req, res) => res.json({ ok: true }));

  // Chặn ngay tài khoản bị khoá / cửa hàng tạm ngưng hoặc hết hạn, kể cả khi
  // token đăng nhập vẫn còn hạn (middleware/accountAccess.js)
  if (accountAccessGuard) app.use("/api", accountAccessGuard);

  // /api/auth, /api/superadmin, /api/hr (chấm công & lương của cửa hàng),
  // /api/clocking (nhân viên chấm công), /api/admin, /api/documents,
  // /api/doc-files, /api/chat — xem container.js
  for (const [path, router] of Object.entries(routers)) {
    app.use(`/api/${path}`, router);
  }

  // Phải đặt SAU tất cả router
  app.use(errorHandler);

  return app;
}
