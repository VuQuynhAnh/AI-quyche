// SUPERADMIN: tạo/sửa cửa hàng (kèm admin đầu tiên + thiết lập mặc định) và
// quản lý tài khoản superadmin. KHÔNG quản lý admin/user của cửa hàng — việc
// đó do chính cửa hàng tự làm (storeAccount.service.js).
import { ROLE } from "../constants/enums.js";
import { AppError } from "../utils/AppError.js";
import { assertPassword, assertUuid, normalizeEmail, optionalText, requiredText } from "../utils/validators.js";
import { serializeAccount, serializeStore } from "./serializers.js";

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
    return {
      stores: rows.map((s) => ({ ...serializeStore(s), adminCount: s.admin_count, userCount: s.user_count })),
    };
  }

  // Tạo cửa hàng + thiết lập mặc định + tài khoản admin đầu tiên (kèm hồ sơ nhân viên)
  async function createStore(actor, { name, address, admin } = {}) {
    const storeName = requiredText(name, "Thiếu tên cửa hàng.");
    const firstAdmin = await parseNewAccount(admin);

    const store = await transaction.run(async (tx) => {
      const created = await storeRepository.create(
        { name: storeName, address: optionalText(address, 500), createdByAccountId: actor.id },
        tx
      );
      await storeRepository.createSetting(created.id, {}, tx);
      const account = await accountRepository.create({ ...firstAdmin, storeId: created.id, role: ROLE.ADMIN }, tx);
      await employeeRepository.create({ accountId: account.id, phoneNumber: null, jobTitle: "Quản lý cửa hàng", hourlyWage: 0 }, tx);
      return created;
    });
    return { store: serializeStore(store) };
  }

  async function updateStore(storeId, { name, address, isActive } = {}) {
    assertUuid(storeId);
    const fields = {};
    if (name !== undefined) fields.name = requiredText(name, "Thiếu tên cửa hàng.");
    if (address !== undefined) fields.address = optionalText(address, 500);
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
