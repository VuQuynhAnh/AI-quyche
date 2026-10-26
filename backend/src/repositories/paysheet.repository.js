// Truy cập bảng paysheet (bảng lương tháng) và paysheet_detail (lương từng nhân viên).
import { PAYSHEET_STATUS, SETTING_KEY } from "../constants/enums.js";

const PAYSHEET_COLUMNS = `
  p.*,
  creator.full_name   AS created_by_name,
  finalizer.full_name AS finalized_by_name,
  canceller.full_name AS cancelled_by_name`;

const PAYSHEET_JOINS = `
  LEFT JOIN account creator   ON creator.id   = p.created_by_account_id
  LEFT JOIN account finalizer ON finalizer.id = p.finalized_by_account_id
  LEFT JOIN account canceller ON canceller.id = p.cancelled_by_account_id`;

export function createPaysheetRepository({ db }) {
  return {
    async create({ storeId, payMonth, penaltyAmountPerMinute, createdByAccountId }, executor = db) {
      const r = await executor.query(
        `INSERT INTO paysheet (store_id, pay_month, penalty_amount_per_minute, created_by_account_id)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [storeId, payMonth, penaltyAmountPerMinute, createdByAccountId]
      );
      return r.rows[0];
    },

    async findInStore(id, storeId, executor = db) {
      const r = await executor.query(
        `SELECT ${PAYSHEET_COLUMNS} FROM paysheet p ${PAYSHEET_JOINS} WHERE p.id = $1 AND p.store_id = $2`,
        [id, storeId]
      );
      return r.rows[0] || null;
    },

    // Mọi bảng lương của 1 tháng (bảng đang dùng + các bảng đã huỷ), mới nhất trước
    async listByMonth(storeId, payMonth, executor = db) {
      const r = await executor.query(
        `SELECT ${PAYSHEET_COLUMNS} FROM paysheet p ${PAYSHEET_JOINS}
         WHERE p.store_id = $1 AND p.pay_month = $2
         ORDER BY p.created_at DESC`,
        [storeId, payMonth]
      );
      return r.rows;
    },

    // Bảng lương CHƯA HUỶ của tháng (tối đa 1 — đảm bảo bởi unique index)
    async findActiveByMonth(storeId, payMonth, executor = db) {
      const r = await executor.query(
        `SELECT * FROM paysheet WHERE store_id = $1 AND pay_month = $2 AND status <> $3`,
        [storeId, payMonth, PAYSHEET_STATUS.CANCELLED]
      );
      return r.rows[0] || null;
    },

    // Khoá dòng bảng lương trong transaction để các thao tác đồng thời chạy lần lượt
    async lockById(id, executor = db) {
      const r = await executor.query(`SELECT * FROM paysheet WHERE id = $1 FOR UPDATE`, [id]);
      return r.rows[0] || null;
    },

    async updateTotals(id, totals, executor = db) {
      await executor.query(
        `UPDATE paysheet
         SET penalty_amount_per_minute = $2, employee_count = $3, total_worked_minutes = $4,
             total_gross_salary = $5, total_penalty_amount = $6, total_net_salary = $7,
             calculated_at = now(), updated_at = now()
         WHERE id = $1`,
        [
          id, totals.penaltyAmountPerMinute, totals.employeeCount, totals.totalWorkedMinutes,
          totals.totalGrossSalary, totals.totalPenaltyAmount, totals.totalNetSalary,
        ]
      );
    },

    async markFinalized(id, accountId, executor = db) {
      await executor.query(
        `UPDATE paysheet SET status = $2, finalized_at = now(), finalized_by_account_id = $3, updated_at = now()
         WHERE id = $1`,
        [id, PAYSHEET_STATUS.FINALIZED, accountId]
      );
    },

    async markCancelled(id, accountId, reason, executor = db) {
      await executor.query(
        `UPDATE paysheet SET status = $2, cancelled_at = now(), cancelled_by_account_id = $3,
                cancel_reason = $4, updated_at = now()
         WHERE id = $1`,
        [id, PAYSHEET_STATUS.CANCELLED, accountId, reason]
      );
    },

    // ---------- Chi tiết ----------
    // "Tính lại" bảng nháp: xoá MỀM các dòng cũ rồi thêm dòng mới
    async softDeleteDetails(paysheetId, executor = db) {
      await executor.query(
        `UPDATE paysheet_detail SET is_deleted = true, deleted_at = now()
         WHERE paysheet_id = $1 AND NOT is_deleted`,
        [paysheetId]
      );
    },

    async insertDetail(paysheetId, d, executor = db) {
      await executor.query(
        `INSERT INTO paysheet_detail
           (paysheet_id, employee_id, hourly_wage, worked_days, worked_minutes, late_minutes,
            early_leave_minutes, missing_check_out_days, gross_salary, penalty_amount, net_salary, daily_breakdown)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          paysheetId, d.employeeId, d.hourlyWage, d.workedDays, d.workedMinutes, d.lateMinutes,
          d.earlyLeaveMinutes, d.missingCheckOutDays, d.grossSalary, d.penaltyAmount, d.netSalary,
          JSON.stringify(d.dailyBreakdown),
        ]
      );
    },

    async listDetails(paysheetId, executor = db) {
      const r = await executor.query(
        `SELECT d.*, a.full_name, e.job_title
         FROM paysheet_detail d
         JOIN employee e ON e.id = d.employee_id
         JOIN account a ON a.id = e.account_id
         WHERE d.paysheet_id = $1 AND NOT d.is_deleted
         ORDER BY a.full_name`,
        [paysheetId]
      );
      return r.rows;
    },

    async findDetail(paysheetId, employeeId, executor = db) {
      const r = await executor.query(
        `SELECT * FROM paysheet_detail WHERE paysheet_id = $1 AND employee_id = $2 AND NOT is_deleted`,
        [paysheetId, employeeId]
      );
      return r.rows[0] || null;
    },

    // Thời điểm thay đổi gần nhất của lương giờ nhân viên / tiền phạt của cửa hàng
    // (giờ ca đã chụp vào từng ngày công, các thiết lập khác không ảnh hưởng lương)
    async findLatestWageOrSettingChange(storeId, executor = db) {
      const r = await executor.query(
        `SELECT GREATEST(
           (SELECT MAX(e.updated_at) FROM employee e JOIN account a ON a.id = e.account_id WHERE a.store_id = $1),
           (SELECT updated_at FROM store_setting WHERE store_id = $1 AND key = $2)
         ) AS latest`,
        [storeId, SETTING_KEY.PENALTY_AMOUNT_PER_MINUTE]
      );
      return r.rows[0].latest;
    },
  };
}
