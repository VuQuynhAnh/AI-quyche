import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// Ô chọn giờ dạng 24h, gọn như 1 ô nhập: [ 07 : 55 ]. Bấm vào thì mở bảng chọn
// nhỏ gồm 2 cột Giờ (00–23) và Phút (00–59). Tự vẽ thay cho <select> /
// <input type="time"> vì danh sách của trình duyệt (thanh cuộn to, AM/PM theo
// ngôn ngữ máy) không chỉnh giao diện được.
// Bảng chọn render qua Portal + vị trí fixed để không bị khung cuộn của modal cắt mất.
// value / onChange: chuỗi "HH:MM", hoặc "" khi chưa chọn (chỉ khi không required).
const pad = (n) => String(n).padStart(2, "0");
const HOURS = Array.from({ length: 24 }, (_, i) => pad(i));
const MINUTES = Array.from({ length: 60 }, (_, i) => pad(i));
const PANEL_HEIGHT = 248;

export default function TimeInput({ value, onChange, required = false, disabled = false, label }) {
  const [hour = "", minute = ""] = value ? value.split(":") : [];
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const triggerRef = useRef(null);
  const panelRef = useRef(null);

  function change(nextHour, nextMinute) {
    onChange(`${nextHour || "00"}:${nextMinute || "00"}`);
  }

  // Đặt bảng chọn ngay dưới ô (hoặc lên trên nếu sát đáy màn hình)
  useLayoutEffect(() => {
    if (!open) return;
    const r = triggerRef.current.getBoundingClientRect();
    const below = window.innerHeight - r.bottom > PANEL_HEIGHT + 8;
    setPos({ left: r.left, top: below ? r.bottom + 4 : r.top - PANEL_HEIGHT - 4 });
  }, [open]);

  // Đóng khi bấm ra ngoài, nhấn Esc, cuộn hoặc đổi kích thước cửa sổ
  useEffect(() => {
    if (!open) return undefined;
    const close = () => setOpen(false);
    const onDown = (e) => {
      if (!panelRef.current?.contains(e.target) && !triggerRef.current?.contains(e.target)) close();
    };
    const onKey = (e) => e.key === "Escape" && (e.stopPropagation(), close());
    const onScroll = (e) => !panelRef.current?.contains(e.target) && close();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  // Cuộn tới giá trị đang chọn khi vừa mở
  useEffect(() => {
    if (!open || !pos) return;
    panelRef.current?.querySelectorAll(".time-option.active").forEach((el) => el.scrollIntoView({ block: "center" }));
  }, [open, pos]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`time-input ${value ? "" : "is-empty"} ${open ? "is-open" : ""}`}
        disabled={disabled}
        aria-label={label ? `${label}: ${value || "chưa chọn"}` : value || "Chọn giờ"}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span>{hour || "--"}</span>
        <span className="time-input-sep">:</span>
        <span>{minute || "--"}</span>
      </button>
      {/* Giữ ràng buộc "required" cho form: ô ẩn rỗng khi chưa chọn */}
      {required && <input tabIndex={-1} className="time-input-required" required value={value || ""} onChange={() => {}} />}

      {open && pos &&
        createPortal(
          <div ref={panelRef} className="time-panel" style={{ left: pos.left, top: pos.top, height: PANEL_HEIGHT }} role="dialog" aria-label={label || "Chọn giờ"}>
            <TimeColumn title="Giờ" options={HOURS} selected={hour} onPick={(h) => change(h, minute)} />
            <TimeColumn
              title="Phút"
              options={MINUTES}
              selected={minute}
              onPick={(m) => {
                change(hour, m);
                setOpen(false); // chọn phút xong là xong
              }}
            />
            {!required && value && (
              <button type="button" className="time-panel-clear" onClick={() => { onChange(""); setOpen(false); }}>
                Bỏ trống
              </button>
            )}
          </div>,
          document.body
        )}
    </>
  );
}

function TimeColumn({ title, options, selected, onPick }) {
  return (
    <div className="time-column">
      <div className="time-column-title">{title}</div>
      <div className="time-column-list">
        {options.map((o) => (
          <button key={o} type="button" className={`time-option ${o === selected ? "active" : ""}`} onClick={() => onPick(o)}>
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}
