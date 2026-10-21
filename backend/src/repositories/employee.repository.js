// Truy cập bảng employee (hồ sơ nhân viên, 1–1 với account thuộc cửa hàng).

const EMPLOYEE_COLUMNS = `
  e.id, e.account_id, e.phone_number, e.job_title, e.hourly_wage, e.start_work_date, e.avatar_path, e.created_at, e.updated_at,
  a.store_id, a.full_name, a.email, a.role, a.is_active`;

export function createEmployeeRepository({ db }) {
  return {
    // startWorkDate: 'YYYY-MM-DD'; null/undefined -> mặc định hôm nay (giờ VN)
    async create({ accountId, phoneNumber, jobTitle, hourlyWage, startWorkDate }, executor = db) {
      const r = await executor.query(
        `INSERT INTO employee (account_id, phone_number, job_title, hourly_wage, start_work_date)
         VALUES ($1, $2, $3, $4, COALESCE($5::date, (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date)) RETURNING id`,
        [accountId, phoneNumber, jobTitle, hourlyWage, startWorkDate ?? null]
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

    // Mọi người của cửa hàng (admin + nhân viên) — màn "Nhân viên" của admin
    async listInStore(storeId, executor = db) {
      const r = await executor.query(
        `SELECT ${EMPLOYEE_COLUMNS} FROM employee e JOIN account a ON a.id = e.account_id
         WHERE a.store_id = $1
         ORDER BY a.is_active DESC, a.role, a.full_name`,
        [storeId]
      );
      return r.rows;
    },

    // Người cần có trong bảng công / bảng lương của kỳ [firstDate, lastDate]:
    // mọi người của cửa hàng đang làm việc (admin cũng chấm công, nhận lương
    // như nhân viên) + bất kỳ ai đã có công trong kỳ (kể cả đã nghỉ)
    async listForPeriod({ storeId, firstDate, lastDate }, executor = db) {
      const r = await executor.query(
        `SELECT ${EMPLOYEE_COLUMNS} FROM employee e JOIN account a ON a.id = e.account_id
         WHERE a.store_id = $1
           AND (a.is_active OR EXISTS (
             SELECT 1 FROM clocking c
             WHERE c.employee_id = e.id AND c.work_date BETWEEN $2 AND $3))
         ORDER BY a.full_name`,
        [storeId, firstDate, lastDate]
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
