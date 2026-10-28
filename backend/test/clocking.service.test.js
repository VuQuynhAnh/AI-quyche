// Nhân viên tự chấm công (QR / Wi-Fi + GPS). Dùng timesheet.service THẬT với
// repository giả, để test đi qua đúng luồng khoá ngày, khoá tháng và tổng hợp công.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CLOCKING_ACTION, CLOCKING_METHOD, CLOCKING_SOURCE, PAYSHEET_STATUS } from "../src/constants/enums.js";
import { createClockingService } from "../src/services/clocking.service.js";
import { createTimesheetService } from "../src/services/timesheet.service.js";
import { AppError } from "../src/utils/AppError.js";
import { vnDateKey, vnMonthKey } from "../src/utils/vnTime.js";
import {
  OTHER_STORE_ID,
  STORE_ID,
  STORE_LAT,
  STORE_LNG,
  createFakeClockingRepository,
  createFakeEmployeeRepository,
  createFakePaysheetRepository,
  createFakeStoreNetworkService,
  createFakeStoreRepository,
  fakeTransaction,
  makeSetting,
} from "../test-support/fakes.js";

const STORE_IP = "203.0.113.5";
const METERS_PER_DEGREE_LAT = 111195; // gần đúng, đủ cho khoảng cách vài trăm mét
const north = (meters) => STORE_LAT + meters / METERS_PER_DEGREE_LAT;

const USER = { id: "account-1", storeId: STORE_ID };

function setup({ setting = {}, employee = {}, store = {}, paysheetStatus = null } = {}) {
  const clockingRepository = createFakeClockingRepository();
  const storeRepository = createFakeStoreRepository({
    stores: {
      [STORE_ID]: { id: STORE_ID, name: "Cửa hàng A", address: "1 Hàng Bài", is_active: true, ...store },
      [OTHER_STORE_ID]: { id: OTHER_STORE_ID, name: "Cửa hàng B", is_active: true },
    },
    settings: { [STORE_ID]: makeSetting(setting) },
  });
  const paysheetRepository = createFakePaysheetRepository({
    activeByMonth: paysheetStatus ? { [`${STORE_ID}|${vnMonthKey(new Date())}`]: { status: paysheetStatus } } : {},
  });
  const employeeRepository = createFakeEmployeeRepository({
    employees: [{ id: "employee-1", account_id: USER.id, store_id: STORE_ID, is_active: true, ...employee }],
  });
  const timesheetService = createTimesheetService({ storeRepository, clockingRepository, paysheetRepository });
  const service = createClockingService({
    transaction: fakeTransaction,
    storeRepository,
    employeeRepository,
    clockingRepository,
    timesheetService,
    paysheetService: {},
    storeNetworkService: createFakeStoreNetworkService({ storeIps: { [STORE_ID]: STORE_IP } }),
  });
  return { service, clockingRepository };
}

// Body hợp lệ khi quét QR đứng ngay tại cửa hàng
const qrBody = (overrides = {}) => ({
  storeId: STORE_ID,
  latitude: STORE_LAT,
  longitude: STORE_LNG,
  accuracy: 10,
  ...overrides,
});
const wifiBody = (overrides = {}) => qrBody({ method: CLOCKING_METHOD.WIFI, storeId: undefined, ...overrides });

const rejectsWith = (promise, { status, message, code }) =>
  assert.rejects(promise, (err) => {
    assert.ok(err instanceof AppError, `cần AppError, nhận ${err}`);
    assert.equal(err.status, status);
    if (message) assert.match(err.message, message);
    if (code) assert.equal(err.code, code);
    return true;
  });

// Đặt sẵn 1 lần chấm cách đây `secondsAgo` giây trong ngày hôm nay
async function seedHistory(clockingRepository, actionType, secondsAgo) {
  const clocking = await clockingRepository.findOrCreate({
    storeId: STORE_ID,
    employeeId: "employee-1",
    workDate: vnDateKey(new Date()),
    shiftStartTime: "08:00",
    shiftEndTime: "17:00",
  });
  await clockingRepository.createHistory({
    clockingId: clocking.id,
    actionType,
    clockTime: new Date(Date.now() - secondsAgo * 1000),
    source: CLOCKING_SOURCE.EMPLOYEE,
  });
}

describe("chấm công QR — điều kiện bắt buộc", () => {
  it("thiếu GPS hoặc toạ độ sai thì không cho chấm (CLK-BR-003)", async () => {
    const { service } = setup();
    for (const gps of [{ latitude: undefined }, { longitude: null }, { latitude: "abc" }, { latitude: 91 }, { longitude: -181 }]) {
      await rejectsWith(service.check(USER, qrBody(gps)), { status: 400, message: /bật định vị/ });
    }
  });

  it("chấm bằng QR mà không gửi mã cửa hàng thì yêu cầu quét QR (CLK-BR-004)", async () => {
    const { service } = setup();
    await rejectsWith(service.check(USER, qrBody({ storeId: undefined })), { status: 400, message: /quét QR/ });
  });

  it("QR của cửa hàng khác thì bị từ chối (CLK-BR-004)", async () => {
    const { service } = setup();
    await rejectsWith(service.check(USER, qrBody({ storeId: OTHER_STORE_ID })), {
      status: 403,
      message: /không phải cửa hàng của bạn/,
    });
  });

  it("tài khoản bị vô hiệu hoá hoặc cửa hàng tạm ngưng thì không chấm được (CLK-BR-011)", async () => {
    await rejectsWith(setup({ employee: { is_active: false } }).service.check(USER, qrBody()), {
      status: 403,
      message: /vô hiệu hoá/,
    });
    await rejectsWith(setup({ store: { is_active: false } }).service.check(USER, qrBody()), {
      status: 403,
      message: /tạm ngưng/,
    });
  });

  it("tháng đã chốt lương thì khoá chấm công (CLK-BR-009)", async () => {
    const { service } = setup({ paysheetStatus: PAYSHEET_STATUS.FINALIZED });
    await rejectsWith(service.check(USER, qrBody()), { status: 403, code: "MONTH_LOCKED" });
  });

  it("bảng lương tháng mới ở dạng nháp thì vẫn chấm công bình thường", async () => {
    const { service } = setup({ paysheetStatus: PAYSHEET_STATUS.DRAFT });
    const result = await service.check(USER, qrBody());
    assert.equal(result.history.actionType, CLOCKING_ACTION.CHECK_IN);
  });
});

describe("chấm công QR — ghi nhận lần chấm", () => {
  it("lần đầu trong ngày mặc định là check-in, lần tiếp theo là check-out", async () => {
    const { service } = setup();
    const result = await service.check(USER, qrBody());
    assert.equal(result.history.actionType, CLOCKING_ACTION.CHECK_IN);
    assert.equal(result.history.method, CLOCKING_METHOD.QR);
    assert.equal(result.history.source, CLOCKING_SOURCE.EMPLOYEE);
    assert.equal(result.nextActionType, CLOCKING_ACTION.CHECK_OUT);
  });

  it("giờ chấm do server ghi, bỏ qua giờ client gửi lên (CLK-BR-001)", async () => {
    const { service, clockingRepository } = setup();
    const before = Date.now();
    await service.check(USER, qrBody({ clockTime: "2020-01-01T00:00:00Z" }));
    const saved = clockingRepository.histories[0];
    assert.ok(new Date(saved.clock_time).getTime() >= before);
    assert.equal(saved.created_by_account_id, USER.id);
  });

  it("dòng chấm công của ngày chụp lại giờ ca hiện tại và được tổng hợp lại (CLK-BR-002)", async () => {
    const { service, clockingRepository } = setup({ setting: { shift_start_time: "09:00", shift_end_time: "18:00" } });
    await service.check(USER, qrBody());
    const [clocking] = clockingRepository.clockings;
    assert.equal(clocking.work_date, vnDateKey(new Date()));
    assert.equal(clocking.shift_start_time, "09:00");
    assert.equal(clocking.shift_end_time, "18:00");
    assert.ok(clocking.summary, "phải tổng hợp lại công của ngày sau khi chấm");
  });

  it("đã check-in thì không check-in lại được, chỉ còn check-out (CLK-BR-006)", async () => {
    const { service, clockingRepository } = setup();
    await seedHistory(clockingRepository, CLOCKING_ACTION.CHECK_IN, 60);
    await assert.rejects(
      service.check(USER, qrBody({ actionType: CLOCKING_ACTION.CHECK_IN })),
      (err) => err.status === 409 && err.details?.nextActionType === CLOCKING_ACTION.CHECK_OUT
    );
  });

  it("quên check-in vẫn check-out được (CLK-BR-006)", async () => {
    const { service } = setup();
    const result = await service.check(USER, qrBody({ actionType: CLOCKING_ACTION.CHECK_OUT }));
    assert.equal(result.history.actionType, CLOCKING_ACTION.CHECK_OUT);
    assert.equal(result.nextActionType, CLOCKING_ACTION.CHECK_IN);
  });

  it("loại chấm công lạ thì báo lỗi", async () => {
    const { service } = setup();
    await rejectsWith(service.check(USER, qrBody({ actionType: "lunch" })), { status: 400, message: /không hợp lệ/ });
  });

  it("hai lần bấm cách nhau dưới 20 giây bị chặn (CLK-BR-007)", async () => {
    const { service, clockingRepository } = setup();
    await seedHistory(clockingRepository, CLOCKING_ACTION.CHECK_IN, 5);
    await rejectsWith(service.check(USER, qrBody()), { status: 429 });
  });

  it("cách lần trước từ 20 giây trở lên thì check-out được", async () => {
    const { service, clockingRepository } = setup();
    await seedHistory(clockingRepository, CLOCKING_ACTION.CHECK_IN, 30);
    const result = await service.check(USER, qrBody());
    assert.equal(result.history.actionType, CLOCKING_ACTION.CHECK_OUT);
  });

  it("chấm ngoài bán kính chỉ gắn cờ, không chặn (CLK-BR-008)", async () => {
    const { service, clockingRepository } = setup();
    const result = await service.check(USER, qrBody({ latitude: north(1000) }));
    assert.equal(result.history.isOutOfRange, true);
    const saved = clockingRepository.histories[0];
    assert.ok(Math.abs(saved.distance_to_store_meters - 1000) <= 2);
  });

  it("trong bán kính thì không gắn cờ; cửa hàng chưa đặt vị trí thì không đo khoảng cách", async () => {
    const near = setup();
    assert.equal((await near.service.check(USER, qrBody({ latitude: north(50) }))).history.isOutOfRange, false);

    const noLocation = setup({ setting: { latitude: null, longitude: null } });
    await noLocation.service.check(USER, qrBody({ latitude: north(5000) }));
    assert.equal(noLocation.clockingRepository.histories[0].distance_to_store_meters, null);
    assert.equal(noLocation.clockingRepository.histories[0].is_out_of_range, false);
  });
});

describe("chấm công bằng Wi-Fi (CLK-BR-005)", () => {
  const wifiOn = { wifi_clocking_enabled: true };

  it("cửa hàng chưa bật chấm công Wi-Fi thì phải quét QR", async () => {
    const { service } = setup();
    await rejectsWith(service.check(USER, wifiBody(), { ip: STORE_IP }), { status: 403, message: /chưa bật chấm công bằng Wi-Fi/ });
  });

  it("không dùng Wi-Fi cửa hàng (IP khác) thì bị từ chối", async () => {
    const { service } = setup({ setting: wifiOn });
    await rejectsWith(service.check(USER, wifiBody(), { ip: "198.51.100.7" }), {
      status: 403,
      message: /không kết nối Wi-Fi cửa hàng/,
    });
  });

  it("đúng Wi-Fi nhưng ở xa cửa hàng (GPS) thì bị từ chối", async () => {
    const { service } = setup({ setting: wifiOn });
    await rejectsWith(service.check(USER, wifiBody({ latitude: north(1000) }), { ip: STORE_IP }), {
      status: 403,
      message: /cách cửa hàng khoảng/,
    });
  });

  it("cửa hàng chưa đặt vị trí thì chưa chấm bằng Wi-Fi được", async () => {
    const { service } = setup({ setting: { ...wifiOn, latitude: null, longitude: null } });
    await rejectsWith(service.check(USER, wifiBody(), { ip: STORE_IP }), { status: 403, message: /chưa đặt vị trí/ });
  });

  it("đúng Wi-Fi và ở gần cửa hàng: chấm được mà không cần QR, ghi lại IP", async () => {
    const { service, clockingRepository } = setup({ setting: wifiOn });
    const result = await service.check(USER, wifiBody(), { ip: STORE_IP });
    assert.equal(result.history.method, CLOCKING_METHOD.WIFI);
    assert.equal(clockingRepository.histories[0].client_ip, STORE_IP);
  });

  it("được trừ hao sai số GPS, nhưng tối đa 100 m", async () => {
    // Cách 250 m, giới hạn 200 m: sai số 80 m -> 170 m, hợp lệ
    const ok = setup({ setting: wifiOn });
    await ok.service.check(USER, wifiBody({ latitude: north(250), accuracy: 80 }), { ip: STORE_IP });

    // Cách 350 m: sai số báo 500 m nhưng chỉ trừ tối đa 100 m -> 250 m, vẫn quá giới hạn
    const far = setup({ setting: wifiOn });
    await rejectsWith(far.service.check(USER, wifiBody({ latitude: north(350), accuracy: 500 }), { ip: STORE_IP }), {
      status: 403,
    });
  });
});

describe("chặn chấm công QR ngoài bán kính (CLK-UC01/BR-14)", () => {
  const enforced = { check_in_radius_enforced: true, check_in_radius_meters: 100 };

  it("bật chặn: quét QR khi cách cửa hàng 1 km thì bị từ chối, không ghi lần chấm nào", async () => {
    // SC: CLK-UC01-SC16
    const { service, clockingRepository } = setup({ setting: enforced });
    await rejectsWith(service.check(USER, qrBody({ latitude: north(1000), accuracy: 10 })), {
      status: 403,
      message: /^Bạn đang cách cửa hàng khoảng 1000 m — chỉ được chấm công trong phạm vi 100 m quanh cửa hàng\./,
    });
    assert.equal(clockingRepository.histories.length, 0);
  });

  it("bật chặn: trong bán kính thì chấm bình thường, không gắn cờ", async () => {
    const { service } = setup({ setting: enforced });
    const result = await service.check(USER, qrBody({ latitude: north(60), accuracy: 10 }));
    assert.equal(result.history.isOutOfRange, false);
  });

  it("bật chặn: được trừ hao sai số GPS tối đa 100 m; lần chấm trong phần trừ hao vẫn gắn cờ", async () => {
    // SC: CLK-UC01-SC17 — cách 150 m, sai số 80 m: 150 − 80 ≤ 100 -> được chấm
    const ok = setup({ setting: enforced });
    const result = await ok.service.check(USER, qrBody({ latitude: north(150), accuracy: 80 }));
    assert.equal(result.history.isOutOfRange, true);

    // Cách 250 m, sai số báo 500 m nhưng chỉ trừ 100 m: 250 − 100 > 100 -> từ chối
    const far = setup({ setting: enforced });
    await rejectsWith(far.service.check(USER, qrBody({ latitude: north(250), accuracy: 500 })), { status: 403 });
  });

  it("bật chặn nhưng cửa hàng chưa đặt vị trí: không chặn", async () => {
    const { service } = setup({ setting: { ...enforced, latitude: null, longitude: null } });
    const result = await service.check(USER, qrBody({ latitude: north(5000) }));
    assert.equal(result.history.actionType, CLOCKING_ACTION.CHECK_IN);
  });

  it("tắt chặn: ngoài bán kính vẫn chấm được, chỉ gắn cờ", async () => {
    // SC: CLK-UC01-SC18
    const { service } = setup({ setting: { check_in_radius_enforced: false } });
    const result = await service.check(USER, qrBody({ latitude: north(1000) }));
    assert.equal(result.history.isOutOfRange, true);
  });

  it("bật chặn không áp dụng cho chấm Wi-Fi: vẫn theo giới hạn Wi-Fi riêng", async () => {
    // SC: CLK-UC01-SC18 — bán kính QR 100 m, giới hạn Wi-Fi 200 m, cách 150 m
    const { service } = setup({ setting: { ...enforced, wifi_clocking_enabled: true, wifi_max_distance_meters: 200 } });
    const result = await service.check(USER, wifiBody({ latitude: north(150), accuracy: 0 }), { ip: STORE_IP });
    assert.equal(result.history.method, CLOCKING_METHOD.WIFI);
  });
});
