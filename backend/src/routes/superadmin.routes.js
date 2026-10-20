// /api/superadmin — chỉ superadmin: cửa hàng (kèm admin đầu tiên) và tài khoản
// superadmin. Logic ở services/superadmin.service.js.
import { Router } from "express";
import { ROLE } from "../constants/enums.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export function createSuperadminRouter({ superadminService }) {
  const router = Router();
  router.use(requireAuth, requireRole(ROLE.SUPERADMIN));

  router.get("/stores", asyncHandler(async (req, res) => {
    res.json(await superadminService.listStores());
  }));

  router.post("/stores", asyncHandler(async (req, res) => {
    res.status(201).json(await superadminService.createStore(req.user, req.body));
  }));

  router.patch("/stores/:id", asyncHandler(async (req, res) => {
    res.json(await superadminService.updateStore(req.params.id, req.body));
  }));

  router.get("/accounts", asyncHandler(async (req, res) => {
    res.json(await superadminService.listSuperadmins());
  }));

  router.post("/accounts", asyncHandler(async (req, res) => {
    res.status(201).json(await superadminService.createSuperadmin(req.body));
  }));

  return router;
}
