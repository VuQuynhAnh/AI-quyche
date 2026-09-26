import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

// Chặn truy cập nếu chưa đăng nhập, hoặc role không nằm trong danh sách cho phép.
export default function ProtectedRoute({ children, allowedRoles }) {
  const { user } = useAuth();

  if (!user) return <Navigate to="/login" replace />;

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    // Nhân viên cố vào /admin -> đưa về trang chat; admin cố vào trang khác -> tuỳ chỉnh thêm nếu cần
    return <Navigate to={user.role === "admin" ? "/admin" : "/chat"} replace />;
  }

  return children;
}
