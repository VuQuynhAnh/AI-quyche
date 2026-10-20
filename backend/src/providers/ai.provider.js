// Kết nối tới Google Gemini — tầng "provider" cho dịch vụ bên ngoài (giống
// repository nhưng cho API thay vì DB): chỉ gọi API, xử lý retry/thông báo lỗi
// kỹ thuật; KHÔNG chứa logic nghiệp vụ (prompt nào, khi nào gọi... nằm ở service).
//
// Embedding là một mảng số (mặc định 768 chiều) đại diện cho "ý nghĩa" của đoạn
// văn bản — hai đoạn văn bản có ý nghĩa gần nhau sẽ có vector gần nhau.
// Model "gemini-embedding-001" mặc định trả về 3072 chiều, trong khi bảng
// document_chunks (db/schema.sql) tạo cho VECTOR(768) — dùng tham số
// "outputDimensionality" để giới hạn output về đúng số chiều của schema.

// Gemini thỉnh thoảng trả lỗi 503 "quá tải tạm thời" (nhất là model mới ra mắt,
// nhiều người dùng cùng lúc) — lỗi này KHÔNG phải do API key/model sai, chỉ cần
// thử lại sau vài giây là thường sẽ được, nên ta tự động retry vài lần trước
// khi báo lỗi cho người dùng.
const MAX_GEMINI_RETRIES = 3;
const GEMINI_RETRY_DELAY_MS = 2000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientGeminiError(err) {
  const msg = err?.message || "";
  return /503|overloaded|high demand|UNAVAILABLE/i.test(msg);
}

export function createAiProvider({
  chatModel,
  embeddingModel,
  embeddingDimensions = Number(process.env.GEMINI_EMBEDDING_DIMENSIONS) || 768,
}) {
  async function embedText(text) {
    try {
      const result = await embeddingModel.embedContent({
        content: { role: "user", parts: [{ text }] },
        outputDimensionality: embeddingDimensions,
      });
      return result.embedding.values;
    } catch (err) {
      console.error("[ai.provider] Gọi Gemini embedding API thất bại:", err.message);
      throw new Error(
        "Không gọi được Gemini API để tạo embedding. Kiểm tra lại GEMINI_API_KEY trong file .env."
      );
    }
  }

  // Sinh embedding cho nhiều đoạn văn bản, giới hạn số lượng request chạy song
  // song để tránh vượt rate-limit miễn phí của Gemini.
  async function embedBatch(texts, concurrency = 3) {
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

  // Gọi Gemini 1 lần, trả về text (ném nguyên lỗi gốc nếu thất bại)
  async function generateTextOnce(prompt) {
    const result = await chatModel.generateContent(prompt);
    return result.response.text();
  }

  // Gọi Gemini sinh text, tự thử lại khi quá tải tạm thời (503). Ném Error với
  // thông báo tiếng Việt dễ hiểu nếu vẫn thất bại.
  async function generateText(prompt) {
    let lastErr = null;
    for (let attempt = 1; attempt <= MAX_GEMINI_RETRIES; attempt++) {
      try {
        return await generateTextOnce(prompt);
      } catch (err) {
        lastErr = err;
        if (isTransientGeminiError(err) && attempt < MAX_GEMINI_RETRIES) {
          console.warn(
            `[ai.provider] Gemini chat API quá tải (lần ${attempt}/${MAX_GEMINI_RETRIES}), thử lại sau ${GEMINI_RETRY_DELAY_MS * attempt}ms...`
          );
          await sleep(GEMINI_RETRY_DELAY_MS * attempt); // backoff tăng dần
        } else {
          break;
        }
      }
    }

    console.error("[ai.provider] Gọi Gemini chat API thất bại:", lastErr.message);
    if (isTransientGeminiError(lastErr)) {
      throw new Error(
        "Gemini đang quá tải tạm thời (lỗi 503 - high demand), đã tự thử lại vài lần nhưng chưa được. " +
          "Đây không phải lỗi cấu hình — vui lòng đợi khoảng 1-2 phút rồi hỏi lại."
      );
    }
    throw new Error(
      "Không gọi được Gemini API để sinh câu trả lời. Kiểm tra lại GEMINI_API_KEY trong file .env."
    );
  }

  return { embedText, embedBatch, generateText, generateTextOnce };
}
