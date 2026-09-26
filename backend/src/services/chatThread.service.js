// Logic dùng chung để thao tác với "đoạn chat" (Conversation) + tin nhắn
// (Message) — dùng bởi cả chat.routes.js (nhân viên) và admin.routes.js (admin),
// nên tách riêng ra đây để không lặp code và đảm bảo 2 nơi luôn nhất quán.
import { Conversation } from "../models/conversation.model.js";
import { Message } from "../models/message.model.js";
import { summarizeConversation } from "./summary.service.js";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

// Lấy đoạn chat ĐANG HOẠT ĐỘNG (isDeleted = false) của 1 nhân viên, tự tạo
// mới nếu chưa có (nhân viên mới toanh, hoặc vừa xoá đoạn chat trước đó).
// Nhờ partial unique index ở conversation.model.js, kể cả khi 2 request tới
// gần như đồng thời cùng cố tạo đoạn chat mới cho cùng 1 nhân viên, MongoDB
// sẽ từ chối request thứ 2 (lỗi trùng khoá) — bắt lỗi đó và đọc lại bản ghi đã
// được request thứ nhất tạo, để tránh trường hợp 1 nhân viên có 2 đoạn chat
// "đang hoạt động" cùng lúc.
export async function getOrCreateActiveThread(user) {
  let conversation = await Conversation.findOne({ userId: user.id, isDeleted: false });
  if (conversation) return conversation;

  try {
    conversation = await Conversation.create({
      userId: user.id,
      userName: user.fullName,
      userEmail: user.email,
      title: "Hội thoại với trợ lý AI",
    });
    return conversation;
  } catch (err) {
    if (err.code === 11000) {
      // Trùng khoá do race condition — 1 request khác vừa tạo xong, đọc lại.
      conversation = await Conversation.findOne({ userId: user.id, isDeleted: false });
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
export async function paginateMessages(conversationId, { before, limit, includeDeleted = false } = {}) {
  const pageSize = Math.min(Number(limit) || DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);

  const filter = { conversationId };
  if (!includeDeleted) filter.isDeleted = false;
  if (before) filter.createdAt = { $lt: new Date(before) };

  // Lấy dư 1 tin nhắn để biết còn trang cũ hơn nữa hay không, mà không cần
  // thêm 1 query đếm riêng.
  const rows = await Message.find(filter)
    .sort({ createdAt: -1 })
    .limit(pageSize + 1)
    .lean();

  const hasMore = rows.length > pageSize;
  const page = rows.slice(0, pageSize).reverse(); // đảo lại thành cũ -> mới

  return { messages: page, hasMore };
}

// Xoá mềm 1 tin nhắn — chỉ cho phép xoá tin nhắn thuộc đúng đoạn chat được
// truyền vào (route gọi hàm này đã tự kiểm tra đoạn chat đó thuộc về đúng
// nhân viên đang đăng nhập).
export async function softDeleteMessage(conversationId, messageId) {
  const message = await Message.findOneAndUpdate(
    { _id: messageId, conversationId, isDeleted: false },
    { isDeleted: true, deletedAt: new Date() },
    { new: true }
  );
  return message;
}

// Xoá mềm CẢ đoạn chat hiện tại của 1 nhân viên, rồi tạo ngay 1 đoạn chat mới
// (trắng) để nhân viên tiếp tục hỏi đáp — vì hệ thống luôn cần đúng 1 đoạn
// chat "đang hoạt động" cho mỗi nhân viên.
export async function softDeleteActiveThreadAndCreateNew(user) {
  await Conversation.updateOne(
    { userId: user.id, isDeleted: false },
    { isDeleted: true, deletedAt: new Date() }
  );
  return getOrCreateActiveThread(user);
}

// Sinh tóm tắt cho 1 đoạn chat NGAY SAU khi nó được gắn cờ "flagged" (câu hỏi
// khó do nhân viên tự đánh dấu, hoặc tự động do trùng chủ đề tài liệu nhạy
// cảm) — CHẠY NỀN (không await ở nơi gọi) để không làm chậm response trả lời
// nhân viên, vì gọi Gemini có thể mất 1-2 giây. Trang quản trị chỉ cần tải lại
// danh sách hội thoại (vốn đã tự làm khi mở trang) là sẽ thấy tóm tắt xuất
// hiện ngay khi xong.
export async function generateConversationSummaryAsync(conversationId) {
  try {
    const messages = await Message.find({ conversationId }).sort({ createdAt: 1 }).limit(40).lean();
    const summary = await summarizeConversation(messages);
    if (summary) {
      await Conversation.findByIdAndUpdate(conversationId, {
        summary,
        summaryGeneratedAt: new Date(),
      });
    }
  } catch (err) {
    console.error("[chatThread.service] Tạo tóm tắt hội thoại thất bại:", err.message);
  }
}
