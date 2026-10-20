// /api/chat — đoạn chat của nhân viên với trợ lý AI ("1 nhân viên = 1 đoạn
// chat liên tục"). Logic ở services/chat.service.js.
//   GET /thread                        -> trang tin nhắn MỚI NHẤT
//   GET /thread?before=<ISO timestamp>  -> trang CŨ HƠN mốc thời gian đó
//   GET /thread?limit=30                -> tuỳ chỉnh số tin nhắn/trang (mặc định 20)
import { Router } from "express";
import { ROLE } from "../constants/enums.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { requireMongo } from "../middleware/requireMongo.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export function createChatRouter({ chatService }) {
  const router = Router();
  // Toàn bộ route trong file này đều đọc/ghi hội thoại (MongoDB), nên yêu cầu
  // Mongo phải sẵn sàng — PostgreSQL (auth, documents) không bị ảnh hưởng.
  router.use(requireAuth, requireRole(ROLE.ADMIN, ROLE.USER), requireMongo);

  router.get("/thread", asyncHandler(async (req, res) => {
    res.json(await chatService.getThread(req.user, req.query));
  }));

  router.post("/thread/ask", asyncHandler(async (req, res) => {
    res.json(await chatService.ask(req.user, req.body.question));
  }));

  router.post("/thread/flag", asyncHandler(async (req, res) => {
    res.json(await chatService.requestAdminHelp(req.user));
  }));

  router.patch("/thread/messages/:messageId/feedback", asyncHandler(async (req, res) => {
    res.json(await chatService.setFeedback(req.user, req.params.messageId, req.body.feedback));
  }));

  router.delete("/thread", asyncHandler(async (req, res) => {
    res.json(await chatService.resetThread(req.user));
  }));

  router.delete("/thread/messages/:messageId", asyncHandler(async (req, res) => {
    await chatService.deleteMessage(req.user, req.params.messageId);
    res.status(204).end();
  }));

  return router;
}
