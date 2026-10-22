// /api/auth — đăng nhập (công khai). Không có đăng ký công khai: tài khoản do
// superadmin hoặc admin cửa hàng tạo. Logic ở services/auth.service.js.
import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";

export function createAuthRouter({ authService }) {
  const router = Router();

  router.post("/login", asyncHandler(async (req, res) => {
    res.json(await authService.login(req.body, { ip: req.ip }));
  }));

  return router;
}
