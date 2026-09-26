// Route trang client: hỏi đáp theo mô hình "1 nhân viên = 1 đoạn chat liên
// tục" (giống Messenger/Zalo) — KHÔNG phải nhiều hội thoại tách rời. Nhân viên
// mở app lên là thấy tin nhắn cũ ngay, kéo lên đầu để tải thêm tin nhắn cũ hơn
// (phân trang). Có thể xoá 1 tin nhắn lẻ, hoặc xoá cả đoạn chat (tự động tạo
// đoạn chat mới ngay sau đó). Xem chi tiết thiết kế trong models/conversation.model.js,
// models/message.model.js và services/chatThread.service.js.
import { Router } from "express";
import mongoose from "mongoose";
import { requireAuth } from "../middleware/auth.js";
import { requireMongo } from "../middleware/requireMongo.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { answerQuestion } from "../services/rag.service.js";
import {
  getOrCreateActiveThread,
  paginateMessages,
  softDeleteMessage,
  softDeleteActiveThreadAndCreateNew,
  generateConversationSummaryAsync,
} from "../services/chatThread.service.js";
import { Message } from "../models/message.model.js";

const router = Router();
// Toàn bộ route trong file này đều đọc/ghi hội thoại (MongoDB), nên yêu cầu
// Mongo phải sẵn sàng — PostgreSQL (auth, documents) không bị ảnh hưởng.
router.use(requireAuth, requireMongo);

function isValidId(id) {
  return mongoose.isValidObjectId(id);
}

// Lấy 1 trang tin nhắn của đoạn chat đang hoạt động của nhân viên hiện tại.
//   GET /chat/thread                        -> trang MỚI NHẤT
//   GET /chat/thread?before=<ISO timestamp>  -> trang CŨ HƠN mốc thời gian đó
//   GET /chat/thread?limit=30                -> tuỳ chỉnh số tin nhắn/trang (mặc định 20)
// (before lấy từ "createdAt" của tin nhắn CŨ NHẤT đang hiển thị ở phía client)
router.get(
  "/thread",
  asyncHandler(async (req, res) => {
    const conversation = await getOrCreateActiveThread(req.user);
    const { messages, hasMore } = await paginateMessages(conversation._id, {
      before: req.query.before,
      limit: req.query.limit,
    });

    res.json({
      conversationId: conversation._id,
      status: conversation.status,
      autoEscalated: conversation.autoEscalated,
      messages,
      hasMore,
    });
  })
);

// Gửi câu hỏi mới vào đoạn chat đang hoạt động. Nếu rag.service phát hiện câu
// hỏi trùng chủ đề tài liệu nhạy cảm (escalate = true), đoạn chat TỰ ĐỘNG được
// gắn trạng thái "flagged" để admin xử lý.
router.post(
  "/thread/ask",
  asyncHandler(async (req, res) => {
    const { question } = req.body;

    if (!question || !question.trim()) {
      return res.status(400).json({ error: "Câu hỏi không được để trống." });
    }

    const conversation = await getOrCreateActiveThread(req.user);

    const userMessage = await Message.create({
      conversationId: conversation._id,
      role: "user",
      content: question,
    });

    const { answer, sources, escalate } = await answerQuestion(question);

    const assistantMessage = await Message.create({
      conversationId: conversation._id,
      role: "assistant",
      content: answer,
      sources,
    });

    // Tự động chuyển sang "flagged" khi câu hỏi trùng chủ đề tài liệu nhạy
    // cảm — trừ khi đoạn chat ĐANG "flagged" (đã có 1 câu hỏi khác đang chờ
    // xử lý, không cần gắn cờ lại). Trạng thái "resolved" VẪN được gắn cờ lại
    // bình thường: đây là 1 đoạn chat liên tục (1 nhân viên = 1 đoạn chat),
    // nên 1 câu hỏi nhạy cảm MỚI sau khi admin đã xử lý xong câu hỏi trước đó
    // vẫn phải được chuyển cho admin, không thể im lặng bỏ qua chỉ vì đoạn
    // chat đã từng "resolved" 1 lần.
    if (escalate && conversation.status !== "flagged") {
      conversation.status = "flagged";
      conversation.autoEscalated = true;
      conversation.flaggedAt = new Date();
      // Cộng dồn (không phải gán lại) — dùng để tính "tỷ lệ câu hỏi cần admin
      // hỗ trợ" ở Dashboard admin, xem giải thích ở conversation.model.js.
      conversation.escalationCount = (conversation.escalationCount || 0) + 1;
      await conversation.save();
      generateConversationSummaryAsync(conversation._id);
    }

    res.json({
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
      // client) — để giao diện hiện đúng giờ gửi ngay khi nhận phản hồi, thay vì
      // phải tải lại trang mới thấy (lúc đó mới có createdAt từ GET /chat/thread).
      userMessageCreatedAt: userMessage.createdAt,
      assistantMessageCreatedAt: assistantMessage.createdAt,
    });
  })
);

// Nhân viên tự đánh giá "câu hỏi này khó / chatbot trả lời chưa thoả đáng, cần
// admin xem trực tiếp" — đưa đoạn chat vào danh sách "Cần admin trả lời" bên
// trang quản trị.
router.post(
  "/thread/flag",
  asyncHandler(async (req, res) => {
    const conversation = await getOrCreateActiveThread(req.user);

    // "resolved" VẪN gắn cờ lại được bình thường (1 nhân viên = 1 đoạn chat
    // liên tục) — chỉ chặn khi ĐANG "flagged" sẵn (tránh gắn cờ trùng khi đã
    // có 1 yêu cầu khác đang chờ admin xử lý). Xem giải thích tương tự ở
    // "/thread/ask" phía trên.
    if (conversation.status !== "flagged") {
      conversation.status = "flagged";
      conversation.autoEscalated = false;
      conversation.flaggedAt = new Date();
      conversation.escalationCount = (conversation.escalationCount || 0) + 1;
      await conversation.save();
      generateConversationSummaryAsync(conversation._id);
    }

    res.json({ status: conversation.status });
  })
);

// Nhân viên đánh giá 1 câu trả lời của chatbot là "hữu ích" hay "không hữu
// ích" — dùng để đo chất lượng trả lời tự động, tổng hợp ở Dashboard admin
// (xem GET /admin/stats -> feedbackBreakdown). Chỉ đánh giá được tin nhắn
// role "assistant" thuộc ĐÚNG đoạn chat đang hoạt động của chính nhân viên
// này (giống cách kiểm tra ở DELETE /thread/messages/:messageId bên dưới).
// Bấm lại ĐÚNG lựa chọn đã chọn trước đó (VD: đang "helpful" bấm "helpful"
// lần nữa) sẽ HUỶ đánh giá (feedback = null) — cho phép nhân viên đổi ý.
router.patch(
  "/thread/messages/:messageId/feedback",
  asyncHandler(async (req, res) => {
    if (!isValidId(req.params.messageId)) {
      return res.status(400).json({ error: "ID tin nhắn không hợp lệ." });
    }

    const { feedback } = req.body;
    if (!["helpful", "unhelpful"].includes(feedback)) {
      return res.status(400).json({ error: "Giá trị đánh giá không hợp lệ." });
    }

    const conversation = await getOrCreateActiveThread(req.user);
    const message = await Message.findOne({
      _id: req.params.messageId,
      conversationId: conversation._id,
      role: "assistant",
    });
    if (!message) {
      return res.status(404).json({ error: "Không tìm thấy câu trả lời cần đánh giá." });
    }

    message.feedback = message.feedback === feedback ? null : feedback;
    await message.save();

    res.json({ feedback: message.feedback });
  })
);

// Xoá mềm CẢ đoạn chat hiện tại + tự động tạo đoạn chat mới (trắng) để nhân
// viên tiếp tục hỏi đáp ngay sau đó.
router.delete(
  "/thread",
  asyncHandler(async (req, res) => {
    const newConversation = await softDeleteActiveThreadAndCreateNew(req.user);
    res.json({ conversationId: newConversation._id, status: newConversation.status });
  })
);

// Xoá mềm 1 tin nhắn LẺ trong đoạn chat đang hoạt động — đoạn chat vẫn tiếp
// tục bình thường, không tạo đoạn chat mới (khác với xoá cả đoạn chat ở trên).
router.delete(
  "/thread/messages/:messageId",
  asyncHandler(async (req, res) => {
    if (!isValidId(req.params.messageId)) {
      return res.status(400).json({ error: "ID tin nhắn không hợp lệ." });
    }

    // Chỉ cho xoá tin nhắn thuộc ĐÚNG đoạn chat đang hoạt động của chính
    // nhân viên này — tránh việc đoán ID tin nhắn của người khác để xoá.
    const conversation = await getOrCreateActiveThread(req.user);
    const deleted = await softDeleteMessage(conversation._id, req.params.messageId);

    if (!deleted) {
      return res.status(404).json({ error: "Không tìm thấy tin nhắn (có thể đã bị xoá trước đó)." });
    }

    res.status(204).end();
  })
);

export default router;
