// Truy cập bảng account (tài khoản đăng nhập).
import { ROLE } from "../constants/enums.js";

const PUBLIC_COLUMNS = `a.id, a.store_id, a.full_name, a.email, a.role, a.is_active, a.created_at`;

export function createAccountRepository({ db }) {
  return {
    // Dùng khi đăng nhập — kèm password_hash và trạng thái cửa hàng
    async findByEmailForLogin(email, executor = db) {
      const r = await executor.query(
        `SELECT a.*, s.is_active AS store_is_active
         FROM account a LEFT JOIN store s ON s.id = a.store_id
         WHERE a.email = $1`,
        [email]
      );
      return r.rows[0] || null;
    },

    async existsByEmail(email, executor = db) {
      const r = await executor.query(`SELECT 1 FROM account WHERE email = $1`, [email]);
      return r.rowCount > 0;
    },

    async findInStore(id, storeId, executor = db) {
      const r = await executor.query(
        `SELECT ${PUBLIC_COLUMNS} FROM account a WHERE a.id = $1 AND a.store_id = $2`,
        [id, storeId]
      );
      return r.rows[0] || null;
    },

    async listByStore(storeId, executor = db) {
      const r = await executor.query(
        `SELECT ${PUBLIC_COLUMNS} FROM account a WHERE a.store_id = $1 ORDER BY a.role, a.full_name`,
        [storeId]
      );
      return r.rows;
    },

    async listSuperadmins(executor = db) {
      const r = await executor.query(
        `SELECT ${PUBLIC_COLUMNS} FROM account a WHERE a.role = $1 ORDER BY a.created_at`,
        [ROLE.SUPERADMIN]
      );
      return r.rows;
    },

    async countActiveAdmins(storeId, executor = db) {
      const r = await executor.query(
        `SELECT COUNT(*)::int AS count FROM account WHERE store_id = $1 AND role = $2 AND is_active`,
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
             AND (EXISTS (SELECT 1 FROM clocking c WHERE c.employee_id = e.id)
               OR EXISTS (SELECT 1 FROM paysheet_detail d WHERE d.employee_id = e.id))
         ) AS used`,
        [id]
      );
      return r.rows[0].used;
    },

    async deleteById(id, executor = db) {
      await executor.query(`DELETE FROM account WHERE id = $1`, [id]);
    },
  };
}
