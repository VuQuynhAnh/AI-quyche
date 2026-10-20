// Kết nối PostgreSQL dùng chung cho toàn bộ backend.
// Dùng "pg.Pool" để tái sử dụng connection, tránh mở/đóng kết nối liên tục.
import pg from "pg";
import "dotenv/config";

const { Pool, types } = pg;

// Cột DATE (VD clocking.work_date) giữ nguyên chuỗi 'YYYY-MM-DD' — mặc định
// node-pg đổi sang Date lúc 00:00 giờ MÁY CHỦ, dễ lệch ngày khi server chạy UTC.
const PG_DATE_TYPE_OID = 1082;
types.setTypeParser(PG_DATE_TYPE_OID, (value) => value);

export const pool = new Pool({
  host: process.env.PGHOST || "localhost",
  port: Number(process.env.PGPORT) || 5432,
  database: process.env.PGDATABASE || "ai_quyche",
  user: process.env.PGUSER || "postgres",
  password: process.env.PGPASSWORD || "postgres",
});

pool.on("error", (err) => {
  console.error("[postgres] Lỗi kết nối không mong muốn:", err);
});

// Helper nhỏ để log query khi debug (bật bằng DEBUG_SQL=1 trong .env nếu cần)
export async function query(text, params) {
  const start = Date.now();
  const res = await pool.query(text, params);
  if (process.env.DEBUG_SQL === "1") {
    console.log("[sql]", text, `${Date.now() - start}ms`, `rows=${res.rowCount}`);
  }
  return res;
}
