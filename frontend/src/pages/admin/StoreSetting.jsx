import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { api } from "../../api/client.js";
import { useNotification } from "../../context/NotificationContext.jsx";
import { getCurrentPosition } from "../../utils/geo.js";

// Thiết lập cửa hàng: giờ vào/tan ca, tiền phạt mỗi phút muộn/sớm, vị trí +
// bán kính chấm công (tuỳ chọn), và mã QR dán tại quầy.
export default function StoreSetting() {
  const { notifySuccess, notifyError } = useNotification();
  const [store, setStore] = useState(null);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  function applyResponse(d) {
    setStore(d.store);
    const s = d.setting;
    setForm({
      shiftStartTime: s.shiftStartTime,
      shiftEndTime: s.shiftEndTime,
      penaltyAmountPerMinute: String(s.penaltyAmountPerMinute),
      latitude: s.latitude ?? "",
      longitude: s.longitude ?? "",
      checkInRadiusMeters: String(s.checkInRadiusMeters),
    });
  }

  useEffect(() => {
    api.get("/hr/setting").then(applyResponse).catch((e) => notifyError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function useMyLocation() {
    try {
      const p = await getCurrentPosition();
      setForm((f) => ({ ...f, latitude: p.lat.toFixed(6), longitude: p.lng.toFixed(6) }));
    } catch (e) {
      notifyError(e.message);
    }
  }

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const d = await api.patch("/hr/setting", {
        shiftStartTime: form.shiftStartTime,
        shiftEndTime: form.shiftEndTime,
        penaltyAmountPerMinute: Number(form.penaltyAmountPerMinute),
        checkInRadiusMeters: Number(form.checkInRadiusMeters),
        latitude: form.latitude === "" ? null : Number(form.latitude),
        longitude: form.longitude === "" ? null : Number(form.longitude),
      });
      applyResponse(d);
      notifySuccess("Đã lưu thiết lập cửa hàng.");
    } catch (err) {
      notifyError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (!store || !form) return <p className="text-muted">Đang tải...</p>;

  return (
    <div className="row g-3">
      <div className="col-12 col-lg-7">
        <form className="card" onSubmit={save}>
          <div className="card-body">
            <h2 className="h6 mb-1">{store.name}</h2>
            {store.address && <div className="text-muted small mb-3">{store.address}</div>}

            <div className="row g-2">
              <div className="col-6">
                <label className="form-label small mb-1">Giờ vào ca</label>
                <input type="time" className="form-control" required value={form.shiftStartTime} onChange={set("shiftStartTime")} />
              </div>
              <div className="col-6">
                <label className="form-label small mb-1">Giờ tan ca</label>
                <input type="time" className="form-control" required value={form.shiftEndTime} onChange={set("shiftEndTime")} />
              </div>
              <div className="col-12">
                <label className="form-label small mb-1">Tiền phạt mỗi phút đi muộn / về sớm (đ)</label>
                <input type="number" min="0" step="100" className="form-control" required value={form.penaltyAmountPerMinute} onChange={set("penaltyAmountPerMinute")} />
              </div>
              <div className="col-12">
                <div className="d-flex justify-content-between align-items-center">
                  <label className="form-label small mb-1">Vị trí cửa hàng (tuỳ chọn)</label>
                  <button type="button" className="btn btn-link btn-sm p-0" onClick={useMyLocation}>Lấy vị trí hiện tại</button>
                </div>
                <div className="row g-2">
                  <div className="col-4"><input className="form-control" placeholder="Vĩ độ" value={form.latitude} onChange={set("latitude")} /></div>
                  <div className="col-4"><input className="form-control" placeholder="Kinh độ" value={form.longitude} onChange={set("longitude")} /></div>
                  <div className="col-4"><input type="number" min="10" max="5000" className="form-control" placeholder="Bán kính (m)" value={form.checkInRadiusMeters} onChange={set("checkInRadiusMeters")} /></div>
                </div>
                <div className="form-text">Nếu có vị trí, lần chấm công ngoài bán kính sẽ được gắn cờ cho admin xem (không chặn nhân viên).</div>
              </div>
            </div>

            <div className="small text-muted mt-3">
              Giờ ca mới áp dụng từ ngày chấm công tiếp theo (các ngày đã có công giữ giờ ca cũ). Tiền phạt mới áp dụng cho bảng lương chưa chốt khi bấm "Tính lại".
            </div>
            <div className="d-flex justify-content-end mt-3">
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Đang lưu..." : "Lưu thiết lập"}</button>
            </div>
          </div>
        </form>
      </div>

      <div className="col-12 col-lg-5">
        <StoreQrCard store={store} />
      </div>
    </div>
  );
}

// Mã QR trỏ tới /s/<id> của chính website này — in ra dán tại quầy.
function StoreQrCard({ store }) {
  const [dataUrl, setDataUrl] = useState("");
  const url = `${window.location.origin}/s/${store.id}`;

  useEffect(() => {
    QRCode.toDataURL(url, { width: 480, margin: 2 }).then(setDataUrl).catch(() => setDataUrl(""));
  }, [url]);

  function print() {
    const w = window.open("", "_blank", "width=480,height=640");
    if (!w) return;
    w.document.write(
      `<html><head><title>QR</title></head>` +
        `<body style="font-family:sans-serif;text-align:center;padding:24px">` +
        `<h2></h2><img src="${dataUrl}" style="width:360px"/><p>Quét mã để chấm công</p></body></html>`
    );
    w.document.querySelector("h2").textContent = store.name; // textContent: tránh chèn HTML từ tên cửa hàng
    w.document.close();
    w.focus();
    w.print();
  }

  return (
    <div className="card h-100">
      <div className="card-body text-center">
        <h2 className="h6">Mã QR chấm công</h2>
        {dataUrl ? <img src={dataUrl} alt="Mã QR cửa hàng" style={{ width: 240, maxWidth: "100%" }} /> : <p className="text-muted">Đang tạo mã...</p>}
        <div className="small text-muted text-break mt-2">{url}</div>
        <div className="d-flex justify-content-center gap-2 mt-3">
          <a className={`btn btn-outline-secondary btn-sm ${dataUrl ? "" : "disabled"}`} href={dataUrl} download={`qr-${store.name}.png`}>Tải ảnh</a>
          <button type="button" className="btn btn-primary btn-sm" onClick={print} disabled={!dataUrl}>In</button>
        </div>
      </div>
    </div>
  );
}
