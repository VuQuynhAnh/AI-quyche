// Lõi RAG (Retrieval-Augmented Generation):
// 1. Biến câu hỏi thành embedding
// 2. Kiểm tra xem câu hỏi có khớp với TÀI LIỆU NHẠY CẢM không (is_sensitive = true)
//    → nếu có, từ chối trả lời tự động và đề nghị liên hệ admin, KHÔNG gửi nội
//      dung nhạy cảm cho Gemini (tránh rò rỉ dữ liệu nhạy cảm ra ngoài hệ thống).
// 3. Nếu không, tìm các đoạn văn bản (chunk) gần nghĩa nhất trong nhóm tài liệu
//    THÔNG THƯỜNG (is_sensitive = false) bằng pgvector cosine distance
// 4. Ghép các đoạn đó thành "ngữ cảnh" rồi đưa cho Gemini kèm câu hỏi
// 5. Yêu cầu Gemini CHỈ trả lời dựa trên ngữ cảnh, có trích dẫn nguồn tài liệu
import { query } from "../config/db.js";
import { embedText, toPgVector } from "./embedding.service.js";
import { chatModel } from "../config/gemini.js";
import {
  isPersonalDataQuestion,
  loadPersonalFacts,
  fallbackAnswer,
  sourceFooter,
} from "./personalData.service.js";

const TOP_K = 5;

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

// Ngưỡng tương đồng (cosine similarity, giá trị 0..1, càng gần 1 càng giống)
// để coi là câu hỏi "trùng chủ đề" với 1 tài liệu nhạy cảm. Đây là một ngưỡng
// đơn giản (heuristic) — trong thực tế nên tinh chỉnh lại dựa trên dữ liệu
// thật, hoặc dùng thêm bước phân loại chủ đề (classification) thay vì chỉ dựa
// vào 1 con số cố định.
const SENSITIVE_MATCH_THRESHOLD = 0.72;

// Tìm đoạn văn bản NHẠY CẢM (is_sensitive = true) gần nghĩa nhất với câu hỏi.
// Chỉ lấy 1 kết quả tốt nhất — chỉ cần biết CÓ khớp hay không, không cần nội
// dung chi tiết (nội dung nhạy cảm không nên đưa vào prompt gửi cho Gemini).
async function findClosestSensitiveMatch(questionEmbedding) {
  const vectorLiteral = toPgVector(questionEmbedding);
  const result = await query(
    `SELECT d.id AS document_id, d.title AS document_title,
            1 - (c.embedding <=> $1) AS similarity
     FROM document_chunks c
     JOIN documents d ON d.id = c.document_id
     WHERE d.status = 'ready' AND d.is_sensitive = true
     ORDER BY c.embedding <=> $1
     LIMIT 1`,
    [vectorLiteral]
  );
  return result.rows[0] || null;
}

// Tìm các đoạn văn bản THÔNG THƯỜNG (is_sensitive = false) gần nghĩa nhất —
// đây là nguồn duy nhất chatbot được phép dùng để tự sinh câu trả lời.
async function retrieveRelevantChunks(questionEmbedding) {
  const vectorLiteral = toPgVector(questionEmbedding);
  const result = await query(
    `SELECT c.id, c.content, c.chunk_index, d.id AS document_id, d.title AS document_title,
            1 - (c.embedding <=> $1) AS similarity
     FROM document_chunks c
     JOIN documents d ON d.id = c.document_id
     WHERE d.status = 'ready' AND d.is_sensitive = false
     ORDER BY c.embedding <=> $1
     LIMIT $2`,
    [vectorLiteral, TOP_K]
  );
  return result.rows;
}

// Gọi Gemini sinh câu trả lời, tự thử lại khi quá tải tạm thời (503). Ném Error
// với thông báo tiếng Việt dễ hiểu nếu vẫn thất bại.
async function generateWithRetry(prompt) {
  let lastErr = null;
  for (let attempt = 1; attempt <= MAX_GEMINI_RETRIES; attempt++) {
    try {
      const result = await chatModel.generateContent(prompt);
      return result.response.text();
    } catch (err) {
      lastErr = err;
      if (isTransientGeminiError(err) && attempt < MAX_GEMINI_RETRIES) {
        console.warn(
          `[rag.service] Gemini chat API quá tải (lần ${attempt}/${MAX_GEMINI_RETRIES}), thử lại sau ${GEMINI_RETRY_DELAY_MS * attempt}ms...`
        );
        await sleep(GEMINI_RETRY_DELAY_MS * attempt); // backoff tăng dần
      } else {
        break;
      }
    }
  }

  console.error("[rag.service] Gọi Gemini chat API thất bại:", lastErr.message);
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

function buildPrompt(question, chunks) {
  const context = chunks
    .map(
      (c, i) =>
        `[Nguồn ${i + 1} - "${c.document_title}"]\n${c.content}`
    )
    .join("\n\n---\n\n");

  return `Bạn là trợ lý AI nội bộ, chuyên giải đáp câu hỏi về quy chế và văn bản nội bộ doanh nghiệp.

QUY TẮC BẮT BUỘC:
- Chỉ trả lời dựa trên nội dung trong phần "TÀI LIỆU THAM KHẢO" bên dưới.
- Nếu tài liệu không chứa thông tin liên quan, hãy trả lời rõ: "Tôi không tìm thấy quy định liên quan trong tài liệu nội bộ hiện có." Không tự suy đoán hay bịa thông tin.
- Trả lời ngắn gọn, rõ ràng, đúng trọng tâm câu hỏi.
- Cuối câu trả lời, liệt kê các nguồn đã dùng theo định dạng: "Nguồn: <tên tài liệu>".

TÀI LIỆU THAM KHẢO:
${context}

CÂU HỎI CỦA NHÂN VIÊN:
${question}`;
}

// Câu hỏi về dữ liệu CÁ NHÂN (lương, đi muộn, về sớm...). Số liệu do code tính
// từ hệ thống chấm công của CHÍNH người hỏi (userId lấy từ JWT) — Gemini chỉ
// diễn đạt lại. Nếu câu hỏi có thể đụng cả quy chế (VD "đi muộn 3 lần có bị
// phạt theo quy chế không?") thì kèm thêm tài liệu THƯỜNG (không nhạy cảm).
async function answerPersonalQuestion(question, user) {
  const facts = await loadPersonalFacts(user.id, question);

  let chunks = [];
  try {
    chunks = await retrieveRelevantChunks(await embedText(question));
  } catch (err) {
    // Không có tài liệu/embedding lỗi thì vẫn trả lời được phần số liệu
    console.warn("[rag.service] Bỏ qua tra cứu quy chế cho câu hỏi cá nhân:", err.message);
  }

  const policy = chunks.length
    ? chunks.map((c, i) => `[Nguồn ${i + 1} - "${c.document_title}"]\n${c.content}`).join("\n\n---\n\n")
    : "(không có)";

  const prompt = `Bạn là trợ lý chấm công nội bộ, trả lời nhân viên bằng tiếng Việt, ngắn gọn, thân thiện.

QUY TẮC BẮT BUỘC:
- Mọi con số (tiền, phút, giờ, số ngày) CHỈ lấy từ "DỮ LIỆU CHẤM CÔNG" bên dưới và phải giữ NGUYÊN, không tự tính lại, không làm tròn, không suy đoán.
- Nếu dữ liệu ghi "TẠM TÍNH", nói rõ đây là số tạm tính.
- Nếu không có dữ liệu cho kỳ được hỏi, nói rõ là chưa có dữ liệu chấm công.
- Nếu câu hỏi liên quan quy định/chính sách, chỉ dùng "TÀI LIỆU THAM KHẢO"; không có thì nói không tìm thấy quy định. Khi dùng tài liệu, cuối câu liệt kê "Nguồn: <tên tài liệu>".
- Chỉ nói về dữ liệu của chính người đang hỏi. Không bịa thêm thông tin nào khác.

DỮ LIỆU CHẤM CÔNG:
${facts.text}

TÀI LIỆU THAM KHẢO:
${policy}

CÂU HỎI CỦA NHÂN VIÊN:
${question}`;

  let answer;
  try {
    answer = (await generateWithRetry(prompt)) + sourceFooter(facts);
  } catch (err) {
    // AI lỗi/quá tải/hết quota: trả thẳng số liệu thô thay vì báo lỗi
    console.warn("[rag.service] Gemini lỗi, dùng câu trả lời dự phòng:", err.message);
    answer = fallbackAnswer(facts);
  }

  const sources = [
    ...new Map(
      chunks.map((c) => [c.document_id, { documentId: c.document_id, title: c.document_title }])
    ).values(),
  ];
  return { answer, sources: answer.includes("Nguồn:") ? sources : [], escalate: false };
}

// Kết quả trả về gồm:
//  - answer      : nội dung trả lời (text)
//  - sources     : danh sách tài liệu đã dùng để trả lời (rỗng nếu escalate)
//  - escalate    : true nếu câu hỏi cần chuyển cho admin xử lý trực tiếp
//                  (do khớp tài liệu nhạy cảm) — chat.routes.js sẽ dùng cờ này
//                  để tự động gắn trạng thái "flagged" cho hội thoại.
export async function answerQuestion(question, user) {
  // Câu hỏi về lương/đi muộn/công của CHÍNH nhân viên -> đi đường dữ liệu chấm
  // công, đặt TRƯỚC bước kiểm tra tài liệu nhạy cảm (nếu không, "lương của tôi"
  // sẽ bị nhầm với hợp đồng lương cá nhân và chuyển cho admin). Admin không có
  // dữ liệu chấm công nên vẫn đi đường RAG như cũ.
  if (user?.role === "employee" && isPersonalDataQuestion(question)) {
    return answerPersonalQuestion(question, user);
  }

  const questionEmbedding = await embedText(question);

  // Bước 1: kiểm tra câu hỏi có đụng tới tài liệu nhạy cảm không — kiểm tra
  // TRƯỚC khi tìm/gửi bất kỳ nội dung nào cho Gemini để đảm bảo dữ liệu nhạy
  // cảm không bao giờ rời khỏi hệ thống qua prompt AI.
  const sensitiveMatch = await findClosestSensitiveMatch(questionEmbedding);
  if (sensitiveMatch && sensitiveMatch.similarity >= SENSITIVE_MATCH_THRESHOLD) {
    return {
      answer:
        "Câu hỏi này liên quan tới tài liệu nội bộ thuộc diện nhạy cảm, tôi không thể tự động trả lời. " +
        "Tôi đã chuyển câu hỏi này cho quản trị viên — bạn sẽ nhận được phản hồi trực tiếp trong hội thoại này.",
      sources: [],
      escalate: true,
    };
  }

  // Bước 2: tìm kiếm bình thường trong nhóm tài liệu không nhạy cảm
  const chunks = await retrieveRelevantChunks(questionEmbedding);

  if (chunks.length === 0) {
    return {
      answer:
        "Hiện chưa có văn bản nội bộ nào được nạp vào hệ thống, nên tôi chưa thể trả lời câu hỏi này. Vui lòng liên hệ quản trị viên để bổ sung tài liệu.",
      sources: [],
      escalate: false,
    };
  }

  const prompt = buildPrompt(question, chunks);
  const answer = await generateWithRetry(prompt);

  const sources = [
    ...new Map(
      chunks.map((c) => [c.document_id, { documentId: c.document_id, title: c.document_title }])
    ).values(),
  ];

  return { answer, sources, escalate: false, matchedChunks: chunks.map((c) => c.id) };
}
