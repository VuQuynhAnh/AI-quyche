// Tài khoản mẫu do `npm run db:reset` (backend/src/db/seed.js) tạo ra — hiện
// ở màn đăng nhập để bấm chọn nhanh khi phát triển/demo. Sửa seed thì sửa cả ở đây.
// Ẩn danh sách này khi deploy thật: đặt VITE_HIDE_DEMO_ACCOUNTS=true lúc build.
import { ROLE } from "./enums.js";

export const SHOW_DEMO_ACCOUNTS = import.meta.env.VITE_HIDE_DEMO_ACCOUNTS !== "true";

export const DEMO_ACCOUNT_GROUPS = [
  {
    title: "Hệ thống",
    accounts: [
      { role: ROLE.SUPERADMIN, fullName: "Quản trị hệ thống", email: "superadmin@smartclocking.vn", password: "Super@123" },
    ],
  },
  {
    title: "Cửa hàng Hoàn Kiếm",
    accounts: [
      { role: ROLE.ADMIN, fullName: "Đỗ Thu Hà", email: "admin.hoankiem@smartclocking.vn", password: "Admin@123" },
      { role: ROLE.USER, fullName: "Nhân viên Demo", email: "nhanvien@smartclocking.vn", password: "NhanVien@123" },
      { role: ROLE.USER, fullName: "Nguyễn Thị Lan", email: "lan@smartclocking.vn", password: "NhanVien@123" },
      { role: ROLE.USER, fullName: "Trần Văn Hùng", email: "hung@smartclocking.vn", password: "NhanVien@123" },
    ],
  },
  {
    title: "Cửa hàng Cầu Giấy",
    accounts: [
      { role: ROLE.ADMIN, fullName: "Vũ Minh Quân", email: "admin.caugiay@smartclocking.vn", password: "Admin@123" },
      { role: ROLE.USER, fullName: "Lê Thị Mai", email: "mai@smartclocking.vn", password: "NhanVien@123" },
      { role: ROLE.USER, fullName: "Phạm Minh Tuấn", email: "tuan@smartclocking.vn", password: "NhanVien@123" },
    ],
  },
];
