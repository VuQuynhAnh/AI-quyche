// Vá lỗi "Xem không được" cho 3 văn bản mẫu đã nạp bằng seedSampleData.js:
// script đó CHỈ insert vào bảng documents/document_chunks, không hề copy file
// gốc vào backend/uploads/ hay ghi lại storage_path (khác với luồng upload
// bình thường qua UI — xem saveDocumentFile() trong document.service.js).
// Kết quả: 3 văn bản mẫu có status='ready', trả lời được câu hỏi bình thường,
// nhưng bấm "Xem" ở trang quản trị thì báo lỗi vì storage_path là NULL.
//
// Script này tìm lại đúng 3 bản ghi đó theo original_filename (đã lưu sẵn lúc
// seed), copy file .txt tương ứng trong backend/sample-data/ sang
// backend/uploads/<id>.txt (ĐÚNG quy ước saveDocumentFile() đang dùng), rồi
// cập nhật storage_path — không đụng tới document_chunks/embedding đã có.
//
// Chạy (trong thư mục backend): node src/db/backfillSampleFileStorage.js
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { pool } from "../config/db.js";
import { resolveUploadPath, setDocumentStoragePath } from "../services/document.service.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SAMPLE_DATA_DIR = path.resolve(__dirname, "../../sample-data");

// Đúng 3 file đã được seedSampleData.js nạp vào DB — xem DOCS_TO_SEED ở đó.
// (File mẫu đã đổi từ .txt sang .docx.)
const SEEDED_FILES = ["quy-che-nghi-phep.docx", "noi-quy-lao-dong.docx", "quy-dinh-luong-thuong.docx"];

async function backfillOne(filename) {
  const existing = await pool.query(
    `SELECT id, title, storage_path FROM documents WHERE original_filename = $1 ORDER BY created_at DESC LIMIT 1`,
    [filename]
  );
  const doc = existing.rows[0];

  if (!doc) {
    console.log(`  - Bỏ qua "${filename}": chưa thấy trong DB (chưa chạy seedSampleData.js?).`);
    return;
  }
  if (doc.storage_path) {
    console.log(`  - Bỏ qua "${doc.title}": đã có storage_path sẵn (${doc.storage_path}).`);
    return;
  }

  const sourcePath = path.join(SAMPLE_DATA_DIR, filename);
  const content = await fs.readFile(sourcePath);
  const storagePath = `${doc.id}${path.extname(filename)}`;

  await fs.writeFile(resolveUploadPath(storagePath), content);
  await setDocumentStoragePath(doc.id, storagePath);

  console.log(`  ✓ "${doc.title}" (id=${doc.id}) → đã lưu file gốc, storage_path=${storagePath}`);
}

async function run() {
  console.log("→ Đang vá storage_path cho các văn bản mẫu chưa có file gốc...\n");
  for (const filename of SEEDED_FILES) {
    await backfillOne(filename);
  }
  console.log("\nHoàn tất! Vào trang Admin > Văn bản, bấm \"Xem\" ở 3 văn bản mẫu để kiểm tra lại.");
  await pool.end();
}

run().catch((err) => {
  console.error("\nBackfill thất bại:", err);
  process.exit(1);
});
