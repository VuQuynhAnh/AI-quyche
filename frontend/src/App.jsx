// Toàn bộ sơ đồ điều hướng (routing) của ứng dụng — 3 vai trò (constants/enums.js):
//  - superadmin (máy tính): /superadmin — tạo cửa hàng + admin đầu tiên, tạo superadmin.
//  - admin cửa hàng (máy tính): /admin/* — nhóm "Chấm công & lương" (mặc định),
//    nhóm "Trợ lý AI" (tổng quan, hội thoại, quy chế) và "Tài khoản".
//  - user = nhân viên (điện thoại): /s/:storeId (quét QR), /work (chấm công),
//    /work/history (lịch sử + lương), /chat (chat AI toàn màn hình).
import { Routes, Route, Navigate } from "react-router-dom";
import { ROLE } from "./constants/enums.js";
import Login from "./pages/Login.jsx";
import ProtectedRoute from "./routes/ProtectedRoute.jsx";
import SuperadminPage from "./pages/superadmin/SuperadminPage.jsx";
import AdminLayout from "./pages/admin/AdminLayout.jsx";
import Clockings from "./pages/admin/Clockings.jsx";
import Employees from "./pages/admin/Employees.jsx";
import StoreSetting from "./pages/admin/StoreSetting.jsx";
import Paysheets from "./pages/admin/Paysheets.jsx";
import Dashboard from "./pages/admin/Dashboard.jsx";
import Documents from "./pages/admin/Documents.jsx";
import Logs from "./pages/admin/Logs.jsx";
import Accounts from "./pages/admin/Accounts.jsx";
import Chat from "./pages/client/Chat.jsx";
import EmployeeLayout from "./pages/employee/EmployeeLayout.jsx";
import CheckIn from "./pages/employee/CheckIn.jsx";
import History from "./pages/employee/History.jsx";
import StoreLanding from "./pages/employee/StoreLanding.jsx";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      {/* Quét QR tại cửa hàng — công khai, chỉ ghi nhớ cửa hàng rồi chuyển đăng nhập */}
      <Route path="/s/:storeId" element={<StoreLanding />} />

      <Route
        path="/superadmin"
        element={
          <ProtectedRoute allowedRoles={[ROLE.SUPERADMIN]}>
            <SuperadminPage />
          </ProtectedRoute>
        }
      />

      {/* Giao diện nhân viên: chấm công + lịch sử (kèm chat nổi) */}
      <Route
        path="/work"
        element={
          <ProtectedRoute allowedRoles={[ROLE.USER]}>
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
          <ProtectedRoute allowedRoles={[ROLE.USER, ROLE.ADMIN]}>
            <Chat />
          </ProtectedRoute>
        }
      />

      {/* Trang quản trị của cửa hàng */}
      <Route
        path="/admin"
        element={
          <ProtectedRoute allowedRoles={[ROLE.ADMIN]}>
            <AdminLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/admin/clockings" replace />} />
        <Route path="clockings" element={<Clockings />} />
        <Route path="employees" element={<Employees />} />
        <Route path="paysheets" element={<Paysheets />} />
        <Route path="setting" element={<StoreSetting />} />
        <Route path="ai" element={<Dashboard />} />
        <Route path="logs" element={<Logs />} />
        <Route path="documents" element={<Documents />} />
        <Route path="accounts" element={<Accounts />} />
      </Route>

      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
