// Truy cập bảng account (tài khoản đăng nhập). XOÁ MỀM: mọi truy vấn chỉ lấy
// tài khoản chưa xoá (is_deleted = false); "xoá" = softDeleteById.
import { ROLE } from "../constants/enums.js";

const PUBLIC_COLUMNS = `a.id, a.store_id, a.full_name, a.email, a.role, a.is_active, a.created_at`;

export function createAccountRepository({ db }) {
  return {
    // Dùng khi đăng nhập — kèm password_hash và trạng thái + hạn dùng của cửa hàng
    async findByEmailForLogin(email, executor = db) {
      const r = await executor.query(
        `SELECT a.*, s.is_active AS store_is_active, s.expiry_date AS store_expiry_date
         FROM account a LEFT JOIN store s ON s.id = a.store_id
         WHERE a.email = $1 AND NOT a.is_deleted`,
        [email]
      );
      return r.rows[0] || null;
    },

    // Kiểm tra ở MỌI request (middleware/accountAccess.js): tài khoản còn hoạt
    // động, cửa hàng còn bật và còn hạn
    async findAccessState(id, executor = db) {
      const r = await executor.query(
        `SELECT a.role, a.is_active, s.is_active AS store_is_active, s.expiry_date AS store_expiry_date
         FROM account a LEFT JOIN store s ON s.id = a.store_id
         WHERE a.id = $1 AND NOT a.is_deleted`,
        [id]
      );
      return r.rows[0] || null;
    },

    // Số tài khoản đang hoạt động của cửa hàng (so với gói max_employee_count)
    async countActiveInStore(storeId, executor = db) {
      const r = await executor.query(
        `SELECT COUNT(*)::int AS count FROM account WHERE store_id = $1 AND is_active AND NOT is_deleted`,
        [storeId]
      );
      return r.rows[0].count;
    },

    async existsByEmail(email, executor = db) {
      const r = await executor.query(`SELECT 1 FROM account WHERE email = $1 AND NOT is_deleted`, [email]);
      return r.rowCount > 0;
    },

    async findInStore(id, storeId, executor = db) {
      const r = await executor.query(
        `SELECT ${PUBLIC_COLUMNS} FROM account a WHERE a.id = $1 AND a.store_id = $2 AND NOT a.is_deleted`,
        [id, storeId]
      );
      return r.rows[0] || null;
    },

    async listByStore(storeId, executor = db) {
      const r = await executor.query(
        `SELECT ${PUBLIC_COLUMNS} FROM account a WHERE a.store_id = $1 AND NOT a.is_deleted ORDER BY a.role, a.full_name`,
        [storeId]
      );
      return r.rows;
    },

    async listSuperadmins(executor = db) {
      const r = await executor.query(
        `SELECT ${PUBLIC_COLUMNS} FROM account a WHERE a.role = $1 AND NOT a.is_deleted ORDER BY a.created_at`,
        [ROLE.SUPERADMIN]
      );
      return r.rows;
    },

    async countActiveAdmins(storeId, executor = db) {
      const r = await executor.query(
        `SELECT COUNT(*)::int AS count FROM account WHERE store_id = $1 AND role = $2 AND is_active AND NOT is_deleted`,
        [storeId, ROLE.ADMIN]
      );
      return r.rows[0].count;
    },

    async create({ storeId, fullName, email, passwordHash, role }, executor = db) {
      const r = await executor.query(
        `INSERT INTO account (store_id, full_name, email, password_hash, role)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, store_id, full_name, email, role, is_active, created_at`,
        [storeId, fullName, email, passwordHash, role]
      );
      return r.rows[0];
    },

    // fields: { tên_cột: giá_trị }
    async update(id, fields, executor = db) {
      const cols = Object.keys(fields);
      if (!cols.length) return;
      await executor.query(
        `UPDATE account SET ${cols.map((c, i) => `${c} = $${i + 2}`).join(", ")}, updated_at = now()
         WHERE id = $1`,
        [id, ...cols.map((c) => fields[c])]
      );
    },

    // Tài khoản đã có dữ liệu chấm công hoặc nằm trong bảng lương chưa
    async hasWorkRecords(id, executor = db) {
      const r = await executor.query(
        `SELECT EXISTS (
           SELECT 1 FROM employee e
           WHERE e.account_id = $1
             AND (EXISTS (SELECT 1 FROM clocking c WHERE c.employee_id = e.id AND NOT c.is_deleted)
               OR EXISTS (SELECT 1 FROM paysheet_detail d WHERE d.employee_id = e.id AND NOT d.is_deleted))
         ) AS used`,
        [id]
      );
      return r.rows[0].used;
    },

    // Xoá MỀM tài khoản + hồ sơ nhân viên đi kèm (khoá luôn đăng nhập)
    async softDeleteById(id, executor = db) {
      await executor.query(
        `UPDATE account SET is_deleted = true, deleted_at = now(), is_active = false, updated_at = now()
         WHERE id = $1 AND NOT is_deleted`,
        [id]
      );
      await executor.query(
        `UPDATE employee SET is_deleted = true, deleted_at = now(), updated_at = now()
         WHERE account_id = $1 AND NOT is_deleted`,
        [id]
      );
    },
  };
}
