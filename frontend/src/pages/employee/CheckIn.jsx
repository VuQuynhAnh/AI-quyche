import { useCallback, useEffect, useState } from "react";
import { api } from "../../api/client.js";
import { useNotification } from "../../context/NotificationContext.jsx";
import { CLOCKING_ACTION, CLOCKING_ACTION_LABEL, CLOCKING_METHOD, CLOCKING_SOURCE } from "../../constants/enums.js";
import { fmtTime, fmtDateLong, fmtMinutes, fmtMoney, getDeviceId, vnDateKey } from "../../utils/format.js";
import { getBestPosition } from "../../utils/geo.js";

// Đọc GPS tối đa 3 giây, lấy lần chính xác nhất (dừng ngay khi sai số ≤ 50 m):
// vị trí càng chuẩn thì càng ít bị gắn cờ / bị chặn oan "ngoài phạm vi"
const GPS_OPTIONS = { maxWaitMs: 3000, goodEnoughMeters: 50 };
import QrScanner from "../../components/QrScanner.jsx";
import HelpTip from "../../components/HelpTip.jsx";

// Màu nhãn VÀO / RA
const EVENT_BADGE = { [CLOCKING_ACTION.CHECK_IN]: "text-bg-success", [CLOCKING_ACTION.CHECK_OUT]: "text-bg-warning" };

// Lấy id cửa hàng từ nội dung mã QR dán tại quầy: "https://<web>/s/<id>"
// (xem Thiết lập cửa hàng) — chấp nhận cả trường hợp QR chỉ chứa id.
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
function storeIdFromQr(text) {
  const fromPath = String(text).match(new RegExp(`/s/(${UUID_RE.source})`, "i"));
  if (fromPath) return fromPath[1];
  const raw = String(text).trim();
  return new RegExp(`^${UUID_RE.source}$`, "i").test(raw) ? raw : null;
}

// Màn chấm công: đồng hồ + nút Check-in/Check-out + các lần chấm hôm nay.
// Mỗi lần chấm: bấm nút -> mở camera quét mã QR dán tại quầy (chứng minh đang
// ở cửa hàng) -> lấy GPS -> gửi lên server. Giờ chấm công thực tế do SERVER
// ghi; đồng hồ ở đây chỉ để xem.
// Nút Wi-Fi (không cần quét mã) chỉ hiện khi server xác nhận đúng Wi-Fi cửa
// hàng VÀ đang ở gần cửa hàng (GPS); khi chấm, server vẫn kiểm tra lại.
// Chưa check-in vẫn được check-out (quên check-in).
export default function CheckIn() {
  const { notifySuccess, notifyError } = useNotification();
  const [today, setToday] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false); // đang dò GPS trước khi gửi chấm công
  const [now, setNow] = useState(new Date());
  const [scanAction, setScanAction] = useState(null); // đang quét QR cho check-in hay check-out
  const [wifi, setWifi] = useState(null); // kết quả /clocking/me/wifi (null = không dùng được)

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Nút Wi-Fi chỉ hiện khi server xác nhận: đúng Wi-Fi cửa hàng VÀ điện thoại
  // đang ở gần cửa hàng (gửi kèm GPS). Không lấy được GPS -> không hiện.
  async function loadWifi(storeInfo) {
    if (!storeInfo.wifiClockingEnabled) return setWifi(null);
    try {
      const pos = await getBestPosition(GPS_OPTIONS);
      const q = new URLSearchParams({ latitude: pos.lat, longitude: pos.lng, accuracy: pos.accuracy ?? "" });
      setWifi(await api.get(`/clocking/me/wifi?${q}`, { silent: true }));
    } catch {
      setWifi(null);
    }
  }

  const load = useCallback(async () => {
    try {
      const data = await api.get("/clocking/me/today");
      setToday(data);
      setLoadError("");
      loadWifi(data.store); // chạy ngầm, không chặn màn hình
    } catch (e) {
      setLoadError(e.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleQr(text) {
    const actionType = scanAction;
    setScanAction(null);
    const storeId = storeIdFromQr(text);
    if (!storeId) {
      notifyError("Mã QR này không phải mã chấm công của cửa hàng.");
      return;
    }
    submitCheck(actionType, { method: CLOCKING_METHOD.QR, storeId });
  }

  // actionType: check-in / check-out (nhân viên tự chọn); payload: { method, storeId? }
  async function submitCheck(actionType, payload) {
    setBusy(true);
    setLocating(true);
    try {
      const pos = await getBestPosition(GPS_OPTIONS);
      setLocating(false);
      const data = await api.post("/clocking/check", {
        actionType,
        ...payload,
        latitude: pos.lat,
        longitude: pos.lng,
        accuracy: pos.accuracy,
        deviceIdentifier: getDeviceId(),
      });
      const label = data.history.actionType === CLOCKING_ACTION.CHECK_IN ? "Check-in" : "Check-out";
      notifySuccess(`${label} lúc ${fmtTime(data.history.clockTime)} thành công.`);
      await load();
    } catch (e) {
      notifyError(e.message);
      // Trạng thái có thể đã lệch (VD: chấm ở máy khác) -> tải lại cho đúng
      load();
    } finally {
      setLocating(false);
      setBusy(false);
    }
  }

  if (loadError) return <div className="alert alert-danger">{loadError}</div>;
  if (!today) return null; // lớp phủ "Đang xử lý" toàn màn hình đang hiện

  const dateKey = vnDateKey(now);
  const c = today.clocking;
  const hasCheckedIn = Boolean(c?.checkInTime);
  const hasCheckedOut = Boolean(c?.checkOutTime);
  const wifiUsable = Boolean(wifi?.usable);
  // Cửa hàng bật chặn (và đã đặt vị trí): server từ chối lần chấm QR ngoài bán kính
  const radiusEnforced = Boolean(today.store.checkInRadiusEnforced && today.store.latitude != null);
  const offMinutes = c ? c.lateMinutes + c.earlyLeaveMinutes : 0;
  const penalty = offMinutes * (today.store.penaltyAmountPerMinute || 0);

  // Nút chính: chưa check-in -> Check-in; đã check-in -> Check-out (lại)
  const mainAction = hasCheckedIn ? CLOCKING_ACTION.CHECK_OUT : CLOCKING_ACTION.CHECK_IN;
  const mainLabel = !hasCheckedIn ? "Check-in" : hasCheckedOut ? "Check-out lại" : "Check-out";
  const mainColor = mainAction === CLOCKING_ACTION.CHECK_IN ? "success" : "warning";
  const outLabel = hasCheckedOut ? "Check-out lại" : "Check-out";

  return (
    <div>
      <div className="text-center mb-3">
        <div className="text-muted small">{fmtDateLong(dateKey)}</div>
        <div className="display-5 fw-bold font-monospace">
          {now.toLocaleTimeString("vi-VN", { hour12: false, timeZone: "Asia/Ho_Chi_Minh" })}
        </div>
        <div className="mt-1">
          <span className="badge text-bg-light border">{today.store.name}</span>
          <span className="text-muted small ms-2">
            Ca {today.store.shiftStartTime} – {today.store.shiftEndTime}
          </span>
        </div>
      </div>

      <div className="my-4">
        {/* Điện thoại: 2 nút xếp chồng, rộng hết màn hình; màn rộng: nằm cạnh nhau */}
        <div className="d-flex flex-column flex-sm-row gap-2">
          <CheckButton color={mainColor} icon="qr" busy={busy} onClick={() => setScanAction(mainAction)}>
            {mainLabel}
          </CheckButton>
          {wifiUsable && (
            <CheckButton color={mainColor} icon="wifi" outline busy={busy} onClick={() => submitCheck(mainAction, { method: CLOCKING_METHOD.WIFI })}>
              {mainLabel} Wi-Fi
            </CheckButton>
          )}
        </div>

        {/* Chưa check-in: vẫn cho check-out (quên check-in lúc đến) */}
        {!hasCheckedIn && (
          <div className="d-flex flex-wrap align-items-center justify-content-center gap-2 mt-3">
            <span className="small text-muted">Quên check-in?</span>
            <button type="button" className="btn btn-outline-warning btn-sm btn-outline-filled" disabled={busy} onClick={() => setScanAction(CLOCKING_ACTION.CHECK_OUT)}>
              {outLabel} bằng QR
            </button>
            {wifiUsable && (
              <button
                type="button"
                className="btn btn-outline-warning btn-sm btn-outline-filled"
                disabled={busy}
                onClick={() => submitCheck(CLOCKING_ACTION.CHECK_OUT, { method: CLOCKING_METHOD.WIFI })}
              >
                {outLabel} bằng Wi-Fi
              </button>
            )}
          </div>
        )}

        {/* Dò GPS chưa gọi API nên không có lớp phủ "Đang xử lý" — báo riêng */}
        {locating && <div className="small text-primary mt-2 text-center">Đang dò vị trí GPS…</div>}
        <div className="text-muted small mt-2 text-center">
          <HelpTip label="Cách chấm công">
            {hasCheckedOut
              ? "Đã check-out. Nếu về muộn hơn, bấm lại — lần check-out cuối cùng được tính là giờ ra."
              : wifiUsable
                ? "Đang ở cửa hàng và dùng Wi-Fi cửa hàng: bấm nút Wi-Fi để chấm ngay, hoặc bấm nút kia để quét mã QR tại quầy."
                : "Bấm để mở camera, quét mã QR dán tại quầy. Cần bật định vị (GPS)."}
            {!hasCheckedIn && " Nếu quên check-in lúc đến, vẫn check-out được — ngày đó sẽ thiếu giờ vào, báo quản lý bổ sung."}
            {radiusEnforced && ` Cửa hàng chỉ cho chấm công bằng QR trong phạm vi ${today.store.checkInRadiusMeters} m quanh cửa hàng.`}
          </HelpTip>
        </div>
      </div>

      {c && (hasCheckedIn || hasCheckedOut) && (
        <div className="card border-0 shadow-sm mb-3">
          <div className="card-body">
            <h2 className="h6 mb-3">Công hôm nay</h2>
            <div className="row g-2 text-center">
              <TodayStat label="Giờ vào" value={hasCheckedIn ? fmtTime(c.checkInTime) : "Chưa check-in"} />
              <TodayStat label="Giờ ra" value={hasCheckedOut ? fmtTime(c.checkOutTime) : "Đang làm"} />
              <TodayStat label="Giờ làm" value={hasCheckedIn && hasCheckedOut ? fmtMinutes(c.workedMinutes) : "—"} />
            </div>
            <div className="d-flex flex-wrap gap-2 mt-3">
              {hasCheckedIn ? (
                <span className={`badge rounded-pill ${c.lateMinutes > 0 ? FLAG.warn : FLAG.ok}`}>
                  {c.lateMinutes > 0 ? `Đi muộn ${c.lateMinutes} phút` : "Đúng giờ vào"}
                </span>
              ) : (
                <span className={`badge rounded-pill ${FLAG.bad}`}>Thiếu check-in — báo quản lý bổ sung giờ vào</span>
              )}
              {hasCheckedOut && (
                <span className={`badge rounded-pill ${c.earlyLeaveMinutes > 0 ? FLAG.warn : FLAG.ok}`}>
                  {c.earlyLeaveMinutes > 0 ? `Về sớm ${c.earlyLeaveMinutes} phút` : "Đủ giờ ra"}
                </span>
              )}
              {penalty > 0 && <span className={`badge rounded-pill ${FLAG.bad}`}>Phạt tạm tính {fmtMoney(penalty)}</span>}
            </div>
            {hasCheckedIn && !hasCheckedOut && (
              <div className="small text-muted mt-2">Tan ca lúc {today.store.shiftEndTime} — nhớ check-out trước khi về.</div>
            )}
          </div>
        </div>
      )}

      <div className="card border-0 shadow-sm">
        <div className="card-body">
          <h2 className="h6 mb-2">Lịch sử chấm hôm nay</h2>
          {today.histories.length === 0 && <p className="text-muted small mb-0">Chưa có lần chấm công nào.</p>}
          {today.histories.map((h) => (
            <div key={h.id} className="d-flex align-items-center gap-2 py-2 border-bottom">
              <span className={`badge ${EVENT_BADGE[h.actionType]}`}>{CLOCKING_ACTION_LABEL[h.actionType]}</span>
              <span className="fw-semibold">{fmtTime(h.clockTime)}</span>
              {h.method === CLOCKING_METHOD.WIFI && <span className="badge text-bg-light border">Wi-Fi</span>}
              {h.source === CLOCKING_SOURCE.ADMIN && <span className="badge text-bg-secondary ms-auto">Admin chỉnh</span>}
              {h.isOutOfRange && <span className="badge text-bg-warning ms-auto">Ngoài phạm vi</span>}
            </div>
          ))}
        </div>
      </div>

      {scanAction && (
        <QrScanner
          title={scanAction === CLOCKING_ACTION.CHECK_IN ? "Quét mã QR để check-in" : "Quét mã QR để check-out"}
          onResult={handleQr}
          onClose={() => setScanAction(null)}
        />
      )}
    </div>
  );
}

// Nút chấm công lớn (QR / Wi-Fi)
function CheckButton({ color, icon, outline = false, busy, onClick, children }) {
  return (
    <button
      type="button"
      className={`btn flex-fill fw-semibold d-flex align-items-center justify-content-center gap-2 text-nowrap ${
        outline ? `btn-outline-${color} btn-outline-filled py-2` : `btn-${color} btn-lg py-3 shadow`
      }`}
      onClick={onClick}
      disabled={busy}
    >
      {icon === "wifi" ? (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M5 12.55a11 11 0 0 1 14.08 0M1.42 9a16 16 0 0 1 21.16 0M8.53 16.11a6 6 0 0 1 6.95 0" />
          <circle cx="12" cy="20" r="1" />
        </svg>
      ) : (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" />
          <rect x="7" y="7" width="10" height="10" rx="1" />
        </svg>
      )}
      <span>{children}</span>
    </button>
  );
}

// Màu nhãn tóm tắt công hôm nay
const FLAG = {
  ok: "bg-success-subtle text-success-emphasis",
  warn: "bg-warning-subtle text-warning-emphasis",
  bad: "bg-danger-subtle text-danger-emphasis",
};

function TodayStat({ label, value }) {
  return (
    <div className="col-4">
      <div className="bg-body-tertiary rounded-3 p-2">
        <div className="small text-muted">{label}</div>
        <div className="fw-semibold">{value}</div>
      </div>
    </div>
  );
}
