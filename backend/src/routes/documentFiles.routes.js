// /api/doc-files — xem trước / tải FILE GỐC của 1 tài liệu, dành cho MỌI người
// dùng của cửa hàng (admin lẫn nhân viên), KHÔNG chỉ admin như documents.routes.js.
//
// Tách thành router riêng vì documents.routes.js có `requireRole("admin")` áp
// dụng cho TOÀN BỘ route bên trong — nếu thêm route tải file vào đó, nhân viên
// bình thường sẽ luôn bị chặn 403 trước khi route kịp chạy.
//
// Đây chính là tính năng "trích dẫn tài liệu để tải" trong popover tuỳ chọn
// tin nhắn (Chat.jsx). Logic (gồm kiểm tra tài liệu nhạy cảm) ở
// services/regulationDocument.service.js.
import { Router } from "express";
import { ROLE } from "../constants/enums.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export function createDocumentFilesRouter({ regulationDocumentService }) {
  const router = Router();
  router.use(requireAuth, requireRole(ROLE.ADMIN, ROLE.USER));

  // Xem nhanh nội dung (text đã trích xuất) ngay trong trình duyệt
  router.get("/:id/preview", asyncHandler(async (req, res) => {
    res.json(await regulationDocumentService.getPreview(req.user, req.params.id));
  }));

  // Tải nguyên file gốc về máy
  router.get("/:id/download", asyncHandler(async (req, res) => {
    const { absolutePath, downloadName } = await regulationDocumentService.getDownload(req.user, req.params.id);
    res.download(absolutePath, downloadName, (err) => {
      // res.download() đã tự gửi response nếu thành công; err chỉ xảy ra khi
      // không đọc được file (VD: đã bị xoá thủ công khỏi đĩa) — lúc đó
      // headers có thể đã được gửi 1 phần nên phải kiểm tra trước khi trả lỗi.
      if (err && !res.headersSent) {
        res.status(404).json({ error: "Không tìm thấy file trên máy chủ (có thể đã bị xoá)." });
      }
    });
  }));

  return router;
}
