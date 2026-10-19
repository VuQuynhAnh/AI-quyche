import { useEffect } from "react";
import { createPortal } from "react-dom";

// Hộp thoại chung: dùng lại lớp phủ .doc-preview-backdrop của trang Quy chế.
// Đóng bằng Esc hoặc bấm ra ngoài; render qua Portal để không bị overflow cắt.
export default function Modal({ title, onClose, children, footer, width = 560 }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div className="doc-preview-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="doc-preview-modal" style={{ width: `min(${width}px, 100%)` }} role="dialog" aria-modal="true">
        <div className="d-flex justify-content-between align-items-start mb-2 gap-2">
          <h2 className="h6 mb-0">{title}</h2>
          <button type="button" className="btn-close" aria-label="Đóng" onClick={onClose} />
        </div>
        <div className="doc-preview-body">{children}</div>
        {footer && <div className="d-flex justify-content-end gap-2 pt-3">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}
