import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../api/client.js";
import Modal from "../../components/hr/Modal.jsx";
import DateInput from "../../components/hr/DateInput.jsx";
import { fmtDate } from "../../utils/format.js";
import { useAuth } from "../../context/AuthContext.jsx";
import { useNotification } from "../../context/NotificationContext.jsx";

// Trang SUPERADMIN: tạo cửa hàng (kèm admin đầu tiên), quản lý gói sử dụng của
// từng cửa hàng (SĐT chủ cửa hàng, số nhân viên tối đa, ngày hết hạn, tạm
// ngưng/mở lại) và tài khoản superadmin. Superadmin KHÔNG quản lý admin/nhân
// viên của cửa hàng — sau khi tạo, cửa hàng tự quản lý.
const EMPTY_STORE = {
  name: "", address: "", ownerPhoneNumber: "", maxEmployeeCount: "", expiryDate: "",
  adminFullName: "", adminEmail: "", adminPassword: "",
};
const EMPTY_SUPERADMIN = { fullName: "", email: "", password: "" };

const PLAN_STATUS = {
  active: { text: "Hoạt động", cls: "text-bg-success" },
  expiring: { text: "Sắp hết hạn", cls: "text-bg-warning" },
  expired: { text: "Hết hạn", cls: "text-bg-danger" },
  inactive: { text: "Tạm ngưng", cls: "text-bg-secondary" },
};

const fmtExpiry = (d) => (d ? fmtDate(d) : "Không thời hạn");

// Các trường gói dùng chung cho form tạo và form sửa
function PlanFields({ form, set }) {
  return (
    <>
      <div className="col-12">
        <label className="form-label small mb-1">Số điện thoại chủ cửa hàng</label>
        <input type="tel" className="form-control" required value={form.ownerPhoneNumber} onChange={set("ownerPhoneNumber")} placeholder="Dùng để chăm sóc khách hàng" />
      </div>
      <div className="col-6">
        <label className="form-label small mb-1">Số nhân viên tối đa</label>
        <input type="number" min="1" className="form-control" value={form.maxEmployeeCount} onChange={set("maxEmployeeCount")} placeholder="Không giới hạn" />
        <div className="form-text">Tính cả admin, chỉ tài khoản đang hoạt động.</div>
      </div>
      <div className="col-6">
        <label className="form-label small mb-1">Ngày hết hạn</label>
        <DateInput value={form.expiryDate} onChange={(v) => set("expiryDate")({ target: { value: v } })} />
        <div className="form-text">Dùng được tới hết ngày này. Để trống = không thời hạn.</div>
      </div>
    </>
  );
}

export default function SuperadminPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { notifySuccess, notifyError, confirm } = useNotification();
  const [stores, setStores] = useState([]);
  const [stats, setStats] = useState(null);
  const [filter, setFilter] = useState("");
  const [superadmins, setSuperadmins] = useState([]);
  const [storeForm, setStoreForm] = useState(null); // tạo mới (không có id) hoặc sửa (có id)
  const [superadminForm, setSuperadminForm] = useState(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    const [s, a] = await Promise.all([api.get("/superadmin/stores"), api.get("/superadmin/accounts")]);
    setStores(s.stores);
    setStats(s.stats);
    setSuperadmins(a.accounts);
  }

  useEffect(() => {
    load().catch((e) => notifyError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleLogout() {
    logout();
    navigate("/login", { replace: true });
  }

  async function submit(e, action, successMessage, close) {
    e.preventDefault();
    setSaving(true);
    try {
      await action();
      notifySuccess(successMessage);
      close();
      await load();
    } catch (err) {
      notifyError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const planBody = (f) => ({
    ownerPhoneNumber: f.ownerPhoneNumber.trim(),
    maxEmployeeCount: f.maxEmployeeCount === "" ? null : Number(f.maxEmployeeCount),
    expiryDate: f.expiryDate || null,
  });

  async function saveStore(e) {
    const f = storeForm;
    e.preventDefault();
    if (f.id) {
      if (f.orig.isActive && !f.isActive) {
        const ok = await confirm(`Tạm ngưng "${f.orig.name}"? Mọi tài khoản của cửa hàng sẽ bị đăng xuất và không đăng nhập được.`, {
          confirmText: "Tạm ngưng", danger: true,
        });
        if (!ok) return;
      }
      return submit(
        e,
        () => api.patch(`/superadmin/stores/${f.id}`, { name: f.name, address: f.address, isActive: f.isActive, ...planBody(f) }),
        `Đã cập nhật "${f.name}".`,
        () => setStoreForm(null)
      );
    }
    return submit(
      e,
      () =>
        api.post("/superadmin/stores", {
          name: f.name,
          address: f.address,
          ...planBody(f),
          admin: { fullName: f.adminFullName, email: f.adminEmail, password: f.adminPassword },
        }),
      `Đã tạo cửa hàng "${f.name}".`,
      () => setStoreForm(null)
    );
  }

  function openEdit(s) {
    setStoreForm({
      id: s.id, name: s.name, address: s.address || "", ownerPhoneNumber: s.ownerPhoneNumber || "",
      maxEmployeeCount: s.maxEmployeeCount ?? "", expiryDate: s.expiryDate || "", isActive: s.isActive, orig: s,
    });
  }

  const createSuperadmin = (e) =>
    submit(e, () => api.post("/superadmin/accounts", superadminForm), "Đã tạo tài khoản superadmin.", () => setSuperadminForm(null));

  const setStore = (k) => (e) => setStoreForm((f) => ({ ...f, [k]: e.target.value }));
  const setSuper = (k) => (e) => setSuperadminForm((f) => ({ ...f, [k]: e.target.value }));

  const tiles = stats
    ? [
        { key: "", label: "Tổng cửa hàng", value: stats.total },
        { key: "active", label: "Đang hoạt động", value: stats.active },
        { key: "expiring", label: `Hết hạn trong ${stats.expiringSoonDays} ngày`, value: stats.expiring, tone: stats.expiring ? "text-warning-emphasis" : "" },
        { key: "expired", label: "Đã hết hạn", value: stats.expired, tone: stats.expired ? "text-danger" : "" },
        { key: "inactive", label: "Tạm ngưng", value: stats.inactive },
      ]
    : [];
  const shownStores = stores.filter((s) =>
    !filter ? true : filter === "active" ? ["active", "expiring"].includes(s.planStatus) : s.planStatus === filter
  );

  return (
    <div className="container py-4" style={{ maxWidth: 1180 }}>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div className="d-flex align-items-center gap-2">
          <img src="/logo.svg" alt="" className="rounded-3 flex-shrink-0" width={36} height={36} />
          <div>
            <h1 className="h5 mb-0">Quản trị hệ thống</h1>
            <div className="small text-muted">{user?.fullName}</div>
          </div>
        </div>
        <button type="button" className="btn btn-outline-secondary btn-sm" onClick={handleLogout}>Đăng xuất</button>
      </div>

      <div className="row g-2 mb-3">
        {tiles.map((t) => (
          <div key={t.label} className="col-6 col-md">
            <button
              type="button"
              className={`card h-100 w-100 text-start ${filter === t.key ? "border-primary" : ""}`}
              onClick={() => setFilter(t.key)}
            >
              <div className="card-body py-2">
                <div className={`fs-4 fw-bold ${t.tone || ""}`}>{t.value}</div>
                <div className="small text-muted">{t.label}</div>
              </div>
            </button>
          </div>
        ))}
      </div>

      <div className="d-flex justify-content-between align-items-center mb-2">
        <h2 className="h6 mb-0">Cửa hàng ({shownStores.length})</h2>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setStoreForm({ ...EMPTY_STORE })}>+ Tạo cửa hàng</button>
      </div>
      <div className="card mb-4">
        <div className="table-responsive">
          <table className="table table-sm align-middle mb-0">
            <thead>
              <tr>
                <th className="ps-3">Cửa hàng</th>
                <th>SĐT chủ cửa hàng</th>
                <th className="text-end">Tài khoản / tối đa</th>
                <th>Hết hạn</th>
                <th>Trạng thái</th>
                <th className="pe-3" />
              </tr>
            </thead>
            <tbody>
              {shownStores.map((s) => {
                const full = s.maxEmployeeCount != null && s.activeAccountCount >= s.maxEmployeeCount;
                const status = PLAN_STATUS[s.planStatus];
                return (
                  <tr key={s.id} className={s.isActive ? "" : "text-muted"}>
                    <td className="ps-3">
                      <div className="fw-semibold">{s.name}</div>
                      <div className="small text-muted">{s.address || "—"}</div>
                    </td>
                    <td>{s.ownerPhoneNumber ? <a href={`tel:${s.ownerPhoneNumber}`}>{s.ownerPhoneNumber}</a> : <span className="text-warning">Chưa có</span>}</td>
                    <td className={`text-end ${full ? "text-danger fw-semibold" : ""}`} title={`${s.adminCount} admin, ${s.userCount} nhân viên (kể cả tài khoản đã khoá)`}>
                      {s.activeAccountCount} / {s.maxEmployeeCount ?? "∞"}
                    </td>
                    <td className="text-nowrap">{fmtExpiry(s.expiryDate)}</td>
                    <td><span className={`badge ${status.cls}`}>{status.text}</span></td>
                    <td className="pe-3 text-end">
                      <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => openEdit(s)}>Sửa</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {shownStores.length === 0 && <p className="text-muted p-3 mb-0">Không có cửa hàng nào.</p>}
      </div>

      <div className="d-flex justify-content-between align-items-center mb-2">
        <h2 className="h6 mb-0">Tài khoản superadmin ({superadmins.length})</h2>
        <button type="button" className="btn btn-outline-primary btn-sm" onClick={() => setSuperadminForm({ ...EMPTY_SUPERADMIN })}>+ Thêm superadmin</button>
      </div>
      <ul className="list-group">
        {superadmins.map((a) => (
          <li key={a.id} className="list-group-item d-flex justify-content-between">
            <span className="fw-semibold">{a.fullName}</span>
            <span className="text-muted small">{a.email}</span>
          </li>
        ))}
      </ul>

      {storeForm && (
        <Modal
          title={storeForm.id ? "Sửa cửa hàng" : "Tạo cửa hàng"}
          onClose={() => setStoreForm(null)}
          footer={
            <>
              <button type="button" className="btn btn-outline-secondary" onClick={() => setStoreForm(null)}>Huỷ</button>
              <button type="submit" form="store-form" className="btn btn-primary" disabled={saving}>
                {saving ? "Đang lưu..." : storeForm.id ? "Lưu" : "Tạo"}
              </button>
            </>
          }
        >
          <form id="store-form" onSubmit={saveStore} className="row g-2">
            <div className="col-12">
              <label className="form-label small mb-1">Tên cửa hàng</label>
              <input className="form-control" required value={storeForm.name} onChange={setStore("name")} />
            </div>
            <div className="col-12">
              <label className="form-label small mb-1">Địa chỉ</label>
              <input className="form-control" value={storeForm.address} onChange={setStore("address")} />
            </div>
            <PlanFields form={storeForm} set={setStore} />

            {storeForm.id ? (
              <div className="col-12">
                <div className="form-check form-switch mt-1">
                  <input className="form-check-input" type="checkbox" id="store-active" checked={storeForm.isActive} onChange={(e) => setStoreForm((f) => ({ ...f, isActive: e.target.checked }))} />
                  <label className="form-check-label" htmlFor="store-active">Đang hoạt động (tắt = mọi tài khoản của cửa hàng không đăng nhập được)</label>
                </div>
              </div>
            ) : (
              <>
                <div className="col-12 mt-3 fw-semibold small">Quản trị viên đầu tiên của cửa hàng</div>
                <div className="col-12">
                  <label className="form-label small mb-1">Họ tên</label>
                  <input className="form-control" required value={storeForm.adminFullName} onChange={setStore("adminFullName")} />
                </div>
                <div className="col-6">
                  <label className="form-label small mb-1">Email</label>
                  <input type="email" className="form-control" required value={storeForm.adminEmail} onChange={setStore("adminEmail")} />
                </div>
                <div className="col-6">
                  <label className="form-label small mb-1">Mật khẩu</label>
                  <input type="text" autoComplete="new-password" className="form-control" required minLength={6} value={storeForm.adminPassword} onChange={setStore("adminPassword")} />
                </div>
                <div className="col-12 form-text">Thiết lập ca/phạt mặc định 08:00–17:00, 0đ/phút — admin cửa hàng tự chỉnh sau.</div>
              </>
            )}
          </form>
        </Modal>
      )}

      {superadminForm && (
        <Modal
          title="Thêm superadmin"
          onClose={() => setSuperadminForm(null)}
          footer={
            <>
              <button type="button" className="btn btn-outline-secondary" onClick={() => setSuperadminForm(null)}>Huỷ</button>
              <button type="submit" form="superadmin-form" className="btn btn-primary" disabled={saving}>Tạo</button>
            </>
          }
        >
          <form id="superadmin-form" onSubmit={createSuperadmin} className="row g-2">
            <div className="col-12">
              <label className="form-label small mb-1">Họ tên</label>
              <input className="form-control" required value={superadminForm.fullName} onChange={setSuper("fullName")} />
            </div>
            <div className="col-6">
              <label className="form-label small mb-1">Email</label>
              <input type="email" className="form-control" required value={superadminForm.email} onChange={setSuper("email")} />
            </div>
            <div className="col-6">
              <label className="form-label small mb-1">Mật khẩu</label>
              <input type="text" autoComplete="new-password" className="form-control" required minLength={6} value={superadminForm.password} onChange={setSuper("password")} />
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
