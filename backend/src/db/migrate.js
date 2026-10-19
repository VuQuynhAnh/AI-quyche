// Cập nhật CẤU TRÚC CSDL lên bản mới (thêm bảng chấm công/lương) mà KHÔNG xoá
// dữ liệu: chỉ chạy schema.sql (toàn lệnh CREATE ... IF NOT EXISTS / ADD COLUMN
// IF NOT EXISTS nên chạy lại bao nhiêu lần cũng an toàn).
//
// Dùng script này (KHÔNG dùng `npm run seed`) cho CSDL đang chạy thật: seed sẽ
// XOÁ SẠCH văn bản và hội thoại để nạp lại dữ liệu mẫu.
//
// Chạy bằng: npm run migrate  (trong thư mục backend)
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { pool } from "../config/db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

try {
  const sql = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf-8");
  await pool.query(sql);
  console.log("✓ Đã cập nhật cấu trúc CSDL (dữ liệu cũ được giữ nguyên).");
} catch (err) {
  console.error("✗ Lỗi khi cập nhật CSDL:", err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
