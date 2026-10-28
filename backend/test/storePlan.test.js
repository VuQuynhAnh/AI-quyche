// Gói sử dụng của cửa hàng: tạm ngưng / hết hạn (tính theo giờ VN) và số chỗ.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { AppError } from "../src/utils/AppError.js";
import {
  STORE_LOCKED_CODE,
  assertStoreUsable,
  createStorePlanService,
  storeLockReason,
  vnToday,
} from "../src/services/storePlan.service.js";

describe("storeLockReason — cửa hàng có dùng được không (STORE-BR-002)", () => {
  it("cửa hàng đang hoạt động, không có hạn dùng: dùng bình thường", () => {
    assert.equal(storeLockReason({ isActive: true, expiryDate: null }), null);
  });

  it("cửa hàng tạm ngưng: bị khoá dù còn hạn", () => {
    assert.match(storeLockReason({ isActive: false, expiryDate: "2099-01-01" }), /tạm ngưng/);
  });

  it("dùng được tới HẾT ngày hết hạn theo giờ VN", () => {
    // 23:59 ngày 30/9 giờ VN
    assert.equal(storeLockReason({ isActive: true, expiryDate: "2026-09-30" }, new Date("2026-09-30T16:59:00Z")), null);
    // 00:00 ngày 1/10 giờ VN -> đã hết hạn, báo ngày dạng dd/mm/yyyy
    const reason = storeLockReason({ isActive: true, expiryDate: "2026-09-30" }, new Date("2026-09-30T17:00:00Z"));
    assert.match(reason, /hết hạn sử dụng từ ngày 30\/09\/2026/);
  });

  it("vnToday đổi ngày lúc 17:00 UTC", () => {
    assert.equal(vnToday(new Date("2026-09-30T16:59:59Z")), "2026-09-30");
    assert.equal(vnToday(new Date("2026-09-30T17:00:00Z")), "2026-10-01");
  });

  it("assertStoreUsable ném 403 kèm mã STORE_LOCKED", () => {
    assert.throws(
      () => assertStoreUsable({ isActive: false, expiryDate: null }),
      (err) => err instanceof AppError && err.status === 403 && err.code === STORE_LOCKED_CODE
    );
  });
});

describe("số chỗ trong gói (EMP-BR-003)", () => {
  const planService = ({ limit, used }) =>
    createStorePlanService({
      storeRepository: { findById: async () => ({ max_employee_count: limit }) },
      accountRepository: { countActiveInStore: async () => used },
    });

  it("không giới hạn số chỗ khi gói không đặt max_employee_count", async () => {
    const usage = await planService({ limit: null, used: 999 }).getSeatUsage("store");
    assert.equal(usage.fullMessage, null);
  });

  it("còn chỗ: cho tạo thêm tài khoản", async () => {
    await planService({ limit: 3, used: 2 }).assertSeatAvailable("store");
  });

  it("đã dùng đủ số chỗ: chặn bằng lỗi 409", async () => {
    await assert.rejects(
      planService({ limit: 3, used: 3 }).assertSeatAvailable("store"),
      (err) => err instanceof AppError && err.status === 409 && /hết 3 tài khoản/.test(err.message)
    );
  });
});
