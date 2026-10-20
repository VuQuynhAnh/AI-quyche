// Truy cập bảng employee (hồ sơ nhân viên, 1–1 với account thuộc cửa hàng).
import { ROLE } from "../constants/enums.js";

const EMPLOYEE_COLUMNS = `
  e.id, e.account_id, e.phone_number, e.job_title, e.hourly_wage, e.created_at, e.updated_at,
  a.store_id, a.full_name, a.email, a.role, a.is_active`;

export function createEmployeeRepository({ db }) {
  return {
    async create({ accountId, phoneNumber, jobTitle, hourlyWage }, executor = db) {
      const r = await executor.query(
        `INSERT INTO employee (account_id, phone_number, job_title, hourly_wage)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [accountId, phoneNumber, jobTitle, hourlyWage]
      );
      return r.rows[0];
    },

    async findByAccountId(accountId, executor = db) {
      const r = await executor.query(
        `SELECT ${EMPLOYEE_COLUMNS} FROM employee e JOIN account a ON a.id = e.account_id
         WHERE e.account_id = $1`,
        [accountId]
      );
      return r.rows[0] || null;
    },

    async findInStore(id, storeId, executor = db) {
      const r = await executor.query(
        `SELECT ${EMPLOYEE_COLUMNS} FROM employee e JOIN account a ON a.id = e.account_id
         WHERE e.id = $1 AND a.store_id = $2`,
        [id, storeId]
      );
      return r.rows[0] || null;
    },

    // Nhân viên (role user) của cửa hàng
    async listUsersInStore(storeId, executor = db) {
      const r = await executor.query(
        `SELECT ${EMPLOYEE_COLUMNS} FROM employee e JOIN account a ON a.id = e.account_id
         WHERE a.store_id = $1 AND a.role = $2
         ORDER BY a.is_active DESC, a.full_name`,
        [storeId, ROLE.USER]
      );
      return r.rows;
    },

    // Người cần có trong bảng công / bảng lương của kỳ [firstDate, lastDate]:
    // nhân viên (role user) đang làm việc + bất kỳ ai đã có công trong kỳ
    async listForPeriod({ storeId, firstDate, lastDate }, executor = db) {
      const r = await executor.query(
        `SELECT ${EMPLOYEE_COLUMNS} FROM employee e JOIN account a ON a.id = e.account_id
         WHERE a.store_id = $1
           AND ((a.role = $2 AND a.is_active) OR EXISTS (
             SELECT 1 FROM clocking c
             WHERE c.employee_id = e.id AND c.work_date BETWEEN $3 AND $4))
         ORDER BY a.full_name`,
        [storeId, ROLE.USER, firstDate, lastDate]
      );
      return r.rows;
    },

    // fields: { tên_cột: giá_trị }
    async update(id, fields, executor = db) {
      const cols = Object.keys(fields);
      if (!cols.length) return;
      await executor.query(
        `UPDATE employee SET ${cols.map((c, i) => `${c} = $${i + 2}`).join(", ")}, updated_at = now()
         WHERE id = $1`,
        [id, ...cols.map((c) => fields[c])]
      );
    },
  };
}
