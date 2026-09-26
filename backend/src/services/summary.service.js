// Sinh tóm tắt ngắn gọn cho 1 đoạn chat "cần admin trả lời" (flagged) — giúp
// quản trị viên lướt qua trang "Hội thoại" và nắm nhanh nhân viên đang hỏi/
// gặp vướng mắc gì mà KHÔNG phải mở từng hội thoại đọc lại toàn bộ tin nhắn.
// Dùng lại chính Gemini model đang dùng để trả lời chat (chatModel) — chỉ đổi
// prompt, không cần thêm dịch vụ/API key riêng.
import { chatModel } from "../config/gemini.js";

const ROLE_LABEL = {
  user: "Nhân viên",
  assistant: "Chatbot",
  admin: "Quản trị viên",
};

function buildTranscript(messages) {
  return messages
    .filter((m) => !m.isDeleted)
    .map((m) => `${ROLE_LABEL[m.role] || m.role}: ${m.content}`)
    .join("\n");
}

// Trả về 1 câu tóm tắt (string), hoặc null nếu gọi Gemini thất bại (VD: chưa
// cấu hình GEMINI_API_KEY) — lỗi được nuốt lại ở đây (chỉ log ra console) vì
// đây là tính năng "hỗ trợ thêm", không nên làm hỏng luồng chat chính nếu lỗi.
export async function summarizeConversation(messages) {
  if (!messages || messages.length === 0) return null;

  const transcript = buildTranscript(messages);
  if (!transcript.trim()) return null;

  const prompt = `Tóm tắt NGẮN GỌN trong 1-2 câu tiếng Việt nội dung đoạn hội thoại dưới đây giữa nhân viên và
trợ lý AI nội bộ, để quản trị viên đọc tóm tắt là hiểu ngay nhân viên đang hỏi/gặp vướng mắc gì và
vì sao cần admin trả lời trực tiếp. Chỉ trả về đúng câu tóm tắt, không thêm lời dẫn hay markdown.

HỘI THOẠI:
${transcript}`;

  try {
    const result = await chatModel.generateContent(prompt);
    const text = result.response.text().trim();
    return text || null;
  } catch (err) {
    console.error("[summary.service] Tóm tắt hội thoại thất bại:", err.message);
    return null;
  }
}
