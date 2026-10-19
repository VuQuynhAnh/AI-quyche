import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../../api/client.js";
import { useAuth } from "../../context/AuthContext.jsx";

// Trang đích khi nhân viên quét QR tại gian hàng: /s/<stallId>.
// Ghi nhớ id gian hàng trên thiết bị (localStorage) rồi đưa sang đăng nhập /
// màn chấm công. Server vẫn kiểm tra lại id này khớp với gian hàng của tài
// khoản mỗi lần chấm công, nên lưu ở đây không phải là điểm yếu.
export default function StallLanding() {
  const { stallId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stall, setStall] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    api
      .get(`/attendance/stall/${stallId}`)
      .then((d) => {
        if (cancelled) return;
        setStall(d.stall);
        try {
          localStorage.setItem("qrStallId", d.stall.id);
        } catch {
          /* trình duyệt chặn lưu trữ: vẫn đi tiếp được, chỉ phải quét lại lần sau */
        }
        if (user?.role === "employee") navigate("/work", { replace: true });
      })
      .catch((e) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stallId]);

  return (
    <div className="auth-page container d-flex align-items-center">
      <div className="card border-0 shadow-sm mx-auto text-center" style={{ maxWidth: 400, width: "100%" }}>
        <div className="card-body p-4">
          <img src="/logo.svg" alt="" className="auth-logo mb-3" />
          {error && <div className="alert alert-danger">{error}</div>}
          {!error && !stall && <p className="text-muted mb-0">Đang nhận diện gian hàng...</p>}
          {stall && (
            <>
              <p className="text-muted mb-1">Bạn đang ở gian hàng</p>
              <h1 className="h4">{stall.name}</h1>
              {stall.address && <p className="text-muted small">{stall.address}</p>}
              <Link to="/login" className="btn btn-primary w-100 mt-2">
                Đăng nhập để chấm công
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
