// Truy cập collection conversations (MongoDB) — xem models/conversation.model.js.
export function createConversationRepository({ Conversation, mongoose }) {
  return {
    isValidId(id) {
      return mongoose.isValidObjectId(id);
    },

    findActiveByUser(userId) {
      return Conversation.findOne({ userId, isDeleted: false }).lean();
    },

    async create(data) {
      const doc = await Conversation.create(data);
      return doc.toObject();
    },

    findInStore(id, storeId) {
      return Conversation.findOne({ _id: id, storeId }).lean();
    },

    updateById(id, fields) {
      return Conversation.findByIdAndUpdate(id, fields, { new: true }).lean();
    },

    softDeleteActiveByUser(userId) {
      return Conversation.updateOne(
        { userId, isDeleted: false },
        { isDeleted: true, deletedAt: new Date() }
      );
    },

    list({ storeId, status, fields, limit }) {
      return Conversation.find(status ? { storeId, status } : { storeId })
        .select(fields)
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean();
    },

    count(filter) {
      return Conversation.countDocuments(filter);
    },

    async countGroupedByStatus(storeId) {
      const rows = await Conversation.aggregate([
        { $match: { storeId } },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]);
      return rows.map((r) => ({ status: r._id, count: r.count }));
    },

    async sumEscalationCount(storeId) {
      const rows = await Conversation.aggregate([
        { $match: { storeId } },
        { $group: { _id: null, total: { $sum: "$escalationCount" } } },
      ]);
      return rows[0]?.total || 0;
    },

    deleteAll() {
      return Conversation.deleteMany({});
    },
  };
}
