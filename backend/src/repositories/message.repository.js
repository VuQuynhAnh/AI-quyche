// Truy cập collection messages (MongoDB) — xem models/message.model.js.
import { MESSAGE_SENDER } from "../constants/enums.js";

export function createMessageRepository({ Message }) {
  return {
    async create(data) {
      const doc = await Message.create(data);
      return doc.toObject();
    },

    // Tin nhắn của 1 đoạn chat, MỚI NHẤT trước, tối đa `limit` dòng
    findByConversation(conversationId, { includeDeleted, before, limit }) {
      const filter = { conversationId };
      if (!includeDeleted) filter.isDeleted = false;
      if (before) filter.createdAt = { $lt: new Date(before) };
      return Message.find(filter).sort({ createdAt: -1 }).limit(limit).lean();
    },

    // Tin nhắn của 1 đoạn chat theo thứ tự thời gian (cũ -> mới)
    findOldestByConversation(conversationId, limit) {
      return Message.find({ conversationId }).sort({ createdAt: 1 }).limit(limit).lean();
    },

    findOne({ id, conversationId, role }) {
      return Message.findOne({ _id: id, conversationId, role }).lean();
    },

    updateById(id, fields) {
      return Message.findByIdAndUpdate(id, fields, { new: true }).lean();
    },

    // Xoá mềm tin nhắn CHƯA bị xoá thuộc đúng đoạn chat; null nếu không có
    softDelete(conversationId, messageId) {
      return Message.findOneAndUpdate(
        { _id: messageId, conversationId, isDeleted: false },
        { isDeleted: true, deletedAt: new Date() },
        { new: true }
      ).lean();
    },

    countActiveUserQuestions(storeId) {
      return Message.countDocuments({ storeId, role: MESSAGE_SENDER.USER, isDeleted: false });
    },

    async countFeedback(storeId) {
      const rows = await Message.aggregate([
        { $match: { storeId, role: MESSAGE_SENDER.ASSISTANT, isDeleted: false, feedback: { $ne: null } } },
        { $group: { _id: "$feedback", count: { $sum: 1 } } },
      ]);
      return rows.map((r) => ({ feedback: r._id, count: r.count }));
    },

    // Số lần mỗi văn bản xuất hiện trong "sources" của câu trả lời chưa xoá
    countSourceUsage(storeId, limit) {
      return Message.aggregate([
        { $match: { storeId, role: MESSAGE_SENDER.ASSISTANT, isDeleted: false, "sources.0": { $exists: true } } },
        { $unwind: "$sources" },
        {
          $group: {
            _id: "$sources.documentId",
            title: { $last: "$sources.title" },
            count: { $sum: 1 },
            lastAskedAt: { $max: "$createdAt" },
          },
        },
        { $sort: { count: -1, lastAskedAt: -1 } },
        { $limit: limit },
        { $project: { _id: 0, documentId: "$_id", title: 1, count: 1, lastAskedAt: 1 } },
      ]);
    },

    deleteAll() {
      return Message.deleteMany({});
    },
  };
}
