import express from "express";
import cors from "cors";
import "dotenv/config";

import { connectMongo } from "./config/mongodb.js";
import authRoutes from "./routes/auth.routes.js";
import documentsRoutes from "./routes/documents.routes.js";
import documentFilesRoutes from "./routes/documentFiles.routes.js";
import chatRoutes from "./routes/chat.routes.js";
import adminRoutes from "./routes/admin.routes.js";

const app = express();

app.use(cors({ origin: process.env.CORS_ORIGIN || "*" }));
app.use(express.json({ limit: "2mb" }));

app.get("/api/health", (req, res) => res.json({ ok: true }));

app.use("/api/auth", authRoutes);
app.use("/api/documents", documentsRoutes);
// Đường dẫn RIÊNG (không phải "/api/documents") vì route trên yêu cầu role
// admin cho toàn bộ — xem giải thích trong documentFiles.routes.js.
app.use("/api/doc-files", documentFilesRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/admin", adminRoutes);

// Middleware xử lý lỗi tập trung — mọi lỗi throw/reject trong route async sẽ rơi vào đây
// (Express 4 cần bọc try/catch hoặc middleware như bên dưới; ở bản Express 5 sẽ tự bắt)
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || "Lỗi hệ thống." });
});

// Bọc mọi route handler async để lỗi tự động rơi vào middleware xử lý lỗi ở trên
process.on("unhandledRejection", (reason) => {
  console.error("[unhandledRejection]", reason);
});

const PORT = process.env.PORT || 4000;

connectMongo().finally(() => {
  app.listen(PORT, () => {
    console.log(`✅ Backend đang chạy tại http://localhost:${PORT}`);
  });
});
