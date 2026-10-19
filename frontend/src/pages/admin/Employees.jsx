import { useEffect, useState } from "react";
import { api } from "../../api/client.js";
import Modal from "../../components/hr/Modal.jsx";
import { useNotification } from "../../context/NotificationContext.jsx";
import { fmtMoney, vnDateKey } from "../../utils/format.js";

const EMPTY = { fullName: "", email: "", password: "", phone: "", position: "", stallId: "", hourlyRate: "", effectiveFrom: "" };

// Quản lý nhân viên chấm công: thông tin cơ bản, gian hàng, lương theo giờ.
// (Tài khoản admin vẫn tạo ở mục "Tài khoản".)
export default function Employees() {
  const { notifySuccess, notifyError } = useNotification();
  const [employees, setEmployees] = useState([]);
  const [stalls, setStalls] = useState([]);
  const [filterStall, setFilterStall] = useState("");
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(null);
  const [origRate, setOrigRate] = useState(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    try {
      const [e, s] = await Promise.all([
        api.get(`/hr/employees${filterStall ? `?stallId=${filterStall}` : ""}`),
        api.get("/hr/stalls"),
      ]);
      setEmployees(e.employees);
      setStalls(s.stalls);
    } catch (err) {
      notifyError(err.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterStall]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  function openEdit(emp) {
    setOrigRate(emp.hourlyRate ?? 0);
    setForm({
      id: emp.id, fullName: emp.fullName, email: emp.email, password: "", phone: emp.phone || "",
      position: emp.position || "", stallId: emp.stallId || "", hourlyRate: String(emp.hourlyRate ?? 0),
      effectiveFrom: vnDateKey(), isActive: emp.isActive,
    });
  }

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    try {
      if (form.id) {
        const body = {
          fullName: form.fullName, phone: form.phone, position: form.position,
          stallId: form.stallId || null, isActive: form.isActive,
        };
        if (form.password) body.password = form.password;
        if (Number(form.hourlyRate) !== Number(origRate)) {
          body.hourlyRate = Number(form.hourlyRate);
          body.effectiveFrom = form.effectiveFrom;
        }
        await api.patch(`/hr/employees/${form.id}`, body);
        notifySuccess("Đã cập nhật nhân viên.");
      } else {
        await api.post("/hr/employees", {
          fullName: form.fullName, email: form.email, password: form.password, phone: form.phone,
          position: form.position, stallId: form.stallId || undefined, hourlyRate: Number(form.hourlyRate || 0),
        });
        notifySuccess("Đã tạo tài khoản nhân viên.");
      }
      setForm(null);
      await load();
    } catch (err) {
      notifyError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const rateChanged = form?.id && Number(form.hourlyRate) !== Number(origRate);

  return (
    <div>
      <div className="d-flex flex-wrap gap-2 justify-content-between align-items-center mb-3">
        <select className="form-select form-select-sm" style={{ maxWidth: 240 }} value={filterStall} onChange={(e) => setFilterStall(e.target.value)}>
          <option value="">Tất cả gian hàng</option>
          {stalls.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => { setOrigRate(null); setForm({ ...EMPTY }); }}>
          + Thêm nhân viên
        </button>
      </div>

      <div className="card">
        <div className="table-responsive">
          <table className="table table-sm table-hover align-middle mb-0">
            <thead>
              <tr>
                <th className="ps-3">Họ tên</th>
                <th>Gian hàng</th>
                <th>Chức vụ</th>
                <th>SĐT</th>
                <th className="text-end">Lương giờ</th>
                <th>Trạng thái</th>
                <th className="pe-3" />
              </tr>
            </thead>
            <tbody>
              {employees.map((e) => (
                <tr key={e.id} className={e.isActive ? "" : "text-muted"}>
                  <td className="ps-3">
                    <div className="fw-semibold">{e.fullName}</div>
                    <div className="small text-muted">{e.email}</div>
                  </td>
                  <td>{e.stallName || <span className="text-warning">Chưa gán</span>}</td>
                  <td>{e.position || "—"}</td>
                  <td>{e.phone || "—"}</td>
                  <td className="text-end">{fmtMoney(e.hourlyRate ?? 0)}</td>
                  <td>{e.isActive ? <span className="badge text-bg-success">Đang làm</span> : <span className="badge text-bg-secondary">Đã nghỉ</span>}</td>
                  <td className="pe-3 text-end">
                    <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => openEdit(e)}>Sửa</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!loading && employees.length === 0 && <p className="text-muted p-3 mb-0">Chưa có nhân viên nào.</p>}
      </div>

      {form && (
        <Modal
          title={form.id ? "Sửa nhân viên" : "Thêm nhân viên"}
          onClose={() => setForm(null)}
          footer={
            <>
              <button type="button" className="btn btn-outline-secondary" onClick={() => setForm(null)}>Huỷ</button>
              <button type="submit" form="emp-form" className="btn btn-primary" disabled={saving}>{saving ? "Đang lưu..." : "Lưu"}</button>
            </>
          }
        >
          <form id="emp-form" onSubmit={save} className="row g-2">
            <div className="col-12">
              <label className="form-label small mb-1">Họ tên</label>
              <input className="form-control" required value={form.fullName} onChange={set("fullName")} />
            </div>
            <div className="col-12">
              <label className="form-label small mb-1">Email đăng nhập</label>
              <input type="email" className="form-control" required disabled={!!form.id} value={form.email} onChange={set("email")} />
            </div>
            <div className="col-12">
              <label className="form-label small mb-1">{form.id ? "Đặt lại mật khẩu (để trống nếu không đổi)" : "Mật khẩu"}</label>
              <input type="text" autoComplete="new-password" className="form-control" required={!form.id} minLength={form.id && !form.password ? 0 : 6} value={form.password} onChange={set("password")} placeholder="Tối thiểu 6 ký tự" />
            </div>
            <div className="col-6">
              <label className="form-label small mb-1">Số điện thoại</label>
              <input className="form-control" value={form.phone} onChange={set("phone")} />
            </div>
            <div className="col-6">
              <label className="form-label small mb-1">Chức vụ</label>
              <input className="form-control" value={form.position} onChange={set("position")} />
            </div>
            <div className="col-12">
              <label className="form-label small mb-1">Gian hàng</label>
              <select className="form-select" value={form.stallId} onChange={set("stallId")}>
                <option value="">— Chưa gán —</option>
                {stalls.filter((s) => s.isActive || s.id === form.stallId).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="col-12 col-sm-6">
              <label className="form-label small mb-1">Lương mỗi giờ (đ)</label>
              <input type="number" min="0" step="500" className="form-control" required value={form.hourlyRate} onChange={set("hourlyRate")} />
            </div>
            {rateChanged && (
              <div className="col-12 col-sm-6">
                <label className="form-label small mb-1">Áp dụng từ ngày</label>
                <input type="date" className="form-control" required min={`${vnDateKey().slice(0, 7)}-01`} value={form.effectiveFrom} onChange={set("effectiveFrom")} />
              </div>
            )}
            {rateChanged && <div className="col-12 form-text mt-0">Các ngày trước ngày này vẫn tính theo mức lương cũ. Không áp dụng lùi về tháng đã khoá.</div>}
            {form.id && (
              <div className="col-12">
                <div className="form-check form-switch mt-1">
                  <input className="form-check-input" type="checkbox" id="emp-active" checked={form.isActive} onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))} />
                  <label className="form-check-label" htmlFor="emp-active">Đang làm việc (tắt = nghỉ việc, không đăng nhập được)</label>
                </div>
              </div>
            )}
          </form>
        </Modal>
      )}
    </div>
  );
}
