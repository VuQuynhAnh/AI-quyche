// Sinh vector embedding cho một đoạn văn bản bằng model Gemini embedding
// (mặc định "gemini-embedding-001", cấu hình qua GEMINI_EMBEDDING_MODEL trong .env).
// Embedding là một mảng số (768 chiều) đại diện cho "ý nghĩa" của đoạn văn bản —
// hai đoạn văn bản có ý nghĩa gần nhau sẽ có vector gần nhau trong không gian này.
//
// Lưu ý: model "gemini-embedding-001" mặc định trả về vector 3072 chiều, trong khi
// bảng document_chunks (backend/src/db/schema.sql) được tạo sẵn cho vector 768 chiều
// (đúng với model cũ "text-embedding-004", đã bị Google deprecated từ 14/1/2026).
// Để không phải đổi schema Postgres, ta dùng tham số "outputDimensionality" mà
// "gemini-embedding-001" hỗ trợ để giới hạn output về đúng 768 chiều.
import { embeddingModel } from "../config/gemini.js";

// Số chiều embedding phải khớp với cột "embedding VECTOR(768)" trong schema.sql.
// Đọc từ .env (GEMINI_EMBEDDING_DIMENSIONS) để dễ đổi sau này nếu có migrate schema,
// mặc định là 768 để tương thích ngược với dữ liệu/schema hiện tại.
const EMBEDDING_DIMENSIONS = Number(process.env.GEMINI_EMBEDDING_DIMENSIONS) || 768;

export async function embedText(text) {
  try {
    const result = await embeddingModel.embedContent({
      content: { role: "user", parts: [{ text }] },
      outputDimensionality: EMBEDDING_DIMENSIONS,
    });
    return result.embedding.values; // mảng EMBEDDING_DIMENSIONS số thực (mặc định 768)
  } catch (err) {
    console.error("[embedding.service] Gọi Gemini embedding API thất bại:", err.message);
    throw new Error(
      "Không gọi được Gemini API để tạo embedding. Kiểm tra lại GEMINI_API_KEY trong file .env."
    );
  }
}

// Sinh embedding cho nhiều đoạn văn bản, giới hạn số lượng request chạy song song
// để tránh vượt rate-limit miễn phí của Gemini.
export async function embedBatch(texts, concurrency = 3) {
  const results = new Array(texts.length);
  let cursor = 0;

  async function worker() {
    while (cursor < texts.length) {
      const index = cursor++;
      results[index] = await embedText(texts[index]);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, texts.length) }, worker);
  await Promise.all(workers);
  return results;
}

// Chuyển mảng số JS thành literal mà pgvector hiểu, VD: [0.1,0.2,...] -> "[0.1,0.2,...]"
export function toPgVector(embeddingArray) {
  return `[${embeddingArray.join(",")}]`;
}
