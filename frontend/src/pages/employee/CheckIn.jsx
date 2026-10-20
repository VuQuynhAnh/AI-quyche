import { useCallback, useEffect, useState } from "react";
import { api } from "../../api/client.js";
import { useNotification } from "../../context/NotificationContext.jsx";
import { CLOCKING_ACTION, CLOCKING_ACTION_LABEL, CLOCKING_SOURCE } from "../../constants/enums.js";
import { fmtTime, fmtDateLong, getDeviceId, vnDateKey } from "../../utils/format.js";
import { getCurrentPosition } from "../../utils/geo.js";
import { QR_STORE_STORAGE_KEY } from "./StoreLanding.jsx";

// Màn chấm công: đồng hồ + nút lớn Check-in/Check-out + các lần chấm hôm nay.
// Giờ chấm công thực tế do SERVER ghi; đồng hồ ở đây chỉ để xem.
export default function CheckIn() {
  const { notifySuccess, notifyError } = useNotification();
  const [today, setToday] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(new Date());
  const [qrStoreId, setQrStoreId] = useState(() => {
    try {
      return localStorage.getItem(QR_STORE_STORAGE_KEY);
    } catch {
      return null;
    }
  });

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const load = useCallback(async () => {
    try {
      setToday(await api.get("/clocking/me/today"));
      setLoadError("");
    } catch (e) {
      setLoadError(e.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCheck() {
    if (!today || busy) return;
    setBusy(true);
    try {
      const pos = await getCurrentPosition();
      const data = await api.post("/clocking/check", {
        actionType: today.nextActionType,
        storeId: qrStoreId,
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

  function forgetQr() {
    try {
      localStorage.removeItem(QR_STORE_STORAGE_KEY);
    } catch {
      /* bỏ qua */
    }
    setQrStoreId(null);
  }

  if (loadError) return <div className="alert alert-danger">{loadError}</div>;
  if (!today) return <p className="text-muted text-center mt-4">Đang tải...</p>;

  const needQr = !qrStoreId;
  const isCheckIn = today.nextActionType === CLOCKING_ACTION.CHECK_IN;
  const dateKey = vnDateKey(now);

  return (
    <div>
      <div className="text-center mb-3">
        <div className="text-muted small">{fmtDateLong(dateKey)}</div>
        <div className="emp-clock">
          {now.toLocaleTimeString("vi-VN", { hour12: false, timeZone: "Asia/Ho_Chi_Minh" })}
        </div>
        <div className="mt-1">
          <span className="badge text-bg-light border">{today.store.name}</span>
          <span className="text-muted small ms-2">
            Ca {today.store.shiftStartTime} – {today.store.shiftEndTime}
          </span>
        </div>
      </div>

      {needQr && (
        <div className="alert alert-info">
          Hãy dùng camera điện thoại <strong>quét mã QR dán tại cửa hàng</strong> để chấm công.
        </div>
      )}

      <div className="text-center my-4">
        <button
          type="button"
          className={`check-btn ${isCheckIn ? "in" : "out"}`}
          onClick={handleCheck}
          disabled={busy || needQr}
        >
          {busy ? "Đang xử lý..." : isCheckIn ? "CHECK-IN" : "CHECK-OUT"}
        </button>
        <div className="text-muted small mt-2">Cần bật định vị (GPS) khi chấm công</div>
      </div>

      <div className="card border-0 shadow-sm">
        <div className="card-body">
          <h2 className="h6 mb-2">Hôm nay</h2>
          {today.histories.length === 0 && <p className="text-muted small mb-0">Chưa có lần chấm công nào.</p>}
          {today.histories.map((h) => (
            <div key={h.id} className="event-row">
              <span className={`event-badge ${h.actionType}`}>{CLOCKING_ACTION_LABEL[h.actionType]}</span>
              <span className="fw-semibold">{fmtTime(h.clockTime)}</span>
              {h.source === CLOCKING_SOURCE.ADMIN && <span className="badge text-bg-secondary ms-auto">Admin chỉnh</span>}
              {h.isOutOfRange && <span className="badge text-bg-warning ms-auto">Ngoài phạm vi</span>}
            </div>
          ))}
        </div>
      </div>

      {qrStoreId && (
        <div className="text-center mt-3">
          <button type="button" className="btn btn-link btn-sm text-muted" onClick={forgetQr}>
            Quét lại mã QR
          </button>
        </div>
      )}
    </div>
  );
}
