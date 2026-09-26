// Route TẢI FILE GỐC của 1 tài liệu — dành cho MỌI người dùng đã đăng nhập
// (admin lẫn nhân viên), KHÔNG chỉ admin như documents.routes.js.
//
// Tách thành file/route riêng (thay vì thêm route vào documents.routes.js) vì
// router đó có `router.use(requireAuth, requireRole("admin"))` áp dụng cho
// TOÀN BỘ route bên trong — nếu thêm route tải file vào đó, nhân viên bình
// thường sẽ luôn bị chặn 403 trước khi route kịp chạy.
//
// Đây chính là tính năng "trích dẫn tài liệu để tải" trong popover tuỳ chọn
// tin nhắn (Chat.jsx) — mỗi tin nhắn trả lời của chatbot có thể kèm 1 vài
// "sources" (tài liệu đã dùng để trả lời), và nhân viên có thể bấm tải file
// gốc của tài liệu đó ngay từ popover.
//
// AN TOÀN: dù rag.service.js đã đảm bảo KHÔNG BAO GIỜ trả tài liệu nhạy cảm
// (is_sensitive = true) trong "sources" gửi cho nhân viên, route này vẫn tự
// kiểm tra lại is_sensitive trước khi cho tải — nguyên tắc "phòng thủ theo
// chiều sâu" (defense in depth), không dựa hoàn toàn vào 1 tầng duy nhất.
import { Router } from "express";
import path from "path";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { getDocumentFile, resolveUploadPath, getDocumentFullText } from "../services/document.service.js";

const router = Router();
router.use(requireAuth);

// Xem trước nội dung văn bản NGAY TRONG TRÌNH DUYỆT — trả về text đã trích
// xuất (ghép lại từ các chunk đã lưu), KHÔNG tải file gốc về máy. Đặt route
// này TRƯỚC "/:id/download" trong file (thứ tự không quan trọng ở đây vì 2
// route có path khác nhau, nhưng để cạnh nhau cho dễ đối chiếu 2 cách "xem"
// văn bản: xem nhanh nội dung vs. tải nguyên file gốc).
router.get(
  "/:id/preview",
  asyncHandler(async (req, res) => {
    const doc = await getDocumentFile(req.params.id);

    if (!doc) {
      return res.status(404).json({ error: "Không tìm thấy tài liệu (có thể đã bị quản trị viên xoá)." });
    }

    if (doc.is_sensitive && req.user.role !== "admin") {
      return res.status(403).json({
        error: "Tài liệu này thuộc diện nhạy cảm — vui lòng liên hệ trực tiếp quản trị viên để được hỗ trợ.",
      });
    }

    if (doc.status !== "ready") {
      return res.status(409).json({
        error: "Văn bản đang xử lý hoặc xử lý thất bại, chưa có nội dung để xem trước.",
      });
    }

    const content = await getDocumentFullText(doc.id);
    res.json({ title: doc.title, content });
  })
);

router.get(
  "/:id/download",
  asyncHandler(async (req, res) => {
    const doc = await getDocumentFile(req.params.id);

    if (!doc || !doc.storage_path) {
      return res.status(404).json({ error: "Không tìm thấy file tài liệu (có thể đã bị quản trị viên xoá)." });
    }

    if (doc.is_sensitive && req.user.role !== "admin") {
      return res.status(403).json({
        error: "Tài liệu này thuộc diện nhạy cảm — vui lòng liên hệ trực tiếp quản trị viên để được hỗ trợ.",
      });
    }

    const absolutePath = resolveUploadPath(doc.storage_path);
    const downloadName = doc.original_filename || `${doc.title}${path.extname(doc.storage_path)}`;

    res.download(absolutePath, downloadName, (err) => {
      // res.download() đã tự gửi response nếu thành công; err chỉ xảy ra khi
      // không đọc được file (VD: đã bị xoá thủ công khỏi đĩa) — lúc đó
      // headers có thể đã được gửi 1 phần nên phải kiểm tra trước khi trả lỗi.
      if (err && !res.headersSent) {
        res.status(404).json({ error: "Không tìm thấy file trên máy chủ (có thể đã bị xoá)." });
      }
    });
  })
);

export default router;
