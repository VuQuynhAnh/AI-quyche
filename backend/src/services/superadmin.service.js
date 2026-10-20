// SUPERADMIN: tạo/sửa cửa hàng (kèm admin đầu tiên + thiết lập mặc định) và
// quản lý tài khoản superadmin. KHÔNG quản lý admin/user của cửa hàng — việc
// đó do chính cửa hàng tự làm (employee.service.js).
import { ROLE } from "../constants/enums.js";
import { AppError } from "../utils/AppError.js";
import { assertPassword, assertUuid, normalizeEmail, optionalText, requiredText } from "../utils/validators.js";
import { serializeAccount, serializeStore } from "./serializers.js";
import { storeLockReason, vnToday } from "./storePlan.service.js";

const EXPIRING_SOON_DAYS = 30;
const PHONE_RE = /^[0-9+][0-9 .-]{7,19}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Số điện thoại chủ cửa hàng (bắt buộc khi tạo — dùng để chăm sóc khách hàng)
function parseOwnerPhone(value) {
  const phone = requiredText(value, "Thiếu số điện thoại chủ cửa hàng.", 30);
  if (!PHONE_RE.test(phone)) throw AppError.badRequest("Số điện thoại chủ cửa hàng không hợp lệ.");
  return phone;
}

// "" / null -> không giới hạn
function parseMaxEmployeeCount(value) {
  if (value === "" || value == null) return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 100000) {
    throw AppError.badRequest("Số nhân viên tối đa phải là số nguyên dương.");
  }
  return n;
}

// "" / null -> không thời hạn
function parseExpiryDate(value) {
  if (value === "" || value == null) return null;
  if (!DATE_RE.test(value) || Number.isNaN(Date.parse(value))) {
    throw AppError.badRequest("Ngày hết hạn không hợp lệ.");
  }
  return value;
}

// active | expiring (hết hạn trong 30 ngày tới) | expired | inactive
function planStatus(s, today = vnToday()) {
  if (!s.is_active) return "inactive";
  if (storeLockReason({ isActive: true, expiryDate: s.expiry_date })) return "expired";
  if (s.expiry_date) {
    const daysLeft = (Date.parse(s.expiry_date) - Date.parse(today)) / 86400000;
    if (daysLeft <= EXPIRING_SOON_DAYS) return "expiring";
  }
  return "active";
}

export function createSuperadminService({
  transaction,
  storeRepository,
  accountRepository,
  employeeRepository,
  passwordHasher,
}) {
  async function parseNewAccount({ fullName, email, password } = {}) {
    const account = {
      fullName: requiredText(fullName, "Thiếu họ tên."),
      email: normalizeEmail(email),
    };
    assertPassword(password);
    if (await accountRepository.existsByEmail(account.email)) throw AppError.conflict("Email đã được sử dụng.");
    return { ...account, passwordHash: await passwordHasher.hash(password) };
  }

  async function listStores() {
    const rows = await storeRepository.listWithAccountCounts();
    const stores = rows.map((s) => ({
      ...serializeStore(s),
      adminCount: s.admin_count,
      userCount: s.user_count,
      activeAccountCount: s.active_account_count, // so với maxEmployeeCount
      planStatus: planStatus(s),
    }));
    const count = (st) => stores.filter((s) => s.planStatus === st).length;
    return {
      stores,
      stats: {
        total: stores.length,
        active: count("active") + count("expiring"),
        expiring: count("expiring"),
        expired: count("expired"),
        inactive: count("inactive"),
        expiringSoonDays: EXPIRING_SOON_DAYS,
      },
    };
  }

  // Tạo cửa hàng + thiết lập mặc định + tài khoản admin đầu tiên (kèm hồ sơ nhân viên)
  async function createStore(actor, { name, address, ownerPhoneNumber, maxEmployeeCount, expiryDate, admin } = {}) {
    const storeName = requiredText(name, "Thiếu tên cửa hàng.");
    const plan = {
      ownerPhoneNumber: parseOwnerPhone(ownerPhoneNumber),
      maxEmployeeCount: parseMaxEmployeeCount(maxEmployeeCount),
      expiryDate: parseExpiryDate(expiryDate),
    };
    const firstAdmin = await parseNewAccount(admin);

    const store = await transaction.run(async (tx) => {
      const created = await storeRepository.create(
        { name: storeName, address: optionalText(address, 500), ...plan, createdByAccountId: actor.id },
        tx
      );
      await storeRepository.createSetting(created.id, {}, tx);
      const account = await accountRepository.create({ ...firstAdmin, storeId: created.id, role: ROLE.ADMIN }, tx);
      await employeeRepository.create({ accountId: account.id, phoneNumber: null, jobTitle: "Quản lý cửa hàng", hourlyWage: 0 }, tx);
      return created;
    });
    return { store: serializeStore(store) };
  }

  async function updateStore(storeId, body = {}) {
    assertUuid(storeId);
    const { name, address, ownerPhoneNumber, maxEmployeeCount, expiryDate, isActive } = body;
    const fields = {};
    if (name !== undefined) fields.name = requiredText(name, "Thiếu tên cửa hàng.");
    if (address !== undefined) fields.address = optionalText(address, 500);
    if (ownerPhoneNumber !== undefined) fields.owner_phone_number = parseOwnerPhone(ownerPhoneNumber);
    // Hạ số tối đa xuống dưới số đang dùng vẫn cho phép: tài khoản hiện có giữ
    // nguyên, chỉ chặn tạo / mở lại thêm cho tới khi xuống dưới giới hạn.
    if (maxEmployeeCount !== undefined) fields.max_employee_count = parseMaxEmployeeCount(maxEmployeeCount);
    if (expiryDate !== undefined) fields.expiry_date = parseExpiryDate(expiryDate);
    if (isActive !== undefined) fields.is_active = Boolean(isActive);
    if (!Object.keys(fields).length) throw AppError.badRequest("Không có thay đổi.");

    const store = await storeRepository.update(storeId, fields);
    if (!store) throw AppError.notFound("Không tìm thấy cửa hàng.");
    return { store: serializeStore(store) };
  }

  async function listSuperadmins() {
    return { accounts: (await accountRepository.listSuperadmins()).map(serializeAccount) };
  }

  // Chỉ superadmin mới tạo được superadmin
  async function createSuperadmin(body) {
    const account = await accountRepository.create({ ...(await parseNewAccount(body)), storeId: null, role: ROLE.SUPERADMIN });
    return { account: serializeAccount(account) };
  }

  return { listStores, createStore, updateStore, listSuperadmins, createSuperadmin };
}
