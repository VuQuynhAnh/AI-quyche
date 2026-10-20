// Băm / so khớp mật khẩu — bọc bcrypt thành 1 object để inject vào service
// (dễ thay thuật toán hoặc thay bằng bản giả khi viết test).
import bcrypt from "bcryptjs";

export function createPasswordHasher({ rounds = 10 } = {}) {
  return {
    hash: (plain) => bcrypt.hash(String(plain), rounds),
    compare: (plain, hash) => bcrypt.compare(plain, hash),
  };
}
