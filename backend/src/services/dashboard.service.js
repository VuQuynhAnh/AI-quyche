import { CONVERSATION_STATUS } from "../constants/enums.js";

// THỐNG KÊ DASHBOARD (admin cửa hàng) — chỉ số liệu của cửa hàng mình. Số liệu văn bản lấy từ PostgreSQL, số liệu hội
// thoại/câu hỏi lấy từ MongoDB — xem README, mục "So sánh PostgreSQL vs MongoDB".
export function createDashboardService({ documentRepository, conversationRepository, messageRepository }) {
  // Trả về đủ số liệu để trang Dashboard vẽ các biểu đồ (xem Dashboard.jsx +
  // components/charts/):
  //   1. documentsByStatus       -> trạng thái văn bản
  //   2. conversationsByStatus   -> trạng thái hội thoại (normal/flagged/resolved)
  //   3. totalEscalations        -> TỔNG số LẦN cần admin hỗ trợ, cộng dồn qua
  //      toàn bộ lịch sử mọi đoạn chat (Conversation.escalationCount — xem giải
  //      thích ở conversation.model.js), bất kể tự động phát hiện hay nhân viên
  //      tự đánh dấu, và bất kể đoạn chat đó đã "resolved" bao nhiêu lần rồi lại
  //      cần hỗ trợ tiếp. Chia cho "totalQuestions" ở Dashboard admin ra "tỷ lệ
  //      câu hỏi cần admin hỗ trợ" — khác với "needsReviewCount" bên dưới (chỉ
  //      đếm số đoạn chat ĐANG "flagged" ngay lúc này, không phải lịch sử).
  //   4. topTopics               -> gọi riêng ở getTopTopics() bên dưới
  //   5. feedbackBreakdown       -> trong số câu trả lời ĐÃ được nhân viên đánh
  //      giá ("helpful"/"unhelpful"), bao nhiêu % được cho là hữu ích — thước đo
  //      chất lượng trả lời tự động theo NGƯỜI DÙNG THẬT chấm, khác với biểu đồ
  //      (2)/(3) vốn chỉ dựa vào việc có bị gắn cờ hay không.
  // totalQuestions không tính tin nhắn đã bị nhân viên xoá mềm.
  async function getStats(actor) {
    const { storeId } = actor;
    const [
      documentsByStatus,
      totalConversations,
      totalQuestions,
      needsReviewCount,
      conversationsByStatus,
      totalEscalations,
      feedbackBreakdown,
    ] = await Promise.all([
      documentRepository.countByStatus(storeId),
      conversationRepository.count({ storeId }),
      messageRepository.countActiveUserQuestions(storeId),
      conversationRepository.count({ storeId, status: CONVERSATION_STATUS.FLAGGED }),
      conversationRepository.countGroupedByStatus(storeId),
      conversationRepository.sumEscalationCount(storeId),
      messageRepository.countFeedback(storeId),
    ]);

    return {
      documentsByStatus,
      conversationsByStatus,
      totalEscalations,
      feedbackBreakdown,
      totalConversations,
      totalQuestions,
      needsReviewCount,
    };
  }

  // Thống kê VẤN ĐỀ (quy chế) được hỏi nhiều nhất — tính theo số lần TRUY XUẤT
  // được từ mỗi quy chế: mỗi câu trả lời của chatbot kèm 1 danh sách "sources"
  // (quy chế đã dùng để trả lời — xem assistant.service.js); mỗi lần 1 quy chế
  // xuất hiện trong "sources" của 1 câu trả lời được tính là 1 lần truy xuất.
  // Nhóm theo "documentId" (ổn định dù quy chế bị đổi tên sau đó) rồi lấy tiêu
  // đề mới nhất để hiển thị. Nhờ vậy, dù nhân viên hỏi bằng nhiều cách diễn đạt
  // khác nhau nhưng cùng cần tới 1 quy chế, quy chế đó vẫn được gộp đúng vào 1
  // vấn đề duy nhất. Chỉ tính câu trả lời CHƯA bị xoá và có ít nhất 1 nguồn.
  async function getTopTopics(actor, limitParam) {
    const limit = Math.min(Number(limitParam) || 10, 50);
    return { topTopics: await messageRepository.countSourceUsage(actor.storeId, limit) };
  }

  return { getStats, getTopTopics };
}
