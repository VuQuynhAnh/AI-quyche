// Toàn bộ sơ đồ điều hướng (routing) của ứng dụng.
//  - Nhân viên (điện thoại): /s/:id (quét QR), /work (chấm công), /work/history
//    (lịch sử tháng), và /chat (chat AI toàn màn hình — còn có cửa sổ chat nổi
//    trong /work*). Chat không còn là màn hình chính.
//  - Admin (máy tính): /admin/* — nhóm "Chấm công & lương" (mặc định) và nhóm
//    "Trợ lý AI" (tổng quan, hội thoại, quy chế — giữ nguyên tính năng cũ).
import { Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login.jsx";
import Register from "./pages/Register.jsx";
import ProtectedRoute from "./routes/ProtectedRoute.jsx";
import AdminLayout from "./pages/admin/AdminLayout.jsx";
import Dashboard from "./pages/admin/Dashboard.jsx";
import Documents from "./pages/admin/Documents.jsx";
import Logs from "./pages/admin/Logs.jsx";
import Users from "./pages/admin/Users.jsx";
import Chat from "./pages/client/Chat.jsx";
import EmployeeLayout from "./pages/employee/EmployeeLayout.jsx";
import CheckIn from "./pages/employee/CheckIn.jsx";
import History from "./pages/employee/History.jsx";
import StallLanding from "./pages/employee/StallLanding.jsx";
import Attendance from "./pages/admin/Attendance.jsx";
import Employees from "./pages/admin/Employees.jsx";
import Stalls from "./pages/admin/Stalls.jsx";
import Payroll from "./pages/admin/Payroll.jsx";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />

      {/* Quét QR tại gian hàng — công khai, chỉ ghi nhớ gian hàng rồi chuyển đăng nhập */}
      <Route path="/s/:stallId" element={<StallLanding />} />

      {/* Giao diện nhân viên: chấm công + lịch sử (kèm chat nổi) */}
      <Route
        path="/work"
        element={
          <ProtectedRoute allowedRoles={["employee"]}>
            <EmployeeLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<CheckIn />} />
        <Route path="history" element={<History />} />
      </Route>

      {/* Chat AI toàn màn hình */}
      <Route
        path="/chat"
        element={
          <ProtectedRoute allowedRoles={["employee", "admin"]}>
            <Chat />
          </ProtectedRoute>
        }
      />

      {/* Trang admin: quản lý văn bản, người dùng, lịch sử hỏi đáp + thống kê.
          Toàn bộ nhánh này chỉ dành cho role 'admin' (chặn ở ProtectedRoute). */}
      <Route
        path="/admin"
        element={
          <ProtectedRoute allowedRoles={["admin"]}>
            <AdminLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/admin/attendance" replace />} />
        <Route path="attendance" element={<Attendance />} />
        <Route path="employees" element={<Employees />} />
        <Route path="stalls" element={<Stalls />} />
        <Route path="payroll" element={<Payroll />} />
        <Route path="ai" element={<Dashboard />} />
        <Route path="documents" element={<Documents />} />
        <Route path="logs" element={<Logs />} />
        <Route path="users" element={<Users />} />
      </Route>

      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
