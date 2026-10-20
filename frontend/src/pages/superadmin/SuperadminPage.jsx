import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../api/client.js";
import Modal from "../../components/hr/Modal.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import { useNotification } from "../../context/NotificationContext.jsx";

// Trang SUPERADMIN: tạo cửa hàng (kèm admin đầu tiên), tạm ngưng/mở lại cửa
// hàng, và quản lý tài khoản superadmin. Superadmin KHÔNG quản lý admin/nhân
// viên của cửa hàng — sau khi tạo, cửa hàng tự quản lý.
const EMPTY_STORE = { name: "", address: "", adminFullName: "", adminEmail: "", adminPassword: "" };
const EMPTY_SUPERADMIN = { fullName: "", email: "", password: "" };

export default function SuperadminPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { notifySuccess, notifyError, confirm } = useNotification();
  const [stores, setStores] = useState([]);
  const [superadmins, setSuperadmins] = useState([]);
  const [storeForm, setStoreForm] = useState(null);
  const [superadminForm, setSuperadminForm] = useState(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    const [s, a] = await Promise.all([api.get("/superadmin/stores"), api.get("/superadmin/accounts")]);
    setStores(s.stores);
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

  const createStore = (e) =>
    submit(
      e,
      () =>
        api.post("/superadmin/stores", {
          name: storeForm.name,
          address: storeForm.address,
          admin: { fullName: storeForm.adminFullName, email: storeForm.adminEmail, password: storeForm.adminPassword },
        }),
      `Đã tạo cửa hàng "${storeForm.name}".`,
      () => setStoreForm(null)
    );

  const createSuperadmin = (e) =>
    submit(e, () => api.post("/superadmin/accounts", superadminForm), "Đã tạo tài khoản superadmin.", () => setSuperadminForm(null));

  async function toggleStore(store) {
    const ok = await confirm(
      store.isActive
        ? `Tạm ngưng "${store.name}"? Mọi tài khoản của cửa hàng sẽ không đăng nhập được.`
        : `Mở lại "${store.name}"?`,
      { confirmText: store.isActive ? "Tạm ngưng" : "Mở lại", danger: store.isActive }
    );
    if (!ok) return;
    try {
      await api.patch(`/superadmin/stores/${store.id}`, { isActive: !store.isActive });
      await load();
    } catch (e) {
      notifyError(e.message);
    }
  }

  const setStore = (k) => (e) => setStoreForm((f) => ({ ...f, [k]: e.target.value }));
  const setSuper = (k) => (e) => setSuperadminForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="container py-4" style={{ maxWidth: 1080 }}>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div className="d-flex align-items-center gap-2">
          <img src="/logo.svg" alt="" className="brand-icon" />
          <div>
            <h1 className="h5 mb-0">Quản trị hệ thống</h1>
            <div className="small text-muted">{user?.fullName}</div>
          </div>
        </div>
        <button type="button" className="btn btn-outline-secondary btn-sm" onClick={handleLogout}>Đăng xuất</button>
      </div>

      <div className="d-flex justify-content-between align-items-center mb-2">
        <h2 className="h6 mb-0">Cửa hàng ({stores.length})</h2>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setStoreForm({ ...EMPTY_STORE })}>+ Tạo cửa hàng</button>
      </div>
      <div className="card mb-4">
        <div className="table-responsive">
          <table className="table table-sm align-middle mb-0">
            <thead>
              <tr>
                <th className="ps-3">Cửa hàng</th>
                <th className="text-end">Quản trị viên</th>
                <th className="text-end">Nhân viên</th>
                <th>Trạng thái</th>
                <th className="pe-3" />
              </tr>
            </thead>
            <tbody>
              {stores.map((s) => (
                <tr key={s.id} className={s.isActive ? "" : "text-muted"}>
                  <td className="ps-3">
                    <div className="fw-semibold">{s.name}</div>
                    <div className="small text-muted">{s.address || "—"}</div>
                  </td>
                  <td className="text-end">{s.adminCount}</td>
                  <td className="text-end">{s.userCount}</td>
                  <td>{s.isActive ? <span className="badge text-bg-success">Hoạt động</span> : <span className="badge text-bg-secondary">Tạm ngưng</span>}</td>
                  <td className="pe-3 text-end">
                    <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => toggleStore(s)}>
                      {s.isActive ? "Tạm ngưng" : "Mở lại"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {stores.length === 0 && <p className="text-muted p-3 mb-0">Chưa có cửa hàng nào.</p>}
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
          title="Tạo cửa hàng"
          onClose={() => setStoreForm(null)}
          footer={
            <>
              <button type="button" className="btn btn-outline-secondary" onClick={() => setStoreForm(null)}>Huỷ</button>
              <button type="submit" form="store-form" className="btn btn-primary" disabled={saving}>{saving ? "Đang tạo..." : "Tạo"}</button>
            </>
          }
        >
          <form id="store-form" onSubmit={createStore} className="row g-2">
            <div className="col-12">
              <label className="form-label small mb-1">Tên cửa hàng</label>
              <input className="form-control" required value={storeForm.name} onChange={setStore("name")} />
            </div>
            <div className="col-12">
              <label className="form-label small mb-1">Địa chỉ</label>
              <input className="form-control" value={storeForm.address} onChange={setStore("address")} />
            </div>
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
