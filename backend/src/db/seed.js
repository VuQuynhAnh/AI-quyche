// Script khởi tạo/RESET TOÀN BỘ dữ liệu về 1 trạng thái sạch, biết trước —
// chạy 1 lệnh duy nhất mỗi khi cần "làm lại từ đầu" để test/demo:
//  1. Chạy schema.sql để tạo bảng (idempotent — chạy lại nhiều lần không lỗi)
//  2. Tạo sẵn 1 tài khoản admin + 1 tài khoản nhân viên để đăng nhập thử ngay
//     (bỏ qua nếu email đã tồn tại — KHÔNG xoá tài khoản cũ, giữ nguyên mật
//     khẩu/đăng nhập hiện có qua mỗi lần chạy lại).
//  3. XOÁ SẠCH toàn bộ văn bản + chunk trong PostgreSQL (kể cả văn bản admin
//     tự tải lên sau này, không chỉ văn bản mẫu) và toàn bộ file gốc trong
//     backend/uploads/.
//  4. XOÁ SẠCH toàn bộ hội thoại + tin nhắn trong MongoDB.
//  5. Nạp lại 3 văn bản mẫu (chính sách nhân sự cơ bản), lưu file gốc +
//     storage_path đúng ngay từ đầu (dùng chung code với luồng upload bình
//     thường qua UI — saveDocumentFile()/setDocumentStoragePath() trong
//     document.service.js) nên nút "Xem" bên Admin luôn xem lại được ngay,
//     không như cách seed thẳng vào DB trước đây.
//
// Chạy bằng: npm run seed  (trong thư mục backend)
import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { pool } from "../config/db.js";
import { connectMongo } from "../config/mongodb.js";
import { Conversation } from "../models/conversation.model.js";
import { Message } from "../models/message.model.js";
import { splitIntoChunks } from "../services/chunk.service.js";
import { embedBatch, toPgVector } from "../services/embedding.service.js";
import { saveDocumentFile, setDocumentStoragePath } from "../services/document.service.js";
import { extractText } from "../services/textExtract.service.js";

const DOCX_MIMETYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SAMPLE_DATA_DIR = path.resolve(__dirname, "../../sample-data");
const UPLOAD_DIR = path.resolve(__dirname, "../../uploads");

const DEMO_USERS = [
  { fullName: "Quản trị viên Demo", email: "admin@congty.vn", password: "Admin@123", role: "admin" },
  { fullName: "Nhân viên Demo", email: "nhanvien@congty.vn", password: "NhanVien@123", role: "employee" },
];

// TOÀN BỘ 6 file mẫu có sẵn ở backend/sample-data/ (xem README.md trong thư
// mục đó) — gồm 5 văn bản thông thường và 1 văn bản nhạy cảm dùng để minh hoạ
// tính năng "tài liệu nhạy cảm" (isSensitive: true — chatbot sẽ KHÔNG tự trả
// lời câu hỏi liên quan, mà chuyển cho quản trị viên xử lý trực tiếp).
// Lưu ý: bộ file mẫu đã đổi từ .txt sang .docx (xem sample-data/README.md) —
// seedOneDocument() bên dưới trích xuất text bằng extractText() (mammoth),
// giống hệt luồng upload DOCX thật qua UI, thay vì đọc thẳng utf-8 như trước.
const DOCS_TO_SEED = [
  { file: "quy-che-nghi-phep.docx", title: "Quy chế Nghỉ phép", category: "Nhân sự", isSensitive: false },
  { file: "noi-quy-lao-dong.docx", title: "Nội quy Lao động", category: "Nhân sự", isSensitive: false },
  {
    file: "quy-dinh-luong-thuong.docx",
    title: "Quy định Lương, Thưởng và Phúc lợi",
    category: "Nhân sự",
    isSensitive: false,
  },
  {
    file: "quy-dinh-an-toan-thong-tin.docx",
    title: "Quy định An toàn Thông tin",
    category: "An toàn thông tin",
    isSensitive: false,
  },
  {
    file: "quy-trinh-lam-viec-tu-xa.docx",
    title: "Quy trình Đăng ký Làm việc Từ xa",
    category: "Nhân sự",
    isSensitive: false,
  },
  {
    file: "ho-so-luong-thuong-ca-nhan.docx",
    title: "Hồ sơ Lương thưởng Cá nhân (Ví dụ minh hoạ)",
    category: "Nhân sự",
    isSensitive: true,
  },
];

async function setupSchemaAndUsers() {
  console.log("→ Đang tạo bảng từ schema.sql ...");
  const schemaSql = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf-8");
  await pool.query(schemaSql);
  console.log("✓ Đã tạo/kiểm tra xong bảng.");

  console.log("→ Đang tạo tài khoản demo (bỏ qua nếu đã có) ...");
  for (const u of DEMO_USERS) {
    const existing = await pool.query("SELECT id FROM users WHERE email = $1", [u.email]);
    if (existing.rows.length > 0) {
      console.log(`  - Bỏ qua (đã tồn tại): ${u.email}`);
      continue;
    }
    const passwordHash = await bcrypt.hash(u.password, 10);
    await pool.query(
      `INSERT INTO users (full_name, email, password_hash, role) VALUES ($1, $2, $3, $4)`,
      [u.fullName, u.email, passwordHash, u.role]
    );
    console.log(`  ✓ Đã tạo: ${u.email} (mật khẩu: ${u.password}, role: ${u.role})`);
  }
}

async function resetDocuments() {
  console.log("\n→ Đang xoá toàn bộ văn bản + chunk cũ (PostgreSQL)...");
  // document_chunks có ON DELETE CASCADE theo document_id (xem schema.sql) nên
  // chỉ cần xoá bảng documents là đủ, chunk liên quan tự động bị xoá theo.
  const result = await pool.query(`DELETE FROM documents`);
  console.log(`  ✓ Đã xoá ${result.rowCount} văn bản (và toàn bộ chunk liên quan).`);

  console.log("→ Đang xoá file gốc cũ trong backend/uploads/...");
  await fsp.rm(UPLOAD_DIR, { recursive: true, force: true });
  await fsp.mkdir(UPLOAD_DIR, { recursive: true });
  console.log("  ✓ Đã dọn sạch backend/uploads/.");
}

async function resetConversations() {
  console.log("→ Đang xoá toàn bộ hội thoại + tin nhắn cũ (MongoDB)...");
  const [convResult, msgResult] = await Promise.all([Conversation.deleteMany({}), Message.deleteMany({})]);
  console.log(
    `  ✓ Đã xoá ${convResult.deletedCount} hội thoại và ${msgResult.deletedCount} tin nhắn. Tài khoản đăng nhập (users) được giữ nguyên.`
  );
}

async function seedOneDocument(doc) {
  const filePath = path.join(SAMPLE_DATA_DIR, doc.file);
  // Đọc dưới dạng buffer NHỊ PHÂN (không phải utf-8) vì file mẫu giờ là .docx
  // (định dạng ZIP/XML) — đọc thẳng utf-8 như trước sẽ ra dữ liệu vô nghĩa.
  const fileBuffer = await fsp.readFile(filePath);
  // Trích xuất text thuần bằng đúng hàm dùng cho luồng upload DOCX thật qua UI
  // (mammoth, xem services/textExtract.service.js) để tách chunk/embedding.
  const rawText = await extractText(fileBuffer, DOCX_MIMETYPE, doc.file);

  const docResult = await pool.query(
    `INSERT INTO documents (title, category, original_filename, is_sensitive, status, uploaded_by)
     VALUES ($1, $2, $3, $4, 'processing', NULL)
     RETURNING id`,
    [doc.title, doc.category, doc.file, doc.isSensitive]
  );
  const documentId = docResult.rows[0].id;

  // Lưu file gốc (buffer .docx THẬT, không phải bản text đã trích xuất) + ghi
  // storage_path NGAY (giống hệt luồng upload qua UI) — để nút "Xem"/"Tải" bên
  // Admin mở lại đúng file .docx gốc của các văn bản mẫu này.
  const storagePath = await saveDocumentFile(documentId, fileBuffer, doc.file);
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
  await setupSchemaAndUsers();

  await connectMongo();
  if (mongoose.connection.readyState !== 1) {
    throw new Error(
      "Chưa kết nối được MongoDB — kiểm tra MONGODB_URI trong .env rồi chạy lại (xem log lỗi phía trên)."
    );
  }

  await resetDocuments();
  await resetConversations();

  console.log("\n→ Đang nạp lại bộ văn bản mẫu...\n");
  for (const doc of DOCS_TO_SEED) {
    await seedOneDocument(doc);
  }

  console.log("\nHoàn tất! Database đã được reset sạch và nạp lại từ đầu.");
  console.log("Tài khoản để đăng nhập thử:");
  DEMO_USERS.forEach((u) => console.log(`  - ${u.role.padEnd(9)} | ${u.email} / ${u.password}`));
  console.log(`Đã có sẵn cả ${DOCS_TO_SEED.length} văn bản mẫu (kể cả 1 văn bản nhạy cảm để demo), thử hỏi:`);
  console.log('  - "Một năm được nghỉ phép bao nhiêu ngày?"');
  console.log('  - "Đi làm trễ bao nhiêu lần thì bị lập biên bản?"');
  console.log('  - "Lương thưởng Tết được tính như thế nào?"');

  await pool.end();
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error("Seed thất bại:", err);
  process.exit(1);
});
