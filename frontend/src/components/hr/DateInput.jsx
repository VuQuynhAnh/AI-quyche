import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { addMonths, daysInMonth, firstWeekdayMonFirst, monthLabel, vnDateKey } from "../../utils/format.js";

// Ô nhập ngày luôn hiện dạng dd/mm/yyyy. Tự vẽ thay cho <input type="date"> vì
// trình duyệt hiện ngày theo ngôn ngữ máy (máy tiếng Anh ra mm/dd/yyyy) và
// không ép định dạng được. Gõ trực tiếp (tự chèn dấu "/") hoặc bấm biểu tượng
// lịch để chọn. Bảng lịch render qua Portal + vị trí fixed giống TimeInput.
// value / onChange: chuỗi "YYYY-MM-DD", hoặc "" khi để trống.
const pad = (n) => String(n).padStart(2, "0");
const WEEKDAYS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
const PANEL_WIDTH = 264;
const PANEL_HEIGHT = 312;

const toDisplay = (key) => (key ? key.split("-").reverse().join("/") : "");

// "dd/mm/yyyy" -> "YYYY-MM-DD", hoặc null nếu không phải ngày có thật
function parseDisplay(text) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text);
  if (!m) return null;
  const [, d, mo, y] = m.map(Number);
  if (y < 1900 || mo < 1 || mo > 12 || d < 1 || d > daysInMonth(`${y}-${pad(mo)}`)) return null;
  return `${y}-${pad(mo)}-${pad(d)}`;
}

// Chỉ giữ chữ số và tự chèn "/" sau ngày, tháng: "11102026" -> "11/10/2026"
function maskDigits(raw) {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  return [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4)].filter(Boolean).join("/");
}

export default function DateInput({ value, onChange, required = false, disabled = false }) {
  const [text, setText] = useState(toDisplay(value));
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(() => (value || vnDateKey()).slice(0, 7));
  const [pos, setPos] = useState(null);
  const groupRef = useRef(null);
  const inputRef = useRef(null);
  const panelRef = useRef(null);

  // Giá trị đổi từ ngoài (mở form sửa, chọn trên lịch...) -> hiện lại cho đúng
  useEffect(() => {
    if (parseDisplay(text) !== (value || null)) setText(toDisplay(value));
  }, [value]);

  // Gõ dở / sai ngày -> chặn submit form kèm thông báo của trình duyệt
  useEffect(() => {
    const invalid = text !== "" && !parseDisplay(text);
    inputRef.current?.setCustomValidity(invalid ? "Ngày không hợp lệ, nhập theo dạng dd/mm/yyyy." : "");
  }, [text]);

  function handleType(e) {
    const next = maskDigits(e.target.value);
    setText(next);
    if (next === "") onChange("");
    else {
      const key = parseDisplay(next);
      if (key) onChange(key);
    }
  }

  function pick(key) {
    setText(toDisplay(key));
    onChange(key);
    setOpen(false);
  }

  function toggle() {
    if (!open) setViewMonth((parseDisplay(text) || vnDateKey()).slice(0, 7));
    setOpen((o) => !o);
  }

  // Đặt bảng lịch ngay dưới ô (hoặc lên trên nếu sát đáy màn hình), canh phải theo ô
  useLayoutEffect(() => {
    if (!open) return;
    const r = groupRef.current.getBoundingClientRect();
    const below = window.innerHeight - r.bottom > PANEL_HEIGHT + 8;
    setPos({
      left: Math.max(8, Math.min(r.left, window.innerWidth - PANEL_WIDTH - 8)),
      top: below ? r.bottom + 4 : r.top - PANEL_HEIGHT - 4,
    });
  }, [open]);

  // Đóng khi bấm ra ngoài, nhấn Esc, cuộn hoặc đổi kích thước cửa sổ
  useEffect(() => {
    if (!open) return undefined;
    const close = () => setOpen(false);
    const onDown = (e) => {
      if (!panelRef.current?.contains(e.target) && !groupRef.current?.contains(e.target)) close();
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

  const today = vnDateKey();
  const selected = parseDisplay(text);
  const cells = [
    ...Array(firstWeekdayMonFirst(viewMonth)).fill(null),
    ...Array.from({ length: daysInMonth(viewMonth) }, (_, i) => `${viewMonth}-${pad(i + 1)}`),
  ];

  return (
    <>
      <div ref={groupRef} className="input-group">
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          className="form-control"
          style={{ fontVariantNumeric: "tabular-nums" }}
          placeholder="dd/mm/yyyy"
          required={required}
          disabled={disabled}
          value={text}
          onChange={handleType}
        />
        <button
          type="button"
          className={`btn btn-outline-secondary ${open ? "active" : ""}`}
          disabled={disabled}
          aria-label="Chọn ngày trên lịch"
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={toggle}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M4.5 0a.5.5 0 0 1 .5.5V1h6V.5a.5.5 0 0 1 1 0V1h1a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V3a2 2 0 0 1 2-2h1V.5a.5.5 0 0 1 .5-.5zM2 5v9a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V5H2z" />
          </svg>
        </button>
      </div>

      {open && pos &&
        createPortal(
          <div
            ref={panelRef}
            className="dropdown-menu show p-2 shadow"
            // fixed + z-index trên modal (1090), dưới lớp phủ đang tải (1200)
            style={{ position: "fixed", zIndex: 1150, left: pos.left, top: pos.top, width: PANEL_WIDTH, minWidth: 0 }}
            role="dialog"
            aria-label="Chọn ngày"
          >
            <div className="d-flex align-items-center justify-content-between mb-2">
              <button type="button" className="btn btn-sm btn-light" aria-label="Tháng trước" onClick={() => setViewMonth((m) => addMonths(m, -1))}>
                ‹
              </button>
              <span className="fw-semibold small">{monthLabel(viewMonth)}</span>
              <button type="button" className="btn btn-sm btn-light" aria-label="Tháng sau" onClick={() => setViewMonth((m) => addMonths(m, 1))}>
                ›
              </button>
            </div>

            <div className="d-grid text-center" style={{ gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
              {WEEKDAYS.map((w) => (
                <div key={w} className="small fw-bold text-body-tertiary py-1">{w}</div>
              ))}
              {cells.map((key, i) =>
                key ? (
                  <button
                    key={key}
                    type="button"
                    className={`btn btn-sm px-0 ${key === selected ? "btn-primary" : key === today ? "btn-outline-primary" : "btn-light bg-transparent border-0"}`}
                    style={{ fontVariantNumeric: "tabular-nums" }}
                    aria-label={toDisplay(key)}
                    aria-pressed={key === selected}
                    onClick={() => pick(key)}
                  >
                    {Number(key.slice(8))}
                  </button>
                ) : (
                  <span key={`blank-${i}`} />
                )
              )}
            </div>

            <div className="d-flex justify-content-between border-top mt-2 pt-1">
              <button type="button" className="btn btn-sm btn-link text-decoration-none" onClick={() => pick(today)}>
                Hôm nay
              </button>
              {!required && text && (
                <button
                  type="button"
                  className="btn btn-sm btn-link text-danger text-decoration-none"
                  onClick={() => { setText(""); onChange(""); setOpen(false); }}
                >
                  Bỏ trống
                </button>
              )}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
