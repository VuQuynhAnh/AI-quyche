// Truy cập bảng document (văn bản quy chế, riêng từng cửa hàng) và
// document_detail (các đoạn văn bản + vector embedding, tìm bằng pgvector).
import { DOCUMENT_PROCESSING_STATUS } from "../constants/enums.js";

// Chuyển mảng số JS thành literal mà pgvector hiểu, VD: [0.1,0.2,...] -> "[0.1,0.2,...]"
export function toPgVector(embeddingArray) {
  return `[${embeddingArray.join(",")}]`;
}

export function createDocumentRepository({ db }) {
  return {
    async create({ storeId, title, category, originalFileName, isSensitive, uploadedByAccountId }, executor = db) {
      const r = await executor.query(
        `INSERT INTO document (store_id, title, category, original_file_name, is_sensitive, uploaded_by_account_id)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [storeId, title, category, originalFileName, isSensitive, uploadedByAccountId]
      );
      return r.rows[0];
    },

    async setStoredFileName(id, storedFileName, executor = db) {
      await executor.query(`UPDATE document SET stored_file_name = $1, updated_at = now() WHERE id = $2`, [
        storedFileName,
        id,
      ]);
    },

    async setProcessingStatus(id, status, executor = db) {
      await executor.query(`UPDATE document SET processing_status = $1, updated_at = now() WHERE id = $2`, [
        status,
        id,
      ]);
    },

    async findInStore(id, storeId, executor = db) {
      const r = await executor.query(`SELECT * FROM document WHERE id = $1 AND store_id = $2 AND NOT is_deleted`, [id, storeId]);
      return r.rows[0] || null;
    },

    async listWithStats(storeId, executor = db) {
      const r = await executor.query(
        `SELECT d.id, d.title, d.category, d.original_file_name, d.is_sensitive, d.processing_status,
                d.created_at, a.full_name AS uploaded_by_name, COUNT(dd.id)::int AS chunk_count
         FROM document d
         LEFT JOIN account a ON a.id = d.uploaded_by_account_id
         LEFT JOIN document_detail dd ON dd.document_id = d.id AND NOT dd.is_deleted
         WHERE d.store_id = $1 AND NOT d.is_deleted
         GROUP BY d.id, a.full_name
         ORDER BY d.created_at DESC`,
        [storeId]
      );
      return r.rows;
    },

    async countByStatus(storeId, executor = db) {
      const r = await executor.query(
        `SELECT processing_status AS status, COUNT(*)::int AS count
         FROM document WHERE store_id = $1 AND NOT is_deleted GROUP BY processing_status`,
        [storeId]
      );
      return r.rows;
    },

    // Xoá MỀM văn bản + các đoạn của nó: chatbot không dùng nữa, nhưng vẫn giữ
    // lại để đối soát các câu trả lời cũ đã trích dẫn văn bản này
    async softDeleteById(id, executor = db) {
      await executor.query(
        `UPDATE document SET is_deleted = true, deleted_at = now(), updated_at = now() WHERE id = $1 AND NOT is_deleted`,
        [id]
      );
      await executor.query(
        `UPDATE document_detail SET is_deleted = true, deleted_at = now() WHERE document_id = $1 AND NOT is_deleted`,
        [id]
      );
    },

    // ---------- Chi tiết (đoạn văn bản) ----------
    async insertDetail({ documentId, chunkIndex, content, embedding }, executor = db) {
      await executor.query(
        `INSERT INTO document_detail (document_id, chunk_index, content, embedding) VALUES ($1, $2, $3, $4)`,
        [documentId, chunkIndex, content, toPgVector(embedding)]
      );
    },

    async findDetailContents(documentId, executor = db) {
      const r = await executor.query(
        `SELECT content FROM document_detail WHERE document_id = $1 AND NOT is_deleted ORDER BY chunk_index`,
        [documentId]
      );
      return r.rows.map((row) => row.content);
    },

    // Đoạn thuộc tài liệu NHẠY CẢM (của cửa hàng) gần nghĩa nhất với embedding
    async findClosestSensitiveDetail(storeId, embedding, executor = db) {
      const r = await executor.query(
        `SELECT d.id AS document_id, d.title AS document_title,
                1 - (dd.embedding <=> $2) AS similarity
         FROM document_detail dd
         JOIN document d ON d.id = dd.document_id
         WHERE d.store_id = $1 AND d.processing_status = $3 AND d.is_sensitive = true
           AND NOT d.is_deleted AND NOT dd.is_deleted
         ORDER BY dd.embedding <=> $2
         LIMIT 1`,
        [storeId, toPgVector(embedding), DOCUMENT_PROCESSING_STATUS.READY]
      );
      return r.rows[0] || null;
    },

    // `limit` đoạn thuộc tài liệu THÔNG THƯỜNG (của cửa hàng) gần nghĩa nhất
    async findClosestPublicDetails(storeId, embedding, limit, executor = db) {
      const r = await executor.query(
        `SELECT dd.id, dd.content, dd.chunk_index, d.id AS document_id, d.title AS document_title,
                1 - (dd.embedding <=> $2) AS similarity
         FROM document_detail dd
         JOIN document d ON d.id = dd.document_id
         WHERE d.store_id = $1 AND d.processing_status = $3 AND d.is_sensitive = false
           AND NOT d.is_deleted AND NOT dd.is_deleted
         ORDER BY dd.embedding <=> $2
         LIMIT $4`,
        [storeId, toPgVector(embedding), DOCUMENT_PROCESSING_STATUS.READY, limit]
      );
      return r.rows;
    },
  };
}
