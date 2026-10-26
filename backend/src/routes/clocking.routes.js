// /api/clocking — chấm công cho NHÂN VIÊN (role user, dùng trên điện thoại):
//  - GET  /store/:id   : (công khai) tên cửa hàng cho trang quét QR
//  - GET  /me/today    : trạng thái hôm nay + lần bấm tiếp theo
//  - GET  /me/wifi     : đang dùng Wi-Fi cửa hàng không (chỉ khi cửa hàng bật chấm công Wi-Fi)
//  - POST /check       : check-in / check-out (cần GPS + QR, hoặc GPS + Wi-Fi cửa hàng)
//  - GET  /me/month    : lịch sử + lương của 1 tháng
//  - GET  /me/day      : các lần chấm công của 1 ngày
// Logic ở services/clocking.service.js.
import { Router } from "express";
import { ROLE } from "../constants/enums.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export function createClockingRouter({ clockingService }) {
  const router = Router();

  router.get("/store/:id", asyncHandler(async (req, res) => {
    res.json(await clockingService.getPublicStore(req.params.id));
  }));

  // Admin cửa hàng cũng chấm công như nhân viên (chỉ superadmin thì không)
  router.use(requireAuth, requireRole(ROLE.USER, ROLE.ADMIN));

  router.get("/me/today", asyncHandler(async (req, res) => {
    res.json(await clockingService.getToday(req.user));
  }));

  router.get("/me/wifi", asyncHandler(async (req, res) => {
    // ?latitude=&longitude=&accuracy= (GPS hiện tại) để kiểm tra có đang ở gần cửa hàng
    const { latitude, longitude, accuracy } = req.query;
    res.json(await clockingService.checkWifi(req.user, { ip: req.ip, latitude, longitude, accuracy }));
  }));

  router.post("/check", asyncHandler(async (req, res) => {
    res.status(201).json(await clockingService.check(req.user, req.body, { ip: req.ip }));
  }));

  router.get("/me/month", asyncHandler(async (req, res) => {
    res.json(await clockingService.getMonth(req.user, req.query.month));
  }));

  router.get("/me/day", asyncHandler(async (req, res) => {
    res.json(await clockingService.getDay(req.user, req.query.date));
  }));

  return router;
}
