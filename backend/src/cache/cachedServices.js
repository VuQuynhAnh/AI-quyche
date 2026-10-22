// Gắn Redis cache vào các API ĐỌC DỮ LIỆU LỚN, ÍT THAY ĐỔI, theo kiểu "bọc"
// (decorator): service gốc giữ nguyên, file này trả về service cùng các method,
// chỉ thay vài method đọc bằng bản có cache, và các method ghi thì bỏ cache
// của cửa hàng sau khi ghi xong. Lắp ráp ở container.js.
//
//  API                                  Cache khi                        TTL
//  GET /api/hr/paysheets?month=         bảng lương tháng ĐÃ CHỐT         1 giờ
//  GET /api/hr/paysheets/:id/export     luôn (file CSV dựng từ chi tiết  1 giờ
//                                       đã lưu, chỉ đổi khi tính lại)
//  GET /api/hr/clockings/overview       mọi tháng trong khoảng đã chốt   1 giờ
//  GET /api/admin/stats(/top-topics)    luôn (đếm/gom nhóm toàn bộ chat) 5 phút
//
// Chỉ cache dữ liệu đã đóng băng nên không cần bỏ cache mỗi lần chấm công
// (chấm công / sửa giờ bị chặn ở tháng đã chốt). Các thao tác làm đổi dữ liệu
// đã cache thì gọi invalidateStore:
//  - bảng lương: tạo / tính lại / chốt / huỷ (huỷ = mở khoá chấm công tháng đó)
//  - nhân viên: thêm / sửa / xoá / đổi ảnh (bảng công & bảng lương hiện tên,
//    chức danh lấy từ hồ sơ nhân viên HIỆN TẠI)
// Số liệu dashboard không bỏ cache theo thao tác — chấp nhận trễ tối đa 5 phút.
import { PAYSHEET_STATUS } from "../constants/enums.js";

const FROZEN_TTL_SECONDS = 60 * 60;
const DASHBOARD_TTL_SECONDS = 5 * 60;

const param = (v) => (v == null ? "" : String(v));

// Bọc các method ghi: chạy xong (đã commit) thì bỏ cache cửa hàng của actor
function invalidateAfter(service, methodNames, cache) {
  const wrapped = {};
  for (const name of methodNames) {
    wrapped[name] = async (actor, ...args) => {
      const result = await service[name](actor, ...args);
      await cache.invalidateStore(actor.storeId);
      return result;
    };
  }
  return wrapped;
}

export function withPaysheetCache(paysheetService, cache) {
  return {
    ...paysheetService,
    ...invalidateAfter(paysheetService, ["create", "recalculate", "finalize", "cancel"], cache),

    getMonth: (actor, month) =>
      cache.remember(
        {
          storeId: actor.storeId,
          name: `paysheet-month:${param(month)}`,
          ttlSeconds: FROZEN_TTL_SECONDS,
          // Bảng nháp có cờ "cần tính lại" phụ thuộc chấm công mới nhất -> không cache
          cacheIf: (r) => r.paysheet?.status === PAYSHEET_STATUS.FINALIZED,
        },
        () => paysheetService.getMonth(actor, month)
      ),

    exportCsv: (actor, id) =>
      cache.remember(
        { storeId: actor.storeId, name: `paysheet-csv:${param(id)}`, ttlSeconds: FROZEN_TTL_SECONDS },
        () => paysheetService.exportCsv(actor, id)
      ),
  };
}

export function withClockingManagementCache(clockingManagementService, cache) {
  return {
    ...clockingManagementService,

    getOverview: (actor, query = {}) =>
      cache.remember(
        {
          storeId: actor.storeId,
          name: `clocking-overview:${param(query.month)}:${param(query.from)}:${param(query.to)}`,
          ttlSeconds: FROZEN_TTL_SECONDS,
          // Chỉ cache khi MỌI tháng trong khoảng ngày đã chốt lương (không sửa được nữa)
          cacheIf: (r) => r.lockedMonths.length === new Set(r.dates.map((d) => d.slice(0, 7))).size,
        },
        () => clockingManagementService.getOverview(actor, query)
      ),
  };
}

export function withEmployeeCache(employeeService, cache) {
  return {
    ...employeeService,
    ...invalidateAfter(employeeService, ["create", "update", "remove", "setAvatar", "removeAvatar"], cache),
  };
}

export function withDashboardCache(dashboardService, cache) {
  return {
    ...dashboardService,

    getStats: (actor) =>
      cache.remember(
        { storeId: actor.storeId, name: "dashboard-stats", ttlSeconds: DASHBOARD_TTL_SECONDS },
        () => dashboardService.getStats(actor)
      ),

    getTopTopics: (actor, limit) =>
      cache.remember(
        { storeId: actor.storeId, name: `dashboard-top-topics:${param(limit)}`, ttlSeconds: DASHBOARD_TTL_SECONDS },
        () => dashboardService.getTopTopics(actor, limit)
      ),
  };
}
