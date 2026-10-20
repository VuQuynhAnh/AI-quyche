// /api/documents — quản lý văn bản quy chế của cửa hàng (chỉ admin): upload, xem danh sách, xoá.
// Logic ở services/regulationDocument.service.js.
import { Router } from "express";
import multer from "multer";
import { ROLE } from "../constants/enums.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

export function createDocumentsRouter({ regulationDocumentService }) {
  const router = Router();
  router.use(requireAuth, requireRole(ROLE.ADMIN));

  router.get("/", asyncHandler(async (req, res) => {
    res.json(await regulationDocumentService.list(req.user));
  }));

  // 202 Accepted: file đã nhận, phần xử lý (trích xuất + embedding) chạy nền
  router.post("/", upload.single("file"), asyncHandler(async (req, res) => {
    res.status(202).json(await regulationDocumentService.upload(req.user, req.body, req.file));
  }));

  router.delete("/:id", asyncHandler(async (req, res) => {
    await regulationDocumentService.remove(req.user, req.params.id);
    res.status(204).end();
  }));

  return router;
}
