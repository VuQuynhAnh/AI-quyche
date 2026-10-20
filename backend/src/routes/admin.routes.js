// /api/admin — trang quản trị của cửa hàng (chỉ admin cửa hàng):
//  - /stats, /stats/top-topics: số liệu trợ lý AI      → services/dashboard.service.js
//  - /conversations ...       : xem & trả lời chat     → services/supportInbox.service.js
import { Router } from "express";
import { ROLE } from "../constants/enums.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { requireMongo } from "../middleware/requireMongo.js";
import { asyncHandler } from "../utils/asyncHandler.js";

// (Người của cửa hàng — kể cả thăng/hạ admin — quản lý ở /api/hr/employees)
export function createAdminRouter({ dashboardService, supportInboxService }) {
  const router = Router();
  router.use(requireAuth, requireRole(ROLE.ADMIN));

  // ---------- Thống kê ----------
  router.get("/stats", requireMongo, asyncHandler(async (req, res) => {
    res.json(await dashboardService.getStats(req.user));
  }));

  router.get("/stats/top-topics", requireMongo, asyncHandler(async (req, res) => {
    res.json(await dashboardService.getTopTopics(req.user, req.query.limit));
  }));

  // ---------- Đoạn chat ----------
  router.get("/conversations", requireMongo, asyncHandler(async (req, res) => {
    res.json(await supportInboxService.listConversations(req.user, req.query));
  }));

  router.get("/conversations/:id/messages", requireMongo, asyncHandler(async (req, res) => {
    res.json(await supportInboxService.getConversationMessages(req.user, req.params.id, req.query));
  }));

  router.post("/conversations/:id/reply", requireMongo, asyncHandler(async (req, res) => {
    res.json(await supportInboxService.reply(req.user, req.params.id, req.body.message));
  }));

  return router;
}
