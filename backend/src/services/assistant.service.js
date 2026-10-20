// TRỢ LÝ AI HỎI ĐÁP — lõi RAG (Retrieval-Augmented Generation):
// 1. Biến câu hỏi thành embedding
// 2. Kiểm tra xem câu hỏi có khớp với TÀI LIỆU NHẠY CẢM không (is_sensitive = true)
//    → nếu có, từ chối trả lời tự động và đề nghị liên hệ admin, KHÔNG gửi nội
//      dung nhạy cảm cho Gemini (tránh rò rỉ dữ liệu nhạy cảm ra ngoài hệ thống).
// 3. Nếu không, tìm các đoạn văn bản (chunk) gần nghĩa nhất trong nhóm tài liệu
//    THÔNG THƯỜNG (is_sensitive = false) bằng pgvector cosine distance
// 4. Ghép các đoạn đó thành "ngữ cảnh" rồi đưa cho Gemini kèm câu hỏi
// 5. Yêu cầu Gemini CHỈ trả lời dựa trên ngữ cảnh, có trích dẫn nguồn tài liệu
// Chỉ tìm trong văn bản của CỬA HÀNG người hỏi (storeId lấy từ JWT).
import { ROLE } from "../constants/enums.js";

const TOP_K = 5;

// Ngưỡng tương đồng (cosine similarity, giá trị 0..1, càng gần 1 càng giống)
// để coi là câu hỏi "trùng chủ đề" với 1 tài liệu nhạy cảm. Đây là một ngưỡng
// đơn giản (heuristic) — trong thực tế nên tinh chỉnh lại dựa trên dữ liệu
// thật, hoặc dùng thêm bước phân loại chủ đề (classification) thay vì chỉ dựa
// vào 1 con số cố định.
const SENSITIVE_MATCH_THRESHOLD = 0.72;

const formatContext = (chunks) =>
  chunks.map((c, i) => `[Nguồn ${i + 1} - "${c.document_title}"]\n${c.content}`).join("\n\n---\n\n");

// Danh sách tài liệu (không trùng) đã dùng để trả lời
const uniqueSources = (chunks) => [
  ...new Map(
    chunks.map((c) => [c.document_id, { documentId: c.document_id, title: c.document_title }])
  ).values(),
];

function buildPrompt(question, chunks) {
  return `Bạn là trợ lý AI nội bộ, chuyên giải đáp câu hỏi về quy chế và văn bản nội bộ doanh nghiệp.

QUY TẮC BẮT BUỘC:
- Chỉ trả lời dựa trên nội dung trong phần "TÀI LIỆU THAM KHẢO" bên dưới.
- Nếu tài liệu không chứa thông tin liên quan, hãy trả lời rõ: "Tôi không tìm thấy quy định liên quan trong tài liệu nội bộ hiện có." Không tự suy đoán hay bịa thông tin.
- Trả lời ngắn gọn, rõ ràng, đúng trọng tâm câu hỏi.
- Cuối câu trả lời, liệt kê các nguồn đã dùng theo định dạng: "Nguồn: <tên tài liệu>".

TÀI LIỆU THAM KHẢO:
${formatContext(chunks)}

CÂU HỎI CỦA NHÂN VIÊN:
${question}`;
}

function buildPersonalPrompt(question, factsText, chunks) {
  return `Bạn là trợ lý chấm công nội bộ, trả lời nhân viên bằng tiếng Việt, ngắn gọn, thân thiện.

QUY TẮC BẮT BUỘC:
- Mọi con số (tiền, phút, giờ, số ngày) CHỈ lấy từ "DỮ LIỆU CHẤM CÔNG" bên dưới và phải giữ NGUYÊN, không tự tính lại, không làm tròn, không suy đoán.
- Nếu dữ liệu ghi "TẠM TÍNH", nói rõ đây là số tạm tính.
- Nếu không có dữ liệu cho kỳ được hỏi, nói rõ là chưa có dữ liệu chấm công.
- Nếu câu hỏi liên quan quy định/chính sách, chỉ dùng "TÀI LIỆU THAM KHẢO"; không có thì nói không tìm thấy quy định. Khi dùng tài liệu, cuối câu liệt kê "Nguồn: <tên tài liệu>".
- Chỉ nói về dữ liệu của chính người đang hỏi. Không bịa thêm thông tin nào khác.

DỮ LIỆU CHẤM CÔNG:
${factsText}

TÀI LIỆU THAM KHẢO:
${chunks.length ? formatContext(chunks) : "(không có)"}

CÂU HỎI CỦA NHÂN VIÊN:
${question}`;
}

export function createAssistantService({ documentRepository, aiProvider, salaryInquiryService }) {
  const retrieveRelevantChunks = (storeId, embedding) =>
    documentRepository.findClosestPublicDetails(storeId, embedding, TOP_K);

  // Câu hỏi về dữ liệu CÁ NHÂN (lương, đi muộn, về sớm...). Số liệu do code tính
  // từ hệ thống chấm công của CHÍNH người hỏi (userId lấy từ JWT) — Gemini chỉ
  // diễn đạt lại. Nếu câu hỏi có thể đụng cả quy chế (VD "đi muộn 3 lần có bị
  // phạt theo quy chế không?") thì kèm thêm tài liệu THƯỜNG (không nhạy cảm).
  async function answerPersonalQuestion(question, user) {
    const facts = await salaryInquiryService.loadPersonalFacts(user.id, question);

    let chunks = [];
    try {
      chunks = await retrieveRelevantChunks(user.storeId, await aiProvider.embedText(question));
    } catch (err) {
      // Không có tài liệu/embedding lỗi thì vẫn trả lời được phần số liệu
      console.warn("[assistant.service] Bỏ qua tra cứu quy chế cho câu hỏi cá nhân:", err.message);
    }

    let answer;
    try {
      const prompt = buildPersonalPrompt(question, facts.text, chunks);
      answer = (await aiProvider.generateText(prompt)) + salaryInquiryService.sourceFooter(facts);
    } catch (err) {
      // AI lỗi/quá tải/hết quota: trả thẳng số liệu thô thay vì báo lỗi
      console.warn("[assistant.service] Gemini lỗi, dùng câu trả lời dự phòng:", err.message);
      answer = salaryInquiryService.fallbackAnswer(facts);
    }

    return { answer, sources: answer.includes("Nguồn:") ? uniqueSources(chunks) : [], escalate: false };
  }

  // Kết quả trả về gồm:
  //  - answer      : nội dung trả lời (text)
  //  - sources     : danh sách tài liệu đã dùng để trả lời (rỗng nếu escalate)
  //  - escalate    : true nếu câu hỏi cần chuyển cho admin xử lý trực tiếp
  //                  (do khớp tài liệu nhạy cảm) — chat.service.js sẽ dùng cờ này
  //                  để tự động gắn trạng thái "flagged" cho hội thoại.
  async function answerQuestion(question, user) {
    // Câu hỏi về lương/đi muộn/công của CHÍNH nhân viên -> đi đường dữ liệu chấm
    // công, đặt TRƯỚC bước kiểm tra tài liệu nhạy cảm (nếu không, "lương của tôi"
    // sẽ bị nhầm với hợp đồng lương cá nhân và chuyển cho admin). Admin cửa
    // hàng cũng chấm công nên cũng hỏi được lương/công của chính mình.
    if ((user?.role === ROLE.USER || user?.role === ROLE.ADMIN) && salaryInquiryService.isPersonalDataQuestion(question)) {
      return answerPersonalQuestion(question, user);
    }

    const questionEmbedding = await aiProvider.embedText(question);

    // Bước 1: kiểm tra câu hỏi có đụng tới tài liệu nhạy cảm không — kiểm tra
    // TRƯỚC khi tìm/gửi bất kỳ nội dung nào cho Gemini để đảm bảo dữ liệu nhạy
    // cảm không bao giờ rời khỏi hệ thống qua prompt AI.
    const sensitiveMatch = await documentRepository.findClosestSensitiveDetail(user.storeId, questionEmbedding);
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
    const chunks = await retrieveRelevantChunks(user.storeId, questionEmbedding);

    if (chunks.length === 0) {
      return {
        answer:
          "Hiện chưa có văn bản nội bộ nào được nạp vào hệ thống, nên tôi chưa thể trả lời câu hỏi này. Vui lòng liên hệ quản trị viên để bổ sung tài liệu.",
        sources: [],
        escalate: false,
      };
    }

    const answer = await aiProvider.generateText(buildPrompt(question, chunks));

    return { answer, sources: uniqueSources(chunks), escalate: false, matchedChunks: chunks.map((c) => c.id) };
  }

  return { answerQuestion };
}
