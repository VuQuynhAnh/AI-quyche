import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { subscribeLoading } from "../api/client.js";

// Lớp phủ "đang tải" toàn màn hình, hiện khi có request đang chạy (tải trang,
// lưu, xoá...) để người dùng không bấm/sửa thứ khác cùng lúc. Chờ 200ms mới
// hiện để request nhanh không bị nháy màn hình.
const SHOW_DELAY_MS = 200;

export default function GlobalLoading() {
  const [busy, setBusy] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => subscribeLoading((count) => setBusy(count > 0)), []);

  useEffect(() => {
    if (!busy) {
      setVisible(false);
      return undefined;
    }
    const t = setTimeout(() => setVisible(true), SHOW_DELAY_MS);
    return () => clearTimeout(t);
  }, [busy]);

  if (!visible) return null;
  return createPortal(
    <div
      className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center global-loading z-loading"
      role="status"
      aria-live="polite"
    >
      <div className="d-flex align-items-center gap-3 bg-white rounded-3 shadow px-4 py-3 fw-medium">
        <span className="spinner-border text-primary" aria-hidden="true" />
        <span>Đang xử lý...</span>
      </div>
    </div>,
    document.body
  );
}
