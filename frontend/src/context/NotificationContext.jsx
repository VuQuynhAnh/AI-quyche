import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// Context dùng CHUNG TOÀN APP để thay cho 2 hộp thoại gốc của trình duyệt:
//  - window.confirm(...) — chặn cả tab, mỗi trình duyệt/OS hiện khác nhau,
//    không tô màu/đổi chữ nút được (luôn "OK"/"Cancel").
//  - window.alert(...) / các khối <div className="alert ..."> rải rác từng
//    trang — không tự biến mất, không phân biệt rõ thành công hay thất bại.
// Thay bằng 2 thứ TỰ THIẾT KẾ (component riêng, không phải API trình duyệt):
//  1. confirm(message, options) — trả về Promise<boolean> giống hàm gốc nên
//     dùng được với "await", nhưng render bằng modal tự vẽ, tuỳ biến được chữ
//     trên nút (confirmText/cancelText) và tô màu nguy hiểm (danger) cho các
//     hành động xoá.
//  2. notifySuccess(message) / notifyError(message) — toast (popup nhỏ) hiện
//     ở góc dưới-phải, tự biến mất sau vài giây (lỗi hiện lâu hơn thành công
//     vì thường dài hơn, cần thời gian đọc), có nút đóng riêng nếu muốn tắt
//     sớm.
const NotificationContext = createContext(null);

let toastSeq = 0;

export function NotificationProvider({ children }) {
  const [toasts, setToasts] = useState([]); // { id, type: 'success' | 'error', message }
  const [confirmState, setConfirmState] = useState(null); // { message, resolve, confirmText?, cancelText?, danger? }
  const timers = useRef({});

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    clearTimeout(timers.current[id]);
    delete timers.current[id];
  }, []);

  const notify = useCallback(
    (type, message, duration) => {
      const id = ++toastSeq;
      setToasts((prev) => [...prev, { id, type, message }]);
      timers.current[id] = setTimeout(() => dismissToast(id), duration);
    },
    [dismissToast]
  );

  const notifySuccess = useCallback((message) => notify("success", message, 3500), [notify]);
  const notifyError = useCallback((message) => notify("error", message, 6000), [notify]);

  // Thay window.confirm() — trả về Promise, resolve(true/false) khi người
  // dùng bấm 1 trong 2 nút (hoặc Esc/bấm ra ngoài = false, coi như "Huỷ").
  const confirmDialog = useCallback((message, options = {}) => {
    return new Promise((resolve) => {
      setConfirmState({ message, resolve, ...options });
    });
  }, []);

  function answerConfirm(answer) {
    confirmState?.resolve(answer);
    setConfirmState(null);
  }

  useEffect(() => {
    if (!confirmState) return;
    function handleKeyDown(e) {
      if (e.key === "Escape") answerConfirm(false);
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmState]);

  // Dọn hết timer còn treo khi (hiếm khi) cả Provider bị unmount, tránh
  // setState lên component đã gỡ khỏi DOM.
  useEffect(() => {
    return () => {
      Object.values(timers.current).forEach(clearTimeout);
    };
  }, []);

  return (
    <NotificationContext.Provider value={{ notifySuccess, notifyError, confirm: confirmDialog }}>
      {children}

      {/* Toast — render qua Portal thẳng vào <body> để không bị ảnh hưởng bởi
          overflow/z-index của bất kỳ trang nào đang hiện. */}
      {toasts.length > 0 &&
        createPortal(
          <div className="toast-stack" role="status" aria-live="polite">
            {toasts.map((t) => (
              <div key={t.id} className={`app-toast app-toast-${t.type}`}>
                <span className="app-toast-icon" aria-hidden="true">
                  {t.type === "success" ? <CheckIcon /> : <ErrorIcon />}
                </span>
                <span className="app-toast-message">{t.message}</span>
                <button
                  type="button"
                  className="app-toast-close"
                  aria-label="Đóng thông báo"
                  onClick={() => dismissToast(t.id)}
                >
                  <CloseIcon />
                </button>
              </div>
            ))}
          </div>,
          document.body
        )}

      {/* Hộp thoại xác nhận — chỉ 1 cái tại 1 thời điểm (đủ dùng cho toàn app,
          chưa có nơi nào cần xác nhận 2 việc cùng lúc). */}
      {confirmState &&
        createPortal(
          <div
            className="confirm-dialog-backdrop"
            onClick={(e) => {
              if (e.target === e.currentTarget) answerConfirm(false);
            }}
          >
            <div className="confirm-dialog-modal" role="alertdialog" aria-modal="true">
              <p className="confirm-dialog-message">{confirmState.message}</p>
              <div className="confirm-dialog-actions">
                <button
                  type="button"
                  className="btn btn-outline-secondary btn-sm"
                  onClick={() => answerConfirm(false)}
                >
                  {confirmState.cancelText || "Huỷ"}
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${confirmState.danger ? "btn-danger" : "btn-primary"}`}
                  onClick={() => answerConfirm(true)}
                >
                  {confirmState.confirmText || "Đồng ý"}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </NotificationContext.Provider>
  );
}

export function useNotification() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error("useNotification phải được dùng bên trong <NotificationProvider>");
  return ctx;
}

// Icon SVG tối thiểu, cùng phong cách đường nét mảnh với icon ở các trang khác
// trong app (AdminLayout.jsx, Chat.jsx...).
function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function ErrorIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="13" />
      <line x1="12" y1="16" x2="12" y2="16.01" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}
