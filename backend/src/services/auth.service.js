// XÁC THỰC: đăng nhập (cấp JWT). Không có đăng ký công khai — tài khoản do
// superadmin (superadmin, admin đầu tiên của cửa hàng) hoặc admin cửa hàng tạo.
import { ROLE } from "../constants/enums.js";
import { AppError } from "../utils/AppError.js";

export function createAuthService({ accountRepository, passwordHasher, tokenService }) {
  async function login({ email, password } = {}) {
    if (!email || !password) throw AppError.badRequest("Thiếu email hoặc mật khẩu.");

    const account = await accountRepository.findByEmailForLogin(String(email).trim().toLowerCase());
    if (!account || !(await passwordHasher.compare(password, account.password_hash))) {
      throw AppError.unauthorized("Email hoặc mật khẩu không đúng.");
    }
    if (!account.is_active) {
      throw AppError.forbidden("Tài khoản đã bị vô hiệu hoá. Liên hệ quản trị viên.");
    }
    if (account.role !== ROLE.SUPERADMIN && !account.store_is_active) {
      throw AppError.forbidden("Cửa hàng của bạn đang tạm ngưng hoạt động.");
    }

    const user = {
      id: account.id,
      fullName: account.full_name,
      email: account.email,
      role: account.role,
      storeId: account.store_id,
    };
    return { token: tokenService.sign(user), user };
  }

  return { login };
}
