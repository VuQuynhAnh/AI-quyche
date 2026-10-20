// Cập nhật cấu trúc CSDL đang chạy thật mà KHÔNG xoá dữ liệu: chạy lần lượt các
// file trong db/migrations/ (theo tên). Mỗi file phải chạy lại được nhiều lần
// (dùng IF NOT EXISTS...). Khác `npm run db:reset` là XOÁ SẠCH rồi tạo lại.
//
// Chạy bằng: npm run db:migrate
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { pool } from "../config/db.js";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "migrations");

try {
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    await pool.query(fs.readFileSync(path.join(dir, file), "utf-8"));
    console.log(`✓ ${file}`);
  }
  console.log("Đã cập nhật cấu trúc CSDL (dữ liệu cũ được giữ nguyên).");
} catch (err) {
  console.error("✗ Lỗi khi cập nhật CSDL:", err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
