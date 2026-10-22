// XÁC THỰC: đăng nhập (cấp JWT). Không có đăng ký công khai — tài khoản do
// superadmin (superadmin, admin đầu tiên của cửa hàng) hoặc admin cửa hàng tạo.
import { ROLE } from "../constants/enums.js";
import { AppError } from "../utils/AppError.js";
import { assertStoreUsable } from "./storePlan.service.js";

export function createAuthService({ accountRepository, passwordHasher, tokenService, storeNetworkService }) {
  // ip: IP công cộng lúc đăng nhập — admin cửa hàng thì ghi làm Wi-Fi cửa hàng
  async function login({ email, password } = {}, { ip } = {}) {
    if (!email || !password) throw AppError.badRequest("Thiếu email hoặc mật khẩu.");

    const account = await accountRepository.findByEmailForLogin(String(email).trim().toLowerCase());
    if (!account || !(await passwordHasher.compare(password, account.password_hash))) {
      throw AppError.unauthorized("Email hoặc mật khẩu không đúng.");
    }
    if (!account.is_active) {
      throw AppError.forbidden("Tài khoản đã bị vô hiệu hoá. Liên hệ quản trị viên.");
    }
    // Cửa hàng bị tạm ngưng hoặc đã hết hạn -> không đăng nhập được
    if (account.role !== ROLE.SUPERADMIN) {
      assertStoreUsable({ isActive: account.store_is_active, expiryDate: account.store_expiry_date });
    }

    const user = {
      id: account.id,
      fullName: account.full_name,
      email: account.email,
      role: account.role,
      storeId: account.store_id,
    };
    await storeNetworkService.recordAdminLogin(user, ip);
    return { token: tokenService.sign(user), user };
  }

  return { login };
}
