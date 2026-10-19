import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { api } from "../../api/client.js";
import Modal from "../../components/hr/Modal.jsx";
import { useNotification } from "../../context/NotificationContext.jsx";
import { fmtMoney } from "../../utils/format.js";
import { getCurrentPosition } from "../../utils/geo.js";

const EMPTY = {
  name: "", address: "", shiftStart: "08:00", shiftEnd: "17:00", penaltyPerMinute: "0",
  lat: "", lng: "", radiusM: "100",
};

// Gian hàng: giờ vào/tan ca, tiền phạt mỗi phút muộn/sớm, toạ độ (tuỳ chọn),
// và mã QR dán tại quầy.
export default function Stalls() {
  const { notifySuccess, notifyError, confirm } = useNotification();
  const [stalls, setStalls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(null); // {id?, ...fields}
  const [saving, setSaving] = useState(false);
  const [qrStall, setQrStall] = useState(null);

  async function load() {
    try {
      const d = await api.get("/hr/stalls");
      setStalls(d.stalls);
    } catch (e) {
      notifyError(e.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openEdit(s) {
    setForm({
      id: s.id, name: s.name, address: s.address || "", shiftStart: s.shiftStart, shiftEnd: s.shiftEnd,
      penaltyPerMinute: String(s.penaltyPerMinute), lat: s.lat ?? "", lng: s.lng ?? "", radiusM: String(s.radiusM),
    });
  }

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function useMyLocation() {
    try {
      const p = await getCurrentPosition();
      setForm((f) => ({ ...f, lat: p.lat.toFixed(6), lng: p.lng.toFixed(6) }));
    } catch (e) {
      notifyError(e.message);
    }
  }

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    const body = {
      name: form.name, address: form.address, shiftStart: form.shiftStart, shiftEnd: form.shiftEnd,
      penaltyPerMinute: Number(form.penaltyPerMinute), radiusM: Number(form.radiusM),
      lat: form.lat === "" ? null : Number(form.lat), lng: form.lng === "" ? null : Number(form.lng),
    };
    try {
      if (form.id) await api.patch(`/hr/stalls/${form.id}`, body);
      else await api.post("/hr/stalls", body);
      notifySuccess(form.id ? "Đã cập nhật gian hàng." : "Đã tạo gian hàng.");
      setForm(null);
      await load();
    } catch (err) {
      notifyError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(s) {
    const ok = await confirm(
      s.isActive ? `Tạm ngưng "${s.name}"? Nhân viên sẽ không chấm công được.` : `Mở lại "${s.name}"?`,
      { confirmText: s.isActive ? "Tạm ngưng" : "Mở lại", danger: s.isActive }
    );
    if (!ok) return;
    try {
      await api.patch(`/hr/stalls/${s.id}`, { isActive: !s.isActive });
      await load();
    } catch (e) {
      notifyError(e.message);
    }
  }

  async function remove(s) {
    const ok = await confirm(`Xoá gian hàng "${s.name}"?`, { confirmText: "Xoá", danger: true });
    if (!ok) return;
    try {
      await api.delete(`/hr/stalls/${s.id}`);
      notifySuccess("Đã xoá gian hàng.");
      await load();
    } catch (e) {
      notifyError(e.message);
    }
  }

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <div className="text-muted small">
          Giờ ca và tiền phạt áp dụng cho mọi nhân viên của gian hàng. Đổi cấu hình không làm thay đổi lương các tháng đã qua.
        </div>
        <button type="button" className="btn btn-primary btn-sm text-nowrap" onClick={() => setForm({ ...EMPTY })}>
          + Thêm gian hàng
        </button>
      </div>

      {loading && <p className="text-muted">Đang tải...</p>}
      <div className="row g-3">
        {stalls.map((s) => (
          <div key={s.id} className="col-12 col-md-6 col-xl-4">
            <div className={`card h-100 ${s.isActive ? "" : "opacity-75"}`}>
              <div className="card-body">
                <div className="d-flex justify-content-between align-items-start">
                  <h2 className="h6 mb-1">{s.name}</h2>
                  {!s.isActive && <span className="badge text-bg-secondary">Tạm ngưng</span>}
                </div>
                {s.address && <div className="text-muted small mb-2">{s.address}</div>}
                <div className="small">
                  <div>Ca: <strong>{s.shiftStart} – {s.shiftEnd}</strong></div>
                  <div>Phạt: <strong>{fmtMoney(s.penaltyPerMinute)}</strong>/phút muộn hoặc sớm</div>
                  <div>Nhân viên: <strong>{s.employeeCount ?? 0}</strong></div>
                  <div>
                    Vị trí:{" "}
                    {s.lat != null ? <>có (bán kính {s.radiusM} m)</> : <span className="text-muted">chưa đặt</span>}
                  </div>
                </div>
                <div className="d-flex flex-wrap gap-1 mt-3">
                  <button type="button" className="btn btn-outline-primary btn-sm" onClick={() => setQrStall(s)}>Mã QR</button>
                  <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => openEdit(s)}>Sửa</button>
                  <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => toggleActive(s)}>
                    {s.isActive ? "Tạm ngưng" : "Mở lại"}
                  </button>
                  <button type="button" className="btn btn-outline-danger btn-sm" onClick={() => remove(s)}>Xoá</button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
      {!loading && stalls.length === 0 && <p className="text-muted">Chưa có gian hàng nào. Hãy tạo gian hàng đầu tiên.</p>}

      {form && (
        <Modal
          title={form.id ? "Sửa gian hàng" : "Thêm gian hàng"}
          onClose={() => setForm(null)}
          footer={
            <>
              <button type="button" className="btn btn-outline-secondary" onClick={() => setForm(null)}>Huỷ</button>
              <button type="submit" form="stall-form" className="btn btn-primary" disabled={saving}>
                {saving ? "Đang lưu..." : "Lưu"}
              </button>
            </>
          }
        >
          <form id="stall-form" onSubmit={save} className="row g-2">
            <div className="col-12">
              <label className="form-label small mb-1">Tên gian hàng</label>
              <input className="form-control" required value={form.name} onChange={set("name")} />
            </div>
            <div className="col-12">
              <label className="form-label small mb-1">Địa chỉ</label>
              <input className="form-control" value={form.address} onChange={set("address")} />
            </div>
            <div className="col-6">
              <label className="form-label small mb-1">Giờ vào ca</label>
              <input type="time" className="form-control" required value={form.shiftStart} onChange={set("shiftStart")} />
            </div>
            <div className="col-6">
              <label className="form-label small mb-1">Giờ tan ca</label>
              <input type="time" className="form-control" required value={form.shiftEnd} onChange={set("shiftEnd")} />
            </div>
            <div className="col-12">
              <label className="form-label small mb-1">Tiền phạt mỗi phút muộn/về sớm (đ)</label>
              <input type="number" min="0" step="100" className="form-control" required value={form.penaltyPerMinute} onChange={set("penaltyPerMinute")} />
            </div>
            <div className="col-12">
              <div className="d-flex justify-content-between align-items-center">
                <label className="form-label small mb-1">Vị trí gian hàng (tuỳ chọn)</label>
                <button type="button" className="btn btn-link btn-sm p-0" onClick={useMyLocation}>Lấy vị trí hiện tại</button>
              </div>
              <div className="row g-2">
                <div className="col-4"><input className="form-control" placeholder="Vĩ độ" value={form.lat} onChange={set("lat")} /></div>
                <div className="col-4"><input className="form-control" placeholder="Kinh độ" value={form.lng} onChange={set("lng")} /></div>
                <div className="col-4"><input type="number" min="10" max="5000" className="form-control" placeholder="Bán kính (m)" value={form.radiusM} onChange={set("radiusM")} /></div>
              </div>
              <div className="form-text">Nếu có vị trí, lần chấm công ngoài bán kính sẽ được gắn cờ cho admin xem (không chặn nhân viên).</div>
            </div>
          </form>
        </Modal>
      )}

      {qrStall && <QrModal stall={qrStall} onClose={() => setQrStall(null)} />}
    </div>
  );
}

// Mã QR trỏ tới /s/<id> của chính website này — in ra dán tại quầy.
function QrModal({ stall, onClose }) {
  const [dataUrl, setDataUrl] = useState("");
  const url = `${window.location.origin}/s/${stall.id}`;

  useEffect(() => {
    QRCode.toDataURL(url, { width: 480, margin: 2 }).then(setDataUrl).catch(() => setDataUrl(""));
  }, [url]);

  function print() {
    const w = window.open("", "_blank", "width=480,height=640");
    if (!w) return;
    w.document.write(
      `<html><head><title>QR ${stall.name.replace(/[<>&]/g, "")}</title></head>` +
        `<body style="font-family:sans-serif;text-align:center;padding:24px">` +
        `<h2></h2><img src="${dataUrl}" style="width:360px"/><p>Quét mã để chấm công</p></body></html>`
    );
    w.document.querySelector("h2").textContent = stall.name; // textContent: tránh chèn HTML từ tên gian hàng
    w.document.close();
    w.focus();
    w.print();
  }

  return (
    <Modal title={`Mã QR — ${stall.name}`} onClose={onClose} width={440}
      footer={
        <>
          <a className={`btn btn-outline-secondary ${dataUrl ? "" : "disabled"}`} href={dataUrl} download={`qr-${stall.name}.png`}>Tải ảnh</a>
          <button type="button" className="btn btn-primary" onClick={print} disabled={!dataUrl}>In</button>
        </>
      }
    >
      <div className="text-center">
        {dataUrl ? <img src={dataUrl} alt="Mã QR gian hàng" style={{ width: 280, maxWidth: "100%" }} /> : <p className="text-muted">Đang tạo mã...</p>}
        <div className="small text-muted text-break mt-2">{url}</div>
      </div>
    </Modal>
  );
}
