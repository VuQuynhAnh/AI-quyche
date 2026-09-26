// Route quản lý văn bản — chỉ dành cho admin (upload, xem danh sách, xoá)
import { Router } from "express";
import multer from "multer";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  createDocumentRecord,
  processDocumentAsync,
  listDocuments,
  deleteDocument,
  saveDocumentFile,
  setDocumentStoragePath,
} from "../services/document.service.js";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

router.use(requireAuth, requireRole("admin"));

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const docs = await listDocuments();
    res.json({ documents: docs });
  })
);

router.post(
  "/",
  upload.single("file"),
  asyncHandler(async (req, res) => {
    const { title, category, isSensitive } = req.body;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: "Vui lòng chọn file để upload (PDF, DOCX hoặc TXT)." });
    }

    // Form gửi qua FormData nên "isSensitive" tới đây là chuỗi "true"/"false" (hoặc "on"
    // nếu dùng input checkbox không kiểm soát) chứ không phải boolean thật.
    const doc = await createDocumentRecord({
      title: title || file.originalname,
      category,
      originalFilename: file.originalname,
      isSensitive: isSensitive === "true" || isSensitive === "on",
      uploadedBy: req.user.id,
    });

    // Lưu file gốc xuống đĩa (backend/uploads/) NGAY LÚC NÀY vì buffer chỉ tồn
    // tại trong bộ nhớ trong phạm vi request này (multer.memoryStorage) — nếu
    // không lưu lại, sẽ không còn cách nào phục vụ tính năng "tải tài liệu
    // nguồn" ở popover trích dẫn tin nhắn sau này.
    const storagePath = await saveDocumentFile(doc.id, file.buffer, file.originalname);
    await setDocumentStoragePath(doc.id, storagePath);

    // Không "await" — xử lý (trích xuất + embedding) chạy nền, trả response ngay
    // để người dùng không phải chờ, trạng thái sẽ tự chuyển 'ready' khi xong.
    processDocumentAsync(doc.id, file.buffer, file.mimetype, file.originalname);

    res.status(202).json({
      document: { ...doc, storage_path: storagePath },
      message: "Đã nhận file, đang xử lý trong nền.",
    });
  })
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    await deleteDocument(req.params.id);
    res.status(204).end();
  })
);

export default router;
