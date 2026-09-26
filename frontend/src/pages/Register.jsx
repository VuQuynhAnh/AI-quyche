import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api/client.js";
import { useAuth } from "../context/AuthContext.jsx";

// Trang đăng ký dành cho NHÂN VIÊN (client). Không có lựa chọn "role" ở đây —
// tài khoản admin chỉ được tạo qua script seed hoặc trực tiếp trong DB, để
// tránh việc bất kỳ ai cũng tự đăng ký thành quản trị viên.
export default function Register() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Mật khẩu nhập lại không khớp.");
      return;
    }
    if (password.length < 6) {
      setError("Mật khẩu cần tối thiểu 6 ký tự.");
      return;
    }

    setLoading(true);
    try {
      await api.post("/auth/register", { fullName, email, password, role: "employee" });
      await login(email, password);
      navigate("/chat", { replace: true });
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
          <h1 className="h4 mb-1">Tạo tài khoản nhân viên</h1>
          <p className="text-muted mb-4">Để bắt đầu hỏi đáp quy chế nội bộ</p>

          <form onSubmit={handleSubmit}>
            <div className="mb-3">
              <label className="form-label">Họ và tên</label>
              <input
                className="form-control"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Nguyễn Văn A"
              />
            </div>

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
                placeholder="Tối thiểu 6 ký tự"
              />
            </div>

            <div className="mb-3">
              <label className="form-label">Nhập lại mật khẩu</label>
              <input
                type="password"
                className="form-control"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>

            {error && <div className="alert alert-danger py-2">{error}</div>}

            <button className="btn btn-primary w-100" type="submit" disabled={loading}>
              {loading ? "Đang tạo tài khoản..." : "Đăng ký"}
            </button>
          </form>

          <p className="text-center text-muted small mt-3 mb-0">
            Đã có tài khoản? <Link to="/login">Đăng nhập</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
