// Truy cập bảng clocking (chấm công theo ngày) và clocking_history (từng lần bấm).
import { CLOCKING_HISTORY_STATUS } from "../constants/enums.js";

export function createClockingRepository({ db }) {
  return {
    // Lấy dòng chấm công của (nhân viên, ngày); chưa có thì tạo với giờ ca cho trước.
    // ON CONFLICT: 2 request đồng thời không tạo trùng dòng.
    async findOrCreate({ storeId, employeeId, workDate, shiftStartTime, shiftEndTime }, executor = db) {
      await executor.query(
        `INSERT INTO clocking (store_id, employee_id, work_date, shift_start_time, shift_end_time)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (employee_id, work_date) DO NOTHING`,
        [storeId, employeeId, workDate, shiftStartTime, shiftEndTime]
      );
      const r = await executor.query(
        `SELECT * FROM clocking WHERE employee_id = $1 AND work_date = $2`,
        [employeeId, workDate]
      );
      return r.rows[0];
    },

    // Khoá dòng trong transaction (SELECT ... FOR UPDATE)
    async lockById(id, executor = db) {
      const r = await executor.query(`SELECT * FROM clocking WHERE id = $1 FOR UPDATE`, [id]);
      return r.rows[0] || null;
    },

    async findByEmployeeAndDate(employeeId, workDate, executor = db) {
      const r = await executor.query(
        `SELECT * FROM clocking WHERE employee_id = $1 AND work_date = $2`,
        [employeeId, workDate]
      );
      return r.rows[0] || null;
    },

    async listByStoreAndPeriod({ storeId, firstDate, lastDate }, executor = db) {
      const r = await executor.query(
        `SELECT * FROM clocking WHERE store_id = $1 AND work_date BETWEEN $2 AND $3 ORDER BY work_date`,
        [storeId, firstDate, lastDate]
      );
      return r.rows;
    },

    async listByEmployeeAndPeriod({ employeeId, firstDate, lastDate }, executor = db) {
      const r = await executor.query(
        `SELECT * FROM clocking WHERE employee_id = $1 AND work_date BETWEEN $2 AND $3 ORDER BY work_date`,
        [employeeId, firstDate, lastDate]
      );
      return r.rows;
    },

    async updateSummary(id, summary, executor = db) {
      await executor.query(
        `UPDATE clocking
         SET check_in_time = $2, check_out_time = $3, worked_minutes = $4, late_minutes = $5,
             early_leave_minutes = $6, is_missing_check_out = $7, is_out_of_range = $8, updated_at = now()
         WHERE id = $1`,
        [
          id, summary.checkInTime, summary.checkOutTime, summary.workedMinutes, summary.lateMinutes,
          summary.earlyLeaveMinutes, summary.isMissingCheckOut, summary.isOutOfRange,
        ]
      );
    },

    // Lần sửa chấm công gần nhất của cửa hàng trong kỳ (để biết bảng lương nháp đã cũ chưa)
    async findLatestUpdateInPeriod({ storeId, firstDate, lastDate }, executor = db) {
      const r = await executor.query(
        `SELECT MAX(updated_at) AS latest FROM clocking WHERE store_id = $1 AND work_date BETWEEN $2 AND $3`,
        [storeId, firstDate, lastDate]
      );
      return r.rows[0].latest;
    },

    // ---------- Lịch sử ----------
    async createHistory(
      {
        clockingId, actionType, clockTime, source, latitude, longitude, gpsAccuracyMeters,
        distanceToStoreMeters, isOutOfRange, deviceIdentifier, replacedHistoryId, createdByAccountId,
      },
      executor = db
    ) {
      const r = await executor.query(
        `INSERT INTO clocking_history
           (clocking_id, action_type, clock_time, source, latitude, longitude, gps_accuracy_meters,
            distance_to_store_meters, is_out_of_range, device_identifier, replaced_history_id, created_by_account_id)
         VALUES ($1, $2, COALESCE($3, now()), $4, $5, $6, $7, $8, $9, $10, $11, $12)
         RETURNING *`,
        [
          clockingId, actionType, clockTime ?? null, source, latitude ?? null, longitude ?? null,
          gpsAccuracyMeters ?? null, distanceToStoreMeters ?? null, isOutOfRange ?? false,
          deviceIdentifier ?? null, replacedHistoryId ?? null, createdByAccountId ?? null,
        ]
      );
      return r.rows[0];
    },

    async listHistories(clockingId, { includeVoided = false } = {}, executor = db) {
      const r = await executor.query(
        `SELECT * FROM clocking_history
         WHERE clocking_id = $1 ${includeVoided ? "" : "AND status = $2"}
         ORDER BY clock_time, created_at`,
        includeVoided ? [clockingId] : [clockingId, CLOCKING_HISTORY_STATUS.VALID]
      );
      return r.rows;
    },

    async voidHistory(id, executor = db) {
      await executor.query(`UPDATE clocking_history SET status = $2 WHERE id = $1`, [
        id,
        CLOCKING_HISTORY_STATUS.VOIDED,
      ]);
    },
  };
}
