// ĐOẠN CHAT CỦA NHÂN VIÊN theo mô hình "1 nhân viên = 1 đoạn chat liên tục"
// (giống Messenger/Zalo) — KHÔNG phải nhiều hội thoại tách rời. Nhân viên mở
// app lên là thấy tin nhắn cũ ngay, kéo lên đầu để tải thêm tin nhắn cũ hơn
// (phân trang). Có thể xoá 1 tin nhắn lẻ, hoặc xoá cả đoạn chat (tự động tạo
// đoạn chat mới ngay sau đó). Xem thiết kế dữ liệu trong models/conversation.model.js
// và models/message.model.js.
import { CONVERSATION_STATUS, MESSAGE_FEEDBACK, MESSAGE_SENDER, isEnumValue } from "../constants/enums.js";
import { AppError } from "../utils/AppError.js";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;
const SUMMARY_MESSAGE_LIMIT = 40;

export function createChatService({
  conversationRepository,
  messageRepository,
  assistantService,
  conversationSummaryService,
}) {
  // Lấy đoạn chat ĐANG HOẠT ĐỘNG (isDeleted = false) của 1 nhân viên, tự tạo
  // mới nếu chưa có (nhân viên mới toanh, hoặc vừa xoá đoạn chat trước đó).
  // Nhờ partial unique index ở conversation.model.js, kể cả khi 2 request tới
  // gần như đồng thời cùng cố tạo đoạn chat mới cho cùng 1 nhân viên, MongoDB
  // sẽ từ chối request thứ 2 (lỗi trùng khoá) — bắt lỗi đó và đọc lại bản ghi đã
  // được request thứ nhất tạo, để tránh trường hợp 1 nhân viên có 2 đoạn chat
  // "đang hoạt động" cùng lúc.
  async function getOrCreateActiveThread(user) {
    const existing = await conversationRepository.findActiveByUser(user.id);
    if (existing) return existing;

    try {
      return await conversationRepository.create({
        storeId: user.storeId,
        userId: user.id,
        userName: user.fullName,
        userEmail: user.email,
        title: "Hội thoại với trợ lý AI",
      });
    } catch (err) {
      if (err.code === 11000) {
        // Trùng khoá do race condition — 1 request khác vừa tạo xong, đọc lại.
        const conversation = await conversationRepository.findActiveByUser(user.id);
        if (conversation) return conversation;
      }
      throw err;
    }
  }

  // Phân trang tin nhắn của 1 đoạn chat theo kiểu "cursor" dựa trên createdAt —
  // ổn định hơn dùng skip/limit khi có tin nhắn mới liên tục được thêm vào.
  //   - Không truyền "before"  -> lấy trang MỚI NHẤT (dùng khi mới mở app)
  //   - Truyền "before"        -> lấy các tin nhắn CŨ HƠN thời điểm đó (dùng khi
  //                               nhân viên kéo lên đầu danh sách để xem thêm)
  // Trả về tin nhắn theo thứ tự THỜI GIAN TĂNG DẦN (cũ -> mới) để phía client
  // chỉ việc render thẳng, không cần tự đảo mảng.
  async function paginateMessages(conversationId, { before, limit, includeDeleted = false } = {}) {
    const pageSize = Math.min(Number(limit) || DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);

    // Lấy dư 1 tin nhắn để biết còn trang cũ hơn nữa hay không, mà không cần
    // thêm 1 query đếm riêng.
    const rows = await messageRepository.findByConversation(conversationId, {
      includeDeleted,
      before,
      limit: pageSize + 1,
    });

    const hasMore = rows.length > pageSize;
    const messages = rows.slice(0, pageSize).reverse(); // đảo lại thành cũ -> mới
    return { messages, hasMore };
  }

  // Sinh tóm tắt cho 1 đoạn chat NGAY SAU khi nó được gắn cờ "flagged" — CHẠY
  // NỀN (không await ở nơi gọi) để không làm chậm response trả lời nhân viên,
  // vì gọi Gemini có thể mất 1-2 giây. Trang quản trị chỉ cần tải lại danh sách
  // hội thoại là sẽ thấy tóm tắt xuất hiện ngay khi xong.
  async function generateSummaryInBackground(conversationId) {
    try {
      const messages = await messageRepository.findOldestByConversation(conversationId, SUMMARY_MESSAGE_LIMIT);
      const summary = await conversationSummaryService.summarize(messages);
      if (summary) {
        await conversationRepository.updateById(conversationId, { summary, summaryGeneratedAt: new Date() });
      }
    } catch (err) {
      console.error("[chat.service] Tạo tóm tắt hội thoại thất bại:", err.message);
    }
  }

  // Gắn cờ "cần admin trả lời". "resolved" VẪN gắn cờ lại được bình thường
  // (1 nhân viên = 1 đoạn chat liên tục, nên 1 câu hỏi MỚI sau khi admin đã xử
  // lý xong câu trước vẫn phải được chuyển cho admin) — chỉ bỏ qua khi ĐANG
  // "flagged" sẵn (đã có 1 yêu cầu khác đang chờ admin xử lý).
  async function flagConversation(conversation, { autoEscalated }) {
    if (conversation.status === CONVERSATION_STATUS.FLAGGED) return conversation;
    const updated = await conversationRepository.updateById(conversation._id, {
      status: CONVERSATION_STATUS.FLAGGED,
      autoEscalated,
      flaggedAt: new Date(),
      // Cộng dồn (không phải gán lại) — dùng để tính "tỷ lệ câu hỏi cần admin
      // hỗ trợ" ở Dashboard admin, xem giải thích ở conversation.model.js.
      escalationCount: (conversation.escalationCount || 0) + 1,
    });
    generateSummaryInBackground(conversation._id);
    return updated;
  }

  // Lấy 1 trang tin nhắn của đoạn chat đang hoạt động của nhân viên hiện tại.
  async function getThread(user, { before, limit } = {}) {
    const conversation = await getOrCreateActiveThread(user);
    const { messages, hasMore } = await paginateMessages(conversation._id, { before, limit });
    return {
      conversationId: conversation._id,
      status: conversation.status,
      autoEscalated: conversation.autoEscalated,
      messages,
      hasMore,
    };
  }

  // Gửi câu hỏi mới vào đoạn chat đang hoạt động. Nếu trợ lý AI phát hiện câu
  // hỏi trùng chủ đề tài liệu nhạy cảm (escalate = true), đoạn chat TỰ ĐỘNG
  // được gắn trạng thái "flagged" để admin xử lý.
  async function ask(user, question) {
    if (!question || !question.trim()) {
      throw AppError.badRequest("Câu hỏi không được để trống.");
    }

    const conversation = await getOrCreateActiveThread(user);

    const userMessage = await messageRepository.create({
      conversationId: conversation._id,
      storeId: conversation.storeId,
      role: MESSAGE_SENDER.USER,
      content: question,
    });

    const { answer, sources, escalate } = await assistantService.answerQuestion(question, user);

    const assistantMessage = await messageRepository.create({
      conversationId: conversation._id,
      storeId: conversation.storeId,
      role: MESSAGE_SENDER.ASSISTANT,
      content: answer,
      sources,
    });

    if (escalate) await flagConversation(conversation, { autoEscalated: true });

    return {
      conversationId: conversation._id,
      answer,
      sources,
      escalate,
      // ID thật của 2 tin nhắn vừa lưu — trả về để frontend cập nhật lại state
      // ngay, thay vì giữ ID tạm ("tmp-...") mãi mãi (vốn làm ẩn nút "..." xoá/sửa
      // tin nhắn cho tới khi tải lại trang, vì Chat.jsx chỉ hiện nút đó với ID thật).
      userMessageId: userMessage._id,
      assistantMessageId: assistantMessage._id,
      // Giờ tạo THẬT của 2 tin nhắn (lấy từ timestamp Mongo, không phải giờ máy
      // client) — để giao diện hiện đúng giờ gửi ngay khi nhận phản hồi.
      userMessageCreatedAt: userMessage.createdAt,
      assistantMessageCreatedAt: assistantMessage.createdAt,
    };
  }

  // Nhân viên tự đánh giá "câu hỏi này khó / chatbot trả lời chưa thoả đáng, cần
  // admin xem trực tiếp" — đưa đoạn chat vào danh sách "Cần admin trả lời".
  async function requestAdminHelp(user) {
    const conversation = await getOrCreateActiveThread(user);
    const updated = await flagConversation(conversation, { autoEscalated: false });
    return { status: updated.status };
  }

  // Nhân viên đánh giá 1 câu trả lời của chatbot là "hữu ích" hay "không hữu
  // ích" — tổng hợp ở Dashboard admin (feedbackBreakdown). Chỉ đánh giá được tin
  // nhắn role "assistant" thuộc ĐÚNG đoạn chat đang hoạt động của chính nhân viên.
  // Bấm lại ĐÚNG lựa chọn đã chọn trước đó sẽ HUỶ đánh giá (feedback = null).
  async function setFeedback(user, messageId, feedback) {
    if (!conversationRepository.isValidId(messageId)) {
      throw AppError.badRequest("ID tin nhắn không hợp lệ.");
    }
    if (!isEnumValue(MESSAGE_FEEDBACK, feedback)) {
      throw AppError.badRequest("Giá trị đánh giá không hợp lệ.");
    }

    const conversation = await getOrCreateActiveThread(user);
    const message = await messageRepository.findOne({
      id: messageId,
      conversationId: conversation._id,
      role: MESSAGE_SENDER.ASSISTANT,
    });
    if (!message) throw AppError.notFound("Không tìm thấy câu trả lời cần đánh giá.");

    const updated = await messageRepository.updateById(message._id, {
      feedback: message.feedback === feedback ? null : feedback,
    });
    return { feedback: updated.feedback };
  }

  // Xoá mềm CẢ đoạn chat hiện tại + tự động tạo đoạn chat mới (trắng) để nhân
  // viên tiếp tục hỏi đáp ngay — hệ thống luôn cần đúng 1 đoạn chat "đang hoạt
  // động" cho mỗi nhân viên.
  async function resetThread(user) {
    await conversationRepository.softDeleteActiveByUser(user.id);
    const conversation = await getOrCreateActiveThread(user);
    return { conversationId: conversation._id, status: conversation.status };
  }

  // Xoá mềm 1 tin nhắn LẺ — chỉ cho xoá tin nhắn thuộc ĐÚNG đoạn chat đang hoạt
  // động của chính nhân viên này (tránh đoán ID tin nhắn của người khác để xoá).
  async function deleteMessage(user, messageId) {
    if (!conversationRepository.isValidId(messageId)) {
      throw AppError.badRequest("ID tin nhắn không hợp lệ.");
    }
    const conversation = await getOrCreateActiveThread(user);
    const deleted = await messageRepository.softDelete(conversation._id, messageId);
    if (!deleted) {
      throw AppError.notFound("Không tìm thấy tin nhắn (có thể đã bị xoá trước đó).");
    }
  }

  return {
    paginateMessages,
    getThread,
    ask,
    requestAdminHelp,
    setFeedback,
    resetThread,
    deleteMessage,
  };
}
