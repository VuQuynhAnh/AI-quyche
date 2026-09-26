// Chèn thẳng bộ dữ liệu mẫu (chính sách nhân sự cơ bản) vào Postgres:
// đọc file .txt có sẵn trong backend/sample-data/, tách chunk, tạo embedding
// và lưu vào documents + document_chunks — dùng ĐÚNG các hàm service đang
// chạy thật trong app (chunk.service.js, embedding.service.js, config/db.js)
// nên kết quả giống hệt như khi upload qua giao diện Admin, chỉ là bỏ qua
// bước thao tác trên UI.
//
// Chạy (trong thư mục backend): node src/db/seedSampleData.js
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { pool } from "../config/db.js";
import { splitIntoChunks } from "../services/chunk.service.js";
import { embedBatch, toPgVector } from "../services/embedding.service.js";
import { extractText } from "../services/textExtract.service.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SAMPLE_DATA_DIR = path.resolve(__dirname, "../../sample-data");
const DOCX_MIMETYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

// Chỉ 3 văn bản "chính sách nhân sự cơ bản" (không nhạy cảm) trong số các file
// mẫu có sẵn ở backend/sample-data/ — xem README.md trong thư mục đó để biết
// đầy đủ 6 file mẫu (gồm cả file minh hoạ tính năng "tài liệu nhạy cảm").
// LƯU Ý: file mẫu đã đổi từ .txt sang .docx — xem seed.js (script chính, chạy
// bằng `npm run seed`) để biết luồng đầy đủ và khuyến nghị dùng thay cho script
// này (script này KHÔNG lưu file gốc/storage_path, chỉ chèn thẳng vào DB).
const DOCS_TO_SEED = [
  { file: "quy-che-nghi-phep.docx", title: "Quy chế Nghỉ phép", category: "Nhân sự", isSensitive: false },
  { file: "noi-quy-lao-dong.docx", title: "Nội quy Lao động", category: "Nhân sự", isSensitive: false },
  {
    file: "quy-dinh-luong-thuong.docx",
    title: "Quy định Lương, Thưởng và Phúc lợi",
    category: "Nhân sự",
    isSensitive: false,
  },
];

async function seedOne(doc) {
  const filePath = path.join(SAMPLE_DATA_DIR, doc.file);
  // Đọc dưới dạng buffer nhị phân (.docx là ZIP/XML) rồi trích xuất text bằng
  // mammoth (extractText) — đọc thẳng utf-8 như trước sẽ ra dữ liệu vô nghĩa.
  const fileBuffer = fs.readFileSync(filePath);
  const rawText = await extractText(fileBuffer, DOCX_MIMETYPE, doc.file);

  const existing = await pool.query(
    `SELECT id, status FROM documents WHERE original_filename = $1 ORDER BY created_at DESC LIMIT 1`,
    [doc.file]
  );
  if (existing.rows.length > 0 && existing.rows[0].status === "ready") {
    console.log(`  - Bỏ qua (đã seed sẵn, status=ready): ${doc.file}`);
    return;
  }

  const docResult = await pool.query(
    `INSERT INTO documents (title, category, original_filename, is_sensitive, status, uploaded_by)
     VALUES ($1, $2, $3, $4, 'processing', NULL)
     RETURNING id`,
    [doc.title, doc.category, doc.file, doc.isSensitive]
  );
  const documentId = docResult.rows[0].id;

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
    await client.query(`UPDATE documents SET status = 'ready', updated_at = now() WHERE id = $1`, [
      documentId,
    ]);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    await pool.query(`UPDATE documents SET status = 'failed', updated_at = now() WHERE id = $1`, [
      documentId,
    ]);
    throw err;
  } finally {
    client.release();
  }

  console.log(`  ✓ Đã lưu "${doc.title}" (document_id=${documentId}, ${chunks.length} chunk)`);
}

async function run() {
  console.log("→ Đang chèn bộ dữ liệu mẫu (chính sách nhân sự cơ bản) vào database...\n");
  for (const doc of DOCS_TO_SEED) {
    await seedOne(doc);
  }
  console.log("\nHoàn tất! Vào trang chat và thử hỏi, ví dụ:");
  console.log('  - "Một năm được nghỉ phép bao nhiêu ngày?"');
  console.log('  - "Đi làm trễ bao nhiêu lần thì bị lập biên bản?"');
  console.log('  - "Lương thưởng Tết được tính như thế nào?"');
  await pool.end();
}

run().catch((err) => {
  console.error("\nSeed thất bại:", err);
  process.exit(1);
});
