// "Reset sạch rồi seed lại từ đầu" — dùng khi cần đưa hệ thống về đúng 1 trạng
// thái biết trước để test/demo (không còn văn bản rác, hội thoại cũ, hay file
// mồ côi trong backend/uploads/ từ những lần chạy trước).
//
// KHÁC với seedSampleData.js (chỉ INSERT, bỏ qua nếu đã có sẵn) — script này
// XOÁ HẲN dữ liệu cũ trước rồi mới nạp lại, và scope reset ĐÃ CHỌN là:
//   - TOÀN BỘ văn bản + chunk trong PostgreSQL (kể cả văn bản admin tự tải lên
//     sau này, không chỉ 3 văn bản mẫu), và toàn bộ file trong backend/uploads/.
//   - TOÀN BỘ hội thoại + tin nhắn trong MongoDB.
//   - KHÔNG đụng tới bảng "users" — tài khoản đăng nhập vẫn giữ nguyên.
//
// Đồng thời vá luôn lỗi mà seedSampleData.js mắc phải trước đây (seed xong
// "Xem" không được vì thiếu file gốc + storage_path): script này DÙNG LẠI
// đúng saveDocumentFile()/setDocumentStoragePath() từ document.service.js —
// same code path với upload bình thường qua UI — nên văn bản mẫu sinh ra từ
// đây luôn xem lại được ngay, không cần chạy thêm backfillSampleFileStorage.js
// nữa.
//
// Chạy (trong thư mục backend): npm run seed:reset
//   (tương đương: node src/db/resetAndSeed.js)
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import { pool } from "../config/db.js";
import { connectMongo } from "../config/mongodb.js";
import { Conversation } from "../models/conversation.model.js";
import { Message } from "../models/message.model.js";
import { splitIntoChunks } from "../services/chunk.service.js";
import { embedBatch, toPgVector } from "../services/embedding.service.js";
import { saveDocumentFile, setDocumentStoragePath } from "../services/document.service.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SAMPLE_DATA_DIR = path.resolve(__dirname, "../../sample-data");
const UPLOAD_DIR = path.resolve(__dirname, "../../uploads");

// 3 văn bản "chính sách nhân sự cơ bản" (không nhạy cảm) — giống danh sách
// trong seedSampleData.js. Xem README.md trong backend/sample-data/ để biết
// đầy đủ 6 file mẫu có sẵn (3 file còn lại minh hoạ tính năng "tài liệu nhạy
// cảm" và không được đưa vào đây).
const DOCS_TO_SEED = [
  { file: "quy-che-nghi-phep.txt", title: "Quy chế Nghỉ phép", category: "Nhân sự", isSensitive: false },
  { file: "noi-quy-lao-dong.txt", title: "Nội quy Lao động", category: "Nhân sự", isSensitive: false },
  {
    file: "quy-dinh-luong-thuong.txt",
    title: "Quy định Lương, Thưởng và Phúc lợi",
    category: "Nhân sự",
    isSensitive: false,
  },
];

async function resetPostgres() {
  console.log("→ Đang xoá toàn bộ văn bản + chunk cũ (PostgreSQL)...");
  // document_chunks có ON DELETE CASCADE theo document_id (xem schema.sql) nên
  // chỉ cần xoá bảng documents là đủ, chunk liên quan tự động bị xoá theo.
  const result = await pool.query(`DELETE FROM documents`);
  console.log(`  ✓ Đã xoá ${result.rowCount} văn bản (và toàn bộ chunk liên quan).`);
}

async function resetUploadsFolder() {
  console.log("→ Đang xoá file gốc cũ trong backend/uploads/...");
  await fs.rm(UPLOAD_DIR, { recursive: true, force: true });
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  console.log("  ✓ Đã dọn sạch backend/uploads/.");
}

async function resetMongo() {
  console.log("→ Đang xoá toàn bộ hội thoại + tin nhắn cũ (MongoDB)...");
  const [convResult, msgResult] = await Promise.all([Conversation.deleteMany({}), Message.deleteMany({})]);
  console.log(
    `  ✓ Đã xoá ${convResult.deletedCount} hội thoại và ${msgResult.deletedCount} tin nhắn. Tài khoản đăng nhập (users) được giữ nguyên.`
  );
}

async function seedOne(doc) {
  const filePath = path.join(SAMPLE_DATA_DIR, doc.file);
  const rawText = await fs.readFile(filePath, "utf-8");

  const docResult = await pool.query(
    `INSERT INTO documents (title, category, original_filename, is_sensitive, status, uploaded_by)
     VALUES ($1, $2, $3, $4, 'processing', NULL)
     RETURNING id`,
    [doc.title, doc.category, doc.file, doc.isSensitive]
  );
  const documentId = docResult.rows[0].id;

  // Lưu file gốc + ghi storage_path NGAY (giống hệt luồng upload qua UI) —
  // đây là bước mà seedSampleData.js (bản cũ) đã bỏ sót, khiến nút "Xem" bên
  // Admin không tải lại được file cho các văn bản seed thẳng vào DB.
  const storagePath = await saveDocumentFile(documentId, Buffer.from(rawText, "utf-8"), doc.file);
  await setDocumentStoragePath(documentId, storagePath);

  const chunks = splitIntoChunks(rawText);
  console.log(`  → [${doc.title}] ${chunks.length} chunk(s), đang tạo embedding...`);
  const embeddings = await embedBatch(chunks);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (let i = 0; i < chunks.length; i++) {
      await client.query(
        `INSERT INTO document_chunks (document_id, chunk_index, content, embedding)
         VALUES ($1, $2, $3, $4)`,
        [documentId, i, chunks[i], toPgVector(embeddings[i])]
      );
    }
    await client.query(`UPDATE documents SET status = 'ready', updated_at = now() WHERE id = $1`, [documentId]);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    await pool.query(`UPDATE documents SET status = 'failed', updated_at = now() WHERE id = $1`, [documentId]);
    throw err;
  } finally {
    client.release();
  }

  console.log(`  ✓ Đã lưu "${doc.title}" (document_id=${documentId}, storage_path=${storagePath}, ${chunks.length} chunk)`);
}

async function run() {
  console.log("=== RESET + SEED LẠI TỪ ĐẦU ===\n");

  await connectMongo();
  if (mongoose.connection.readyState !== 1) {
    throw new Error(
      "Chưa kết nối được MongoDB — kiểm tra MONGODB_URI trong .env rồi chạy lại (xem log lỗi phía trên)."
    );
  }

  await resetPostgres();
  await resetUploadsFolder();
  await resetMongo();

  console.log("\n→ Đang nạp lại bộ dữ liệu mẫu...\n");
  for (const doc of DOCS_TO_SEED) {
    await seedOne(doc);
  }

  console.log("\nHoàn tất! Database đã sạch và có lại đúng 3 văn bản mẫu, file gốc xem được ngay. Thử hỏi:");
  console.log('  - "Một năm được nghỉ phép bao nhiêu ngày?"');
  console.log('  - "Đi làm trễ bao nhiêu lần thì bị lập biên bản?"');
  console.log('  - "Lương thưởng Tết được tính như thế nào?"');

  await pool.end();
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error("\nReset + seed thất bại:", err);
  process.exit(1);
});
