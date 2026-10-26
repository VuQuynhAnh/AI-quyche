import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

// Các hộp thoại đang mở, theo thứ tự mở — Esc chỉ đóng hộp thoại TRÊN CÙNG
// (VD popup "Vị trí" mở chồng trên popup chi tiết ngày công).
const openModals = [];

// Hộp thoại chung (markup modal Bootstrap, hiện tĩnh — không dùng JS của
// Bootstrap). Đóng bằng Esc hoặc bấm ra ngoài; render qua Portal để không bị
// overflow cắt. z-index trên cửa sổ chat nổi, dưới hộp xác nhận/toast.
export default function Modal({ title, onClose, children, footer, width = 560 }) {
  const id = useRef(Symbol("modal")).current;

  useEffect(() => {
    openModals.push(id);
    return () => openModals.splice(openModals.indexOf(id), 1);
  }, [id]);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && openModals[openModals.length - 1] === id && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [id, onClose]);

  return createPortal(
    <>
      <div className="modal-backdrop show" style={{ zIndex: 1085 }} />
      <div
        className="modal d-block"
        style={{ zIndex: 1090 }}
        role="dialog"
        aria-modal="true"
        onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      >
        <div className="modal-dialog modal-dialog-centered modal-dialog-scrollable" style={{ maxWidth: `min(${width}px, calc(100% - 1rem))` }}>
          <div className="modal-content border-0 shadow">
            <div className="modal-header py-2">
              <h2 className="modal-title h6">{title}</h2>
              <button type="button" className="btn-close" aria-label="Đóng" onClick={onClose} />
            </div>
            {/* overflow-x hidden: .row có margin âm sẽ sinh thanh cuộn ngang */}
            <div className="modal-body overflow-x-hidden">{children}</div>
            {footer && <div className="modal-footer py-2">{footer}</div>}
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}
