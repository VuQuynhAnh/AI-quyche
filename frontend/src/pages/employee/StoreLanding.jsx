import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../../api/client.js";
import { useAuth } from "../../context/AuthContext.jsx";
import { ROLE } from "../../constants/enums.js";

export const QR_STORE_STORAGE_KEY = "qrStoreId";

// Trang đích khi nhân viên quét QR tại cửa hàng: /s/<storeId>.
// Ghi nhớ id cửa hàng trên thiết bị (localStorage) rồi đưa sang đăng nhập /
// màn chấm công. Server vẫn kiểm tra lại id này khớp với cửa hàng của tài
// khoản mỗi lần chấm công, nên lưu ở đây không phải là điểm yếu.
export default function StoreLanding() {
  const { storeId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [store, setStore] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    api
      .get(`/clocking/store/${storeId}`)
      .then((d) => {
        if (cancelled) return;
        setStore(d.store);
        try {
          localStorage.setItem(QR_STORE_STORAGE_KEY, d.store.id);
        } catch {
          /* trình duyệt chặn lưu trữ: vẫn đi tiếp được, chỉ phải quét lại lần sau */
        }
        if (user?.role === ROLE.USER) navigate("/work", { replace: true });
      })
      .catch((e) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  return (
    <div className="auth-page container d-flex align-items-center">
      <div className="card border-0 shadow-sm mx-auto text-center" style={{ maxWidth: 400, width: "100%" }}>
        <div className="card-body p-4">
          <img src="/logo.svg" alt="" className="auth-logo mb-3" />
          {error && <div className="alert alert-danger">{error}</div>}
          {!error && !store && <p className="text-muted mb-0">Đang nhận diện cửa hàng...</p>}
          {store && (
            <>
              <p className="text-muted mb-1">Bạn đang ở</p>
              <h1 className="h4">{store.name}</h1>
              {store.address && <p className="text-muted small">{store.address}</p>}
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
