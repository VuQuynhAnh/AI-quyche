// /api/avatars/<file> — ảnh đại diện nhân viên, CÔNG KHAI (không cần token) để
// thẻ <img> hiển thị được. Tên file là UUID ngẫu nhiên nên không đoán được; chỉ
// nhận đúng dạng tên đó để không đọc được file nào khác trong uploads/.
// Ảnh lưu trên Cloudinary (có publicUrl) -> chuyển hướng sang link CDN.
import { Router } from "express";

const FILE_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/i;

export function createAvatarsRouter({ imageStorage }) {
  const router = Router();

  router.get("/:file", (req, res) => {
    if (!FILE_RE.test(req.params.file)) return res.status(404).end();
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable"); // đổi ảnh = đổi tên file
    if (imageStorage.publicUrl) return res.redirect(301, imageStorage.publicUrl(`avatars/${req.params.file}`));
    res.sendFile(imageStorage.resolvePath(`avatars/${req.params.file}`), (err) => {
      if (err && !res.headersSent) res.status(404).end();
    });
  });

  return router;
}
