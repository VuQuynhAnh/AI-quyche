import { useCallback, useEffect, useState } from "react";
import { api } from "../../api/client.js";
import { useNotification } from "../../context/NotificationContext.jsx";
import { CLOCKING_ACTION, CLOCKING_ACTION_LABEL, CLOCKING_METHOD, CLOCKING_SOURCE } from "../../constants/enums.js";
import { fmtTime, fmtDateLong, fmtMinutes, fmtMoney, getDeviceId, vnDateKey } from "../../utils/format.js";
import { getCurrentPosition } from "../../utils/geo.js";
import QrScanner from "../../components/QrScanner.jsx";

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
// Cửa hàng bật chấm công Wi-Fi + đang dùng Wi-Fi cửa hàng -> hiện thêm nút
// "Wi-Fi" cạnh nút QR: không cần quét mã (server vẫn kiểm tra lại IP + GPS).
export default function CheckIn() {
  const { notifySuccess, notifyError } = useNotification();
  const [today, setToday] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(new Date());
  const [scanning, setScanning] = useState(false);
  const [onStoreWifi, setOnStoreWifi] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const load = useCallback(async () => {
    try {
      const data = await api.get("/clocking/me/today");
      setToday(data);
      setLoadError("");
      // Chỉ hỏi server khi cửa hàng bật chấm công Wi-Fi; lỗi thì coi như không có
      const wifi = data.store.wifiClockingEnabled ? await api.get("/clocking/me/wifi").catch(() => null) : null;
      setOnStoreWifi(Boolean(wifi?.onStoreWifi));
    } catch (e) {
      setLoadError(e.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function startCheck() {
    if (!today || busy) return;
    setScanning(true);
  }

  async function handleQr(text) {
    setScanning(false);
    const storeId = storeIdFromQr(text);
    if (!storeId) {
      notifyError("Mã QR này không phải mã chấm công của cửa hàng.");
      return;
    }
    submitCheck({ method: CLOCKING_METHOD.QR, storeId });
  }

  function checkByWifi() {
    if (!today || busy) return;
    submitCheck({ method: CLOCKING_METHOD.WIFI });
  }

  // payload: { method, storeId? } — thêm GPS + thiết bị rồi gửi lên server
  async function submitCheck(payload) {
    setBusy(true);
    try {
      const pos = await getCurrentPosition();
      const data = await api.post("/clocking/check", {
        actionType: today.nextActionType,
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
      setBusy(false);
    }
  }

  if (loadError) return <div className="alert alert-danger">{loadError}</div>;
  if (!today) return null; // lớp phủ "Đang xử lý" toàn màn hình đang hiện

  const isCheckIn = today.nextActionType === CLOCKING_ACTION.CHECK_IN;
  const dateKey = vnDateKey(now);
  const c = today.clocking;
  const hasCheckedOut = Boolean(c?.checkOutTime);
  const actionLabel = isCheckIn ? "Check-in" : hasCheckedOut ? "Check-out lại" : "Check-out";
  const offMinutes = c ? c.lateMinutes + c.earlyLeaveMinutes : 0;
  const penalty = offMinutes * (today.store.penaltyAmountPerMinute || 0);

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
        <div className="d-flex gap-2">
          <button
            type="button"
            className={`btn btn-lg flex-fill py-3 fw-semibold shadow d-flex align-items-center justify-content-center gap-2 ${isCheckIn ? "btn-success" : "btn-warning"}`}
            onClick={startCheck}
            disabled={busy}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" />
              <rect x="7" y="7" width="10" height="10" rx="1" />
            </svg>
            <span>{busy ? "Đang chấm công..." : actionLabel}</span>
          </button>
          {onStoreWifi && (
            <button
              type="button"
              className={`btn btn-lg flex-fill py-3 fw-semibold shadow d-flex align-items-center justify-content-center gap-2 ${isCheckIn ? "btn-outline-success" : "btn-outline-warning"} bg-body`}
              onClick={checkByWifi}
              disabled={busy}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M5 12.55a11 11 0 0 1 14.08 0M1.42 9a16 16 0 0 1 21.16 0M8.53 16.11a6 6 0 0 1 6.95 0" />
                <circle cx="12" cy="20" r="1" />
              </svg>
              <span>{busy ? "Đang chấm công..." : `${actionLabel} Wi-Fi`}</span>
            </button>
          )}
        </div>
        <div className="text-muted small mt-2 text-center">
          {hasCheckedOut
            ? "Đã check-out. Nếu về muộn hơn, bấm lại — lần check-out cuối cùng được tính là giờ ra."
            : onStoreWifi
              ? "Đang dùng Wi-Fi cửa hàng: bấm nút Wi-Fi để chấm ngay, hoặc quét mã QR tại quầy. Cần bật định vị (GPS)."
              : "Bấm để mở camera, quét mã QR dán tại quầy. Cần bật định vị (GPS)."}
        </div>
      </div>

      {c && (
        <div className="card border-0 shadow-sm mb-3">
          <div className="card-body">
            <h2 className="h6 mb-3">Công hôm nay</h2>
            <div className="row g-2 text-center">
              <TodayStat label="Giờ vào" value={fmtTime(c.checkInTime)} />
              <TodayStat label="Giờ ra" value={hasCheckedOut ? fmtTime(c.checkOutTime) : "Đang làm"} />
              <TodayStat label="Giờ làm" value={hasCheckedOut ? fmtMinutes(c.workedMinutes) : "—"} />
            </div>
            <div className="d-flex flex-wrap gap-2 mt-3">
              <span className={`badge rounded-pill ${c.lateMinutes > 0 ? FLAG.warn : FLAG.ok}`}>
                {c.lateMinutes > 0 ? `Đi muộn ${c.lateMinutes} phút` : "Đúng giờ vào"}
              </span>
              {hasCheckedOut && (
                <span className={`badge rounded-pill ${c.earlyLeaveMinutes > 0 ? FLAG.warn : FLAG.ok}`}>
                  {c.earlyLeaveMinutes > 0 ? `Về sớm ${c.earlyLeaveMinutes} phút` : "Đủ giờ ra"}
                </span>
              )}
              {penalty > 0 && <span className={`badge rounded-pill ${FLAG.bad}`}>Phạt tạm tính {fmtMoney(penalty)}</span>}
            </div>
            {!hasCheckedOut && (
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

      {scanning && (
        <QrScanner
          title={isCheckIn ? "Quét mã QR để check-in" : "Quét mã QR để check-out"}
          onResult={handleQr}
          onClose={() => setScanning(false)}
        />
      )}
    </div>
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
