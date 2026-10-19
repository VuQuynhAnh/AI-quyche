import { useCallback, useEffect, useState } from "react";
import { api } from "../../api/client.js";
import { useNotification } from "../../context/NotificationContext.jsx";
import { fmtTime, fmtDateLong, getDeviceId, vnDateKey } from "../../utils/format.js";
import { getCurrentPosition } from "../../utils/geo.js";

// Màn chấm công: đồng hồ + nút lớn Check-in/Check-out + các lần chấm hôm nay.
// Giờ chấm công thực tế do SERVER ghi; đồng hồ ở đây chỉ để xem.
export default function CheckIn() {
  const { notifySuccess, notifyError } = useNotification();
  const [today, setToday] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(new Date());
  const [qrStallId, setQrStallId] = useState(() => {
    try {
      return localStorage.getItem("qrStallId");
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
      setToday(await api.get("/attendance/me/today"));
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
      const data = await api.post("/attendance/check", {
        type: today.nextType,
        stallId: qrStallId,
        lat: pos.lat,
        lng: pos.lng,
        accuracy: pos.accuracy,
        deviceId: getDeviceId(),
      });
      notifySuccess(
        `${data.event.type === "in" ? "Check-in" : "Check-out"} lúc ${fmtTime(data.event.occurred_at)} thành công.`
      );
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
      localStorage.removeItem("qrStallId");
    } catch {
      /* bỏ qua */
    }
    setQrStallId(null);
  }

  if (loadError) return <div className="alert alert-danger">{loadError}</div>;
  if (!today) return <p className="text-muted text-center mt-4">Đang tải...</p>;

  const noStall = !today.stall;
  const needQr = !noStall && !qrStallId;
  const isIn = today.nextType === "in";
  const dateKey = vnDateKey(now);

  return (
    <div>
      <div className="text-center mb-3">
        <div className="text-muted small">{fmtDateLong(dateKey)}</div>
        <div className="emp-clock">
          {now.toLocaleTimeString("vi-VN", { hour12: false, timeZone: "Asia/Ho_Chi_Minh" })}
        </div>
        {today.stall && (
          <div className="mt-1">
            <span className="badge text-bg-light border">{today.stall.name}</span>
            <span className="text-muted small ms-2">
              Ca {today.stall.shiftStart} – {today.stall.shiftEnd}
            </span>
          </div>
        )}
      </div>

      {noStall && (
        <div className="alert alert-warning">Bạn chưa được gán gian hàng. Vui lòng liên hệ quản trị viên.</div>
      )}
      {needQr && (
        <div className="alert alert-info">
          Hãy dùng camera điện thoại <strong>quét mã QR dán tại gian hàng</strong> để chấm công.
        </div>
      )}

      <div className="text-center my-4">
        <button
          type="button"
          className={`check-btn ${isIn ? "in" : "out"}`}
          onClick={handleCheck}
          disabled={busy || noStall || needQr}
        >
          {busy ? "Đang xử lý..." : isIn ? "CHECK-IN" : "CHECK-OUT"}
        </button>
        <div className="text-muted small mt-2">Cần bật định vị (GPS) khi chấm công</div>
      </div>

      <div className="card border-0 shadow-sm">
        <div className="card-body">
          <h2 className="h6 mb-2">Hôm nay</h2>
          {today.events.length === 0 && <p className="text-muted small mb-0">Chưa có lần chấm công nào.</p>}
          {today.events.map((e) => (
            <div key={e.id} className="event-row">
              <span className={`event-badge ${e.type}`}>{e.type === "in" ? "VÀO" : "RA"}</span>
              <span className="fw-semibold">{fmtTime(e.occurred_at)}</span>
              {e.method === "admin" && <span className="badge text-bg-secondary ms-auto">Admin chỉnh</span>}
              {e.out_of_range && <span className="badge text-bg-warning ms-auto">Ngoài phạm vi</span>}
            </div>
          ))}
        </div>
      </div>

      {qrStallId && (
        <div className="text-center mt-3">
          <button type="button" className="btn btn-link btn-sm text-muted" onClick={forgetQr}>
            Đổi gian hàng (quét QR khác)
          </button>
        </div>
      )}
    </div>
  );
}
