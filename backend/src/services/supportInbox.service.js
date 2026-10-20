// HỘP THƯ HỖ TRỢ (admin cửa hàng): xem đoạn chat của nhân viên cửa hàng mình và trả lời trực tiếp
// các đoạn chat "flagged" (câu hỏi khó hoặc liên quan tài liệu nhạy cảm).
//
// LƯU Ý VỀ XOÁ MỀM: khi nhân viên xoá 1 tin nhắn hoặc cả đoạn chat, dữ liệu
// KHÔNG bị xoá khỏi MongoDB — chỉ được đánh dấu isDeleted = true. Admin vẫn
// thấy đầy đủ nội dung đã xoá (kèm cờ isDeleted) để kiểm tra/đối soát khi cần.
import { CONVERSATION_STATUS, MESSAGE_SENDER, isEnumValue } from "../constants/enums.js";
import { AppError } from "../utils/AppError.js";

const CONVERSATION_LIST_FIELDS =
  "title status autoEscalated isDeleted deletedAt createdAt flaggedAt resolvedAt userName userEmail summary summaryGeneratedAt";

export function createSupportInboxService({ conversationRepository, messageRepository, chatService }) {
  // Truyền status = "flagged" để chỉ lấy các đoạn chat đang CẦN ADMIN TRẢ LỜI
  async function listConversations(actor, { status } = {}) {
    const conversations = await conversationRepository.list({
      storeId: actor.storeId,
      status: isEnumValue(CONVERSATION_STATUS, status) ? status : undefined,
      fields: CONVERSATION_LIST_FIELDS,
      limit: 200,
    });
    return { conversations };
  }

  // Chỉ đoạn chat của cửa hàng mình
  async function findConversationOrThrow(actor, id) {
    if (!conversationRepository.isValidId(id)) {
      throw AppError.badRequest("ID hội thoại không hợp lệ.");
    }
    const conversation = await conversationRepository.findInStore(id, actor.storeId);
    if (!conversation) throw AppError.notFound("Không tìm thấy hội thoại.");
    return conversation;
  }

  // Xem tin nhắn của 1 đoạn chat bất kỳ, phân trang giống phía nhân viên nhưng
  // LUÔN bao gồm cả tin nhắn đã bị xoá mềm.
  async function getConversationMessages(actor, id, { before, limit } = {}) {
    const conversation = await findConversationOrThrow(actor, id);
    const { messages, hasMore } = await chatService.paginateMessages(conversation._id, {
      before,
      limit,
      includeDeleted: true,
    });

    return {
      title: conversation.title,
      status: conversation.status,
      autoEscalated: conversation.autoEscalated,
      isDeleted: conversation.isDeleted,
      userName: conversation.userName,
      userEmail: conversation.userEmail,
      summary: conversation.summary,
      messages,
      hasMore,
    };
  }

  // Admin trả lời trực tiếp — tin nhắn role 'admin' để phía nhân viên phân biệt
  // được người thật trả lời. Nếu đoạn chat đã bị nhân viên xoá mềm, họ sẽ KHÔNG
  // thấy câu trả lời này — vẫn cho trả lời để giữ hồ sơ, nhưng kèm cảnh báo.
  async function reply(actor, id, message) {
    if (!conversationRepository.isValidId(id)) {
      throw AppError.badRequest("ID hội thoại không hợp lệ.");
    }
    if (!message || !message.trim()) {
      throw AppError.badRequest("Nội dung trả lời không được để trống.");
    }
    const conversation = await findConversationOrThrow(actor, id);

    await messageRepository.create({
      conversationId: conversation._id,
      storeId: conversation.storeId,
      role: MESSAGE_SENDER.ADMIN,
      content: message,
    });
    const updated = await conversationRepository.updateById(conversation._id, {
      status: CONVERSATION_STATUS.RESOLVED,
      resolvedAt: new Date(),
    });

    return {
      status: updated.status,
      warning: updated.isDeleted
        ? "Đoạn chat này đã bị nhân viên xoá — họ sẽ không thấy câu trả lời này trừ khi liên hệ lại."
        : null,
    };
  }

  return { listConversations, getConversationMessages, reply };
}
