// Repository GIẢ trong bộ nhớ để test service mà không cần PostgreSQL. Mỗi
// fake chỉ cài đúng các method mà service đang gọi, cùng chữ ký (tham số cuối
// là executor/tx — bị bỏ qua). Dữ liệu dùng snake_case giống dòng DB thật.
import { CLOCKING_HISTORY_STATUS } from "../src/constants/enums.js";

export const STORE_ID = "11111111-1111-4111-8111-111111111111";
export const OTHER_STORE_ID = "22222222-2222-4222-8222-222222222222";

// Vị trí cửa hàng mẫu (Hồ Hoàn Kiếm) — dùng để tính khoảng cách GPS
export const STORE_LAT = 21.0285;
export const STORE_LNG = 105.8542;

// Thiết lập cửa hàng đã đổi sang kiểu thật (giống storeRepository.findSetting)
export function makeSetting(overrides = {}) {
  return {
    shift_start_time: "08:00",
    shift_end_time: "17:00",
    penalty_amount_per_minute: 1000,
    latitude: STORE_LAT,
    longitude: STORE_LNG,
    check_in_radius_meters: 100,
    check_in_radius_enforced: false,
    wifi_clocking_enabled: false,
    wifi_max_distance_meters: 200,
    ...overrides,
  };
}

// Transaction giả: chạy luôn hàm công việc với 1 đối tượng tx giả
export const fakeTransaction = { run: (work) => work({ isFakeTx: true }) };

export function createFakeStoreRepository({ stores = {}, settings = {} } = {}) {
  return {
    async findById(id) {
      return stores[id] ?? null;
    },
    async findSetting(storeId) {
      return settings[storeId] ?? null;
    },
  };
}

export function createFakeEmployeeRepository({ employees = [] } = {}) {
  return {
    async findByAccountId(accountId) {
      return employees.find((e) => e.account_id === accountId) ?? null;
    },
  };
}

// Bảng clocking + clocking_history trong bộ nhớ
export function createFakeClockingRepository() {
  const clockings = [];
  const histories = [];
  let seq = 0;

  return {
    clockings,
    histories,
    async findOrCreate({ storeId, employeeId, workDate, shiftStartTime, shiftEndTime }) {
      let row = clockings.find((c) => c.employee_id === employeeId && c.work_date === workDate);
      if (!row) {
        row = {
          id: `clocking-${++seq}`,
          store_id: storeId,
          employee_id: employeeId,
          work_date: workDate,
          shift_start_time: shiftStartTime,
          shift_end_time: shiftEndTime,
        };
        clockings.push(row);
      }
      return row;
    },
    async lockById(id) {
      return clockings.find((c) => c.id === id) ?? null;
    },
    async findByEmployeeAndDate(employeeId, workDate) {
      return clockings.find((c) => c.employee_id === employeeId && c.work_date === workDate) ?? null;
    },
    async listHistories(clockingId, { includeVoided = false } = {}) {
      return histories
        .filter((h) => h.clocking_id === clockingId && (includeVoided || h.status === CLOCKING_HISTORY_STATUS.VALID))
        .sort((a, b) => new Date(a.clock_time) - new Date(b.clock_time));
    },
    async createHistory(data) {
      const row = {
        id: `history-${++seq}`,
        clocking_id: data.clockingId,
        action_type: data.actionType,
        // Giống COALESCE($3, now()) trong SQL: không truyền giờ thì lấy giờ hiện tại
        clock_time: data.clockTime ?? new Date(),
        source: data.source,
        latitude: data.latitude ?? null,
        longitude: data.longitude ?? null,
        gps_accuracy_meters: data.gpsAccuracyMeters ?? null,
        distance_to_store_meters: data.distanceToStoreMeters ?? null,
        is_out_of_range: data.isOutOfRange ?? false,
        device_identifier: data.deviceIdentifier ?? null,
        method: data.method ?? null,
        client_ip: data.clientIp ?? null,
        status: CLOCKING_HISTORY_STATUS.VALID,
        replaced_history_id: data.replacedHistoryId ?? null,
        created_by_account_id: data.createdByAccountId ?? null,
        created_at: new Date(),
      };
      histories.push(row);
      return row;
    },
    async updateSummary(id, summary) {
      Object.assign(clockings.find((c) => c.id === id), { summary });
    },
  };
}

export function createFakePaysheetRepository({ activeByMonth = {} } = {}) {
  return {
    // activeByMonth: { "<storeId>|YYYY-MM": { status } }
    async findActiveByMonth(storeId, monthKey) {
      return activeByMonth[`${storeId}|${monthKey}`] ?? null;
    },
  };
}

export function createFakeStoreNetworkService({ storeIps = {} } = {}) {
  return {
    async isOnStoreNetwork(storeId, ip) {
      return storeIps[storeId] != null && storeIps[storeId] === ip;
    },
  };
}
