// Trang đăng nhập — dùng chung cho cả admin và nhân viên; sau khi đăng nhập,
// điều hướng theo "role" trả về từ backend (admin -> /admin, employee -> /chat).
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const user = await login(email, password);
      navigate(user.role === "admin" ? "/admin" : "/chat", { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page container d-flex align-items-center">
      <div className="card border-0 shadow-sm mx-auto" style={{ maxWidth: 400, width: "100%" }}>
        <div className="card-body p-4">
          <img src="/logo.svg" alt="" className="auth-logo mb-3" />
          <h1 className="h4 mb-1">Trợ lý AI Quy chế Nội bộ</h1>
          <p className="text-muted mb-4">Đăng nhập để tiếp tục</p>

          <form onSubmit={handleSubmit}>
            <div className="mb-3">
              <label className="form-label">Email</label>
              <input
                type="email"
                className="form-control"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ban@congty.vn"
              />
            </div>

            <div className="mb-3">
              <label className="form-label">Mật khẩu</label>
              <input
                type="password"
                className="form-control"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>

            {error && <div className="alert alert-danger py-2">{error}</div>}

            <button className="btn btn-primary w-100" type="submit" disabled={loading}>
              {loading ? "Đang đăng nhập..." : "Đăng nhập"}
            </button>
          </form>

          <p className="text-center text-muted small mt-3 mb-0">
            Chưa có tài khoản? <Link to="/register">Đăng ký</Link>
          </p>

          <p className="text-muted small mt-3 mb-0">
            Tài khoản demo (sau khi chạy <code>npm run seed</code>):<br />
            Admin: admin@congty.vn / Admin@123<br />
            Nhân viên: nhanvien@congty.vn / NhanVien@123
          </p>
        </div>
      </div>
    </div>
  );
}
