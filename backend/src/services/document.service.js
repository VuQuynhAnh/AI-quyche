// Pipeline xử lý 1 văn bản mới upload:
// upload -> trích xuất text -> tách chunk -> tạo embedding -> lưu DB
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { pool, query } from "../config/db.js";
import { extractText } from "./textExtract.service.js";
import { splitIntoChunks } from "./chunk.service.js";
import { embedBatch, toPgVector } from "./embedding.service.js";

// Thư mục lưu file gốc — backend/uploads/ (tính tương đối theo vị trí file
// này, KHÔNG theo thư mục đang chạy lệnh, để luôn đúng dù chạy `node` từ đâu).
// Đây là lưu trữ dạng "file cục bộ trên đĩa", đơn giản và dễ hiểu cho mục đích
// giảng dạy — hệ thống thật ở quy mô lớn nên dùng object storage (S3, GCS...).
const UPLOAD_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../uploads");

async function ensureUploadDir() {
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
}

export function resolveUploadPath(storagePath) {
  return path.join(UPLOAD_DIR, storagePath);
}

// Lưu buffer file (đang giữ tạm trong bộ nhớ lúc upload — xem multer.memoryStorage
// ở documents.routes.js) xuống đĩa, đặt tên theo ID tài liệu để không bao giờ
// trùng nhau. Trả về tên file (storage_path) để lưu vào cột documents.storage_path.
export async function saveDocumentFile(documentId, buffer, originalFilename) {
  await ensureUploadDir();
  const ext = path.extname(originalFilename || "");
  const safeExt = ext.length > 0 && ext.length <= 10 ? ext : "";
  const storagePath = `${documentId}${safeExt}`;
  await fs.writeFile(resolveUploadPath(storagePath), buffer);
  return storagePath;
}

export async function setDocumentStoragePath(documentId, storagePath) {
  await query(`UPDATE documents SET storage_path = $1 WHERE id = $2`, [storagePath, documentId]);
}

// Lấy thông tin cần thiết để phục vụ tải file gốc (dùng bởi
// routes/documentFiles.routes.js) — CHỈ những cột cần thiết, không kèm nội
// dung chunk/embedding.
export async function getDocumentFile(documentId) {
  const result = await query(
    `SELECT id, title, original_filename, storage_path, is_sensitive, status
     FROM documents WHERE id = $1`,
    [documentId]
  );
  return result.rows[0] || null;
}

export async function createDocumentRecord({
  title,
  category,
  originalFilename,
  uploadedBy,
  isSensitive,
}) {
  const result = await query(
    `INSERT INTO documents (title, category, original_filename, is_sensitive, status, uploaded_by)
     VALUES ($1, $2, $3, $4, 'processing', $5)
     RETURNING id, title, category, original_filename, is_sensitive, status, created_at`,
    [title, category || null, originalFilename || null, Boolean(isSensitive), uploadedBy || null]
  );
  return result.rows[0];
}

// Chạy nền: xử lý nội dung file và lưu các chunk + embedding.
// Tách riêng khỏi request HTTP để không bắt người dùng chờ (upload xong trả về ngay,
// trạng thái tài liệu sẽ chuyển 'processing' -> 'ready' sau vài giây/phút).
export async function processDocumentAsync(documentId, buffer, mimetype, filename) {
  try {
    const rawText = await extractText(buffer, mimetype, filename);
    const chunks = splitIntoChunks(rawText);

    if (chunks.length === 0) {
      throw new Error("Không trích xuất được nội dung văn bản (file rỗng hoặc lỗi định dạng).");
    }

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
      await client.query(
        `UPDATE documents SET status = 'ready', updated_at = now() WHERE id = $1`,
        [documentId]
      );
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error(`[document.service] Xử lý tài liệu ${documentId} thất bại:`, err.message);
    await query(`UPDATE documents SET status = 'failed', updated_at = now() WHERE id = $1`, [
      documentId,
    ]).catch(() => {});
  }
}

// Ghép lại toàn bộ nội dung đã trích xuất của 1 văn bản từ các chunk đã lưu
// (theo đúng thứ tự chunk_index) — phục vụ tính năng "xem trước" nội dung văn
// bản NGAY TRONG TRÌNH DUYỆT (routes/documentFiles.routes.js, route
// "/:id/preview"), KHÔNG cần tải file gốc về máy. Cách này còn có 1 lợi ích
// phụ: hoạt động được với CẢ những văn bản không có file gốc trên đĩa (VD:
// văn bản seed thẳng vào DB) vì chỉ cần đọc lại chunk đã tách sẵn, không đụng
// tới storage_path/file trên đĩa như route "/:id/download".
export async function getDocumentFullText(documentId) {
  const result = await query(
    `SELECT content FROM document_chunks WHERE document_id = $1 ORDER BY chunk_index`,
    [documentId]
  );
  return result.rows.map((r) => r.content).join("\n\n");
}

export async function listDocuments() {
  const result = await query(
    `SELECT d.id, d.title, d.category, d.original_filename, d.is_sensitive, d.status, d.created_at,
            u.full_name AS uploaded_by_name,
            COUNT(c.id)::int AS chunk_count
     FROM documents d
     LEFT JOIN users u ON u.id = d.uploaded_by
     LEFT JOIN document_chunks c ON c.document_id = d.id
     GROUP BY d.id, u.full_name
     ORDER BY d.created_at DESC`
  );
  return result.rows;
}

export async function deleteDocument(documentId) {
  // Xoá file gốc trên đĩa TRƯỚC khi xoá bản ghi DB (đọc storage_path xong mới
  // xoá bản ghi) — nếu bỏ sót bước này, file sẽ nằm lại vĩnh viễn trong thư
  // mục uploads/ mà không có cách nào dọn dẹp qua giao diện quản trị nữa.
  const doc = await getDocumentFile(documentId);
  await query(`DELETE FROM documents WHERE id = $1`, [documentId]);
  if (doc?.storage_path) {
    await fs.unlink(resolveUploadPath(doc.storage_path)).catch(() => {});
  }
}
