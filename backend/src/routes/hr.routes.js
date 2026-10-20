// /api/hr — QUẢN TRỊ chấm công & lương của cửa hàng (chỉ admin cửa hàng):
//  /setting     : thiết lập cửa hàng     → services/storeSetting.service.js
//  /employees   : nhân viên, lương giờ   → services/employee.service.js
//  /clockings   : bảng công, sửa giờ     → services/clockingManagement.service.js
//  /paysheets   : bảng lương tháng       → services/paysheet.service.js
import { Router } from "express";
import { ROLE } from "../constants/enums.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export function createHrRouter({ storeSettingService, employeeService, clockingManagementService, paysheetService }) {
  const router = Router();
  router.use(requireAuth, requireRole(ROLE.ADMIN));

  // ---------- Thiết lập cửa hàng ----------
  router.get("/setting", asyncHandler(async (req, res) => {
    res.json(await storeSettingService.get(req.user));
  }));

  router.patch("/setting", asyncHandler(async (req, res) => {
    res.json(await storeSettingService.update(req.user, req.body));
  }));

  // ---------- Nhân viên ----------
  router.get("/employees", asyncHandler(async (req, res) => {
    res.json(await employeeService.list(req.user));
  }));

  router.post("/employees", asyncHandler(async (req, res) => {
    res.status(201).json(await employeeService.create(req.user, req.body));
  }));

  router.patch("/employees/:id", asyncHandler(async (req, res) => {
    res.json(await employeeService.update(req.user, req.params.id, req.body));
  }));

  // ---------- Chấm công ----------
  router.get("/clockings/overview", asyncHandler(async (req, res) => {
    res.json(await clockingManagementService.getMonthOverview(req.user, req.query));
  }));

  router.get("/clockings/day", asyncHandler(async (req, res) => {
    res.json(await clockingManagementService.getDayDetail(req.user, req.query));
  }));

  router.post("/clockings/day-edit", asyncHandler(async (req, res) => {
    res.json(await clockingManagementService.editDay(req.user, req.body));
  }));

  // ---------- Bảng lương ----------
  router.get("/paysheets", asyncHandler(async (req, res) => {
    res.json(await paysheetService.getMonth(req.user, req.query.month));
  }));

  router.post("/paysheets", asyncHandler(async (req, res) => {
    res.status(201).json(await paysheetService.create(req.user, req.body));
  }));

  router.post("/paysheets/:id/recalculate", asyncHandler(async (req, res) => {
    res.json(await paysheetService.recalculate(req.user, req.params.id));
  }));

  router.post("/paysheets/:id/finalize", asyncHandler(async (req, res) => {
    res.json(await paysheetService.finalize(req.user, req.params.id));
  }));

  router.post("/paysheets/:id/cancel", asyncHandler(async (req, res) => {
    res.json(await paysheetService.cancel(req.user, req.params.id, req.body));
  }));

  router.get("/paysheets/:id/export", asyncHandler(async (req, res) => {
    const { filename, content } = await paysheetService.exportCsv(req.user, req.params.id);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(content);
  }));

  return router;
}
