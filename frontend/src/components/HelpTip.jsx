import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// Dấu "?" nhỏ cạnh nhãn: rê chuột / focus (máy tính) hoặc chạm (điện thoại) để
// xem hướng dẫn. Dùng cho chữ giải thích CỐ ĐỊNH để màn hình gọn, ai cần mới
// xem — cảnh báo theo tình huống (VD "tháng chưa kết thúc") vẫn hiện thẳng.
// Tự vẽ (Portal + fixed) thay cho Tooltip của Bootstrap: không phải khởi tạo /
// huỷ thủ công, chạm được trên điện thoại, không bị khung cuộn của modal cắt.
// label (tuỳ chọn): chữ hiện cạnh dấu "?" (VD "Cách chấm công").
const GAP = 6;
const EDGE = 8;

export default function HelpTip({ children, label }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false); // mở bằng bấm/chạm -> giữ tới khi bấm ra ngoài
  const [pos, setPos] = useState(null);
  const triggerRef = useRef(null);
  const tipRef = useRef(null);

  function close() {
    setOpen(false);
    setPinned(false);
  }

  // Ưu tiên hiện phía trên, không đủ chỗ thì xuống dưới; canh giữa theo dấu "?"
  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const t = triggerRef.current.getBoundingClientRect();
    const tip = tipRef.current.getBoundingClientRect();
    const above = t.top - tip.height - GAP >= EDGE;
    setPos({
      left: Math.max(EDGE, Math.min(t.left + t.width / 2 - tip.width / 2, window.innerWidth - tip.width - EDGE)),
      top: above ? t.top - tip.height - GAP : t.bottom + GAP,
    });
  }, [open]);

  // Đóng khi bấm ra ngoài, nhấn Esc, cuộn hoặc đổi kích thước cửa sổ
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => !triggerRef.current?.contains(e.target) && close();
    const onKey = (e) => e.key === "Escape" && (e.stopPropagation(), close());
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="btn btn-link p-0 border-0 align-baseline text-secondary text-decoration-none d-inline-flex align-items-center gap-1 ms-1"
        style={{ fontSize: "inherit", lineHeight: 1 }}
        aria-label={label ? undefined : "Xem hướng dẫn"}
        aria-describedby={open ? id : undefined}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => !pinned && setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => !pinned && setOpen(false)}
        onClick={(e) => {
          e.preventDefault(); // nằm trong <label> thì không chuyển focus sang ô nhập
          const next = !pinned;
          setPinned(next);
          setOpen(next);
        }}
      >
        {label && <span className="small text-decoration-underline" style={{ textDecorationStyle: "dotted" }}>{label}</span>}
        <span
          className="d-inline-flex align-items-center justify-content-center rounded-circle border border-secondary-subtle fw-semibold"
          style={{ width: 16, height: 16, fontSize: 11 }}
          aria-hidden="true"
        >
          ?
        </span>
      </button>

      {open &&
        createPortal(
          <div
            ref={tipRef}
            id={id}
            role="tooltip"
            className="bg-dark text-white small rounded-2 px-2 py-1 shadow text-start fw-normal"
            // fixed + z-index trên modal (1090), dưới lớp phủ đang tải (1200).
            // Ẩn tới khi đo xong vị trí để không bị nháy ở góc màn hình.
            style={{
              position: "fixed",
              zIndex: 1150,
              maxWidth: Math.min(280, window.innerWidth - EDGE * 2),
              lineHeight: 1.45,
              whiteSpace: "normal",
              pointerEvents: "none",
              left: pos?.left ?? 0,
              top: pos?.top ?? 0,
              visibility: pos ? "visible" : "hidden",
            }}
          >
            {children}
          </div>,
          document.body
        )}
    </>
  );
}
