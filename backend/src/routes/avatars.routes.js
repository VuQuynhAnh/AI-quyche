// /api/avatars/<file> — ảnh đại diện nhân viên, CÔNG KHAI (không cần token) để
// thẻ <img> hiển thị được. Tên file là UUID ngẫu nhiên nên không đoán được; chỉ
// nhận đúng dạng tên đó để không đọc được file nào khác trong uploads/.
import { Router } from "express";

const FILE_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/i;

export function createAvatarsRouter({ fileStorage }) {
  const router = Router();

  router.get("/:file", (req, res) => {
    if (!FILE_RE.test(req.params.file)) return res.status(404).end();
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable"); // đổi ảnh = đổi tên file
    res.sendFile(fileStorage.resolvePath(`avatars/${req.params.file}`), (err) => {
      if (err && !res.headersSent) res.status(404).end();
    });
  });

  return router;
}
