// Route dành cho trang quản trị (admin):
//  - /stats                        : số liệu tổng quan cho dashboard
//  - /stats/top-topics             : vấn đề (quy chế) được hỏi/truy xuất nhiều nhất
//  - /users                        : danh sách người dùng (PostgreSQL)
//  - /users (POST)                 : tạo tài khoản mới — admin CHỌN ĐƯỢC role,
//                                    đây là cách DUY NHẤT (ngoài npm run seed)
//                                    để tạo thêm tài khoản admin
//  - /users/:id/role (PATCH)       : thăng/hạ quyền 1 tài khoản đã có
//  - /users/:id (DELETE)           : xoá 1 tài khoản
//  - /conversations                : xem danh sách đoạn chat của mọi nhân viên
//                                    (kể cả đoạn chat đã bị nhân viên xoá mềm)
//  - /conversations/:id/messages   : xem chi tiết 1 đoạn chat bất kỳ (phân trang)
//  - /conversations/:id/reply      : admin trả lời trực tiếp vào 1 đoạn chat
// (Quản lý văn bản được tách riêng ở documents.routes.js)
//
// Số liệu văn bản/người dùng lấy từ PostgreSQL, số liệu hội thoại/câu hỏi lấy
// từ MongoDB — xem README, mục "So sánh PostgreSQL vs MongoDB" để hiểu lý do.
//
// LƯU Ý VỀ XOÁ MỀM: khi nhân viên xoá 1 tin nhắn hoặc cả đoạn chat, dữ liệu
// KHÔNG bị xoá khỏi MongoDB — chỉ được đánh dấu isDeleted = true. Toàn bộ route
// trong file này vẫn trả về đầy đủ nội dung đã xoá (kèm cờ isDeleted) để admin
// có thể kiểm tra/đối soát khi cần.
import { Router } from "express";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { requireMongo } from "../middleware/requireMongo.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { query } from "../config/db.js";
import { Conversation } from "../models/conversation.model.js";
import { Message } from "../models/message.model.js";
import { paginateMessages } from "../services/chatThread.service.js";

const router = Router();
router.use(requireAuth, requireRole("admin"));

// ---------- Người dùng ----------
// Danh sách toàn bộ tài khoản (admin + nhân viên) để quản trị viên nắm được ai
// đang dùng hệ thống. Không trả về password_hash.
router.get(
  "/users",
  asyncHandler(async (req, res) => {
    const result = await query(
      `SELECT id, full_name, email, role, created_at
       FROM users
       ORDER BY created_at DESC`
    );
    res.json({ users: result.rows });
  })
);

async function countAdmins() {
  const result = await query(`SELECT COUNT(*)::int AS count FROM users WHERE role = 'admin'`);
  return result.rows[0].count;
}

// Tạo tài khoản mới — ĐÂY LÀ NƠI DUY NHẤT (ngoài npm run seed cho tài khoản
// admin đầu tiên) mà 1 tài khoản admin mới có thể được tạo ra, và chỉ 1 admin
// đang đăng nhập mới gọi được (route này nằm sau `requireRole("admin")` ở đầu
// file). Route đăng ký công khai (POST /auth/register) đã được sửa để LUÔN
// tạo role 'employee', bất kể gửi gì lên — xem giải thích ở auth.routes.js.
router.post(
  "/users",
  asyncHandler(async (req, res) => {
    const { fullName, email, password, role } = req.body;

    if (!fullName || !email || !password) {
      return res.status(400).json({ error: "Thiếu họ tên, email hoặc mật khẩu." });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: "Mật khẩu cần tối thiểu 6 ký tự." });
    }
    const safeRole = role === "admin" ? "admin" : "employee";

    const existing = await query("SELECT id FROM users WHERE email = $1", [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: "Email đã được sử dụng." });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const result = await query(
      `INSERT INTO users (full_name, email, password_hash, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, full_name, email, role, created_at`,
      [fullName, email, passwordHash, safeRole]
    );

    res.status(201).json({ user: result.rows[0] });
  })
);

// Thăng/hạ quyền 1 tài khoản đã có. 2 lớp bảo vệ để tránh tự khoá mình ra khỏi
// hệ thống quản trị:
//   1. Không cho tự đổi role CHÍNH tài khoản đang đăng nhập (phải nhờ 1 admin
//      khác thao tác) — tránh bấm nhầm rồi mất luôn quyền truy cập trang quản trị.
//   2. Không cho hạ quyền admin CUỐI CÙNG xuống nhân viên — hệ thống luôn cần
//      giữ lại ít nhất 1 tài khoản admin để còn người quản lý được.
router.patch(
  "/users/:id/role",
  asyncHandler(async (req, res) => {
    const { role } = req.body;
    if (!["admin", "employee"].includes(role)) {
      return res.status(400).json({ error: "Vai trò không hợp lệ." });
    }
    if (req.params.id.toLowerCase() === req.user.id.toLowerCase()) {
      return res.status(400).json({ error: "Không thể tự đổi vai trò của chính tài khoản đang đăng nhập." });
    }

    const target = await query("SELECT id, role FROM users WHERE id = $1", [req.params.id]);
    if (target.rows.length === 0) {
      return res.status(404).json({ error: "Không tìm thấy người dùng." });
    }

    if (target.rows[0].role === "admin" && role === "employee" && (await countAdmins()) <= 1) {
      return res.status(400).json({ error: "Không thể hạ quyền — hệ thống cần giữ lại ít nhất 1 quản trị viên." });
    }

    const result = await query(
      `UPDATE users SET role = $1 WHERE id = $2 RETURNING id, full_name, email, role, created_at`,
      [role, req.params.id]
    );
    res.json({ user: result.rows[0] });
  })
);

// Xoá 1 tài khoản — cùng 2 lớp bảo vệ như trên (không tự xoá chính mình,
// không xoá admin cuối cùng).
router.delete(
  "/users/:id",
  asyncHandler(async (req, res) => {
    if (req.params.id.toLowerCase() === req.user.id.toLowerCase()) {
      return res.status(400).json({ error: "Không thể tự xoá chính tài khoản đang đăng nhập." });
    }

    const target = await query("SELECT id, role FROM users WHERE id = $1", [req.params.id]);
    if (target.rows.length === 0) {
      return res.status(404).json({ error: "Không tìm thấy người dùng." });
    }

    if (target.rows[0].role === "admin" && (await countAdmins()) <= 1) {
      return res.status(400).json({ error: "Không thể xoá — hệ thống cần giữ lại ít nhất 1 quản trị viên." });
    }

    await query("DELETE FROM users WHERE id = $1", [req.params.id]);
    res.status(204).end();
  })
);

// ---------- Thống kê ----------
// Trả về đủ số liệu để trang Dashboard vẽ 4 biểu đồ (xem Dashboard.jsx +
// components/charts/):
//   1. documentsByStatus       -> trạng thái văn bản (đã có từ trước)
//   2. conversationsByStatus   -> trạng thái hội thoại (normal/flagged/resolved)
//   3. totalEscalations        -> TỔNG số LẦN cần admin hỗ trợ, cộng dồn qua
//      toàn bộ lịch sử mọi đoạn chat (Conversation.escalationCount — xem giải
//      thích ở conversation.model.js), bất kể tự động phát hiện hay nhân viên
//      tự đánh dấu, và bất kể đoạn chat đó đã "resolved" bao nhiêu lần rồi lại
//      cần hỗ trợ tiếp. Chia cho "totalQuestions" ở Dashboard admin ra "tỷ lệ
//      câu hỏi cần admin hỗ trợ" — khác với "needsReviewCount" bên dưới (chỉ
//      đếm số đoạn chat ĐANG "flagged" ngay lúc này, không phải lịch sử).
//   4. topTopics               -> gọi riêng ở route /stats/top-topics bên dưới
//   5. feedbackBreakdown       -> trong số câu trả lời ĐÃ được nhân viên đánh
//      giá (feedback "helpful"/"unhelpful" — xem PATCH
//      /chat/thread/messages/:messageId/feedback), bao nhiêu % được cho là
//      hữu ích — thước đo chất lượng trả lời tự động theo NGƯỜI DÙNG THẬT
//      chấm, khác với biểu đồ (2)/(3) vốn chỉ dựa vào việc có bị gắn cờ hay
//      không (chatbot có thể trả lời "được" về mặt kỹ thuật — không bị gắn cờ
//      — nhưng vẫn không hữu ích với nhân viên).
router.get(
  "/stats",
  requireMongo,
  asyncHandler(async (req, res) => {
    const [
      { rows: docStats },
      totalConversations,
      totalQuestions,
      needsReviewCount,
      conversationsByStatusAgg,
      escalationCountAgg,
      feedbackAgg,
    ] = await Promise.all([
      query(`SELECT status, COUNT(*)::int AS count FROM documents GROUP BY status`),
      Conversation.countDocuments(),
      // isDeleted: false — tin nhắn đã bị nhân viên xoá mềm (xoá lẻ 1 tin
      // nhắn) không tính vào báo cáo, giống cách 2 truy vấn Message khác ở
      // dưới (feedbackAgg, /stats/top-topics) đã làm.
      Message.countDocuments({ role: "user", isDeleted: false }),
      Conversation.countDocuments({ status: "flagged" }),
      Conversation.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
      Conversation.aggregate([{ $group: { _id: null, total: { $sum: "$escalationCount" } } }]),
      Message.aggregate([
        { $match: { role: "assistant", isDeleted: false, feedback: { $ne: null } } },
        { $group: { _id: "$feedback", count: { $sum: 1 } } },
      ]),
    ]);

    res.json({
      documentsByStatus: docStats,
      conversationsByStatus: conversationsByStatusAgg.map((r) => ({ status: r._id, count: r.count })),
      totalEscalations: escalationCountAgg[0]?.total || 0,
      feedbackBreakdown: feedbackAgg.map((r) => ({ feedback: r._id, count: r.count })),
      totalConversations,
      totalQuestions,
      needsReviewCount,
    });
  })
);

// Thống kê VẤN ĐỀ (quy chế) được hỏi nhiều nhất — KHÁC với cách cũ (gộp theo
// trùng khớp chính xác nội dung câu hỏi, dễ bị tách lẻ vì 2 câu hỏi cùng ý
// nhưng viết khác nhau sẽ không gộp được). Ở đây tính theo số lần TRUY XUẤT
// được từ mỗi quy chế: mỗi câu trả lời của chatbot (role "assistant") kèm 1
// danh sách "sources" (quy chế đã dùng để trả lời — xem answerQuestion() ở
// rag.service.js); mỗi lần 1 quy chế xuất hiện trong "sources" của 1 câu trả
// lời được tính là 1 lần truy xuất. Nhóm theo "documentId" (ổn định dù quy
// chế bị đổi tên sau đó) rồi lấy tiêu đề mới nhất để hiển thị. Nhờ vậy, dù
// nhân viên hỏi bằng nhiều cách diễn đạt khác nhau nhưng cùng cần tới 1 quy
// chế (VD: "nghỉ phép được mấy ngày" và "bao nhiêu ngày nghỉ phép 1 năm"),
// quy chế đó vẫn được gộp đúng vào 1 vấn đề duy nhất. Chỉ tính câu trả lời
// CHƯA bị xoá và có ít nhất 1 nguồn trích dẫn.
router.get(
  "/stats/top-topics",
  requireMongo,
  asyncHandler(async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 10, 50);

    const results = await Message.aggregate([
      { $match: { role: "assistant", isDeleted: false, "sources.0": { $exists: true } } },
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

    res.json({ topTopics: results });
  })
);

// ---------- Đoạn chat ----------
// Truyền ?status=flagged để chỉ lấy các đoạn chat đang CẦN ADMIN TRẢ LỜI
// (xem models/conversation.model.js để biết ý nghĩa từng trạng thái).
router.get(
  "/conversations",
  requireMongo,
  asyncHandler(async (req, res) => {
    const filter = {};
    if (["normal", "flagged", "resolved"].includes(req.query.status)) {
      filter.status = req.query.status;
    }

    const conversations = await Conversation.find(filter)
      .select(
        "title status autoEscalated isDeleted deletedAt createdAt flaggedAt resolvedAt userName userEmail summary summaryGeneratedAt"
      )
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();
    res.json({ conversations });
  })
);

// Xem tin nhắn của 1 đoạn chat bất kỳ, có phân trang giống phía nhân viên
// (không truyền "before" -> trang mới nhất; truyền "before" -> tải thêm tin cũ
// hơn). Khác với API phía nhân viên, ở đây LUÔN bao gồm cả tin nhắn đã bị xoá
// mềm (includeDeleted: true) để admin xem được đầy đủ.
router.get(
  "/conversations/:id/messages",
  requireMongo,
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: "ID hội thoại không hợp lệ." });
    }

    const conversation = await Conversation.findById(req.params.id).lean();
    if (!conversation) {
      return res.status(404).json({ error: "Không tìm thấy hội thoại." });
    }

    const { messages, hasMore } = await paginateMessages(conversation._id, {
      before: req.query.before,
      limit: req.query.limit,
      includeDeleted: true,
    });

    res.json({
      title: conversation.title,
      status: conversation.status,
      autoEscalated: conversation.autoEscalated,
      isDeleted: conversation.isDeleted,
      userName: conversation.userName,
      userEmail: conversation.userEmail,
      summary: conversation.summary,
      messages,
      hasMore,
    });
  })
);

// Admin trả lời trực tiếp vào 1 đoạn chat (dùng cho các đoạn chat "flagged" —
// câu hỏi khó hoặc liên quan tài liệu nhạy cảm mà chatbot không tự trả lời
// được). Tin nhắn được thêm với role 'admin' để phía nhân viên phân biệt được
// đây là người thật trả lời chứ không phải chatbot.
// LƯU Ý: nếu đoạn chat này đã bị nhân viên xoá mềm (isDeleted = true), nhân
// viên sẽ KHÔNG thấy câu trả lời này (vì phía họ chỉ hiển thị đoạn chat đang
// hoạt động) — API vẫn cho phép trả lời để giữ đầy đủ hồ sơ, nhưng trả về
// cảnh báo để admin biết.
router.post(
  "/conversations/:id/reply",
  requireMongo,
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: "ID hội thoại không hợp lệ." });
    }

    const { message } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ error: "Nội dung trả lời không được để trống." });
    }

    const conversation = await Conversation.findById(req.params.id);
    if (!conversation) {
      return res.status(404).json({ error: "Không tìm thấy hội thoại." });
    }

    await Message.create({ conversationId: conversation._id, role: "admin", content: message });
    conversation.status = "resolved";
    conversation.resolvedAt = new Date();
    await conversation.save();

    res.json({
      status: conversation.status,
      warning: conversation.isDeleted
        ? "Đoạn chat này đã bị nhân viên xoá — họ sẽ không thấy câu trả lời này trừ khi liên hệ lại."
        : null,
    });
  })
);

export default router;
