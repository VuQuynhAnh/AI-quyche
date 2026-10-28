// Thiết lập cửa hàng — phần vị trí và chặn chấm công ngoài bán kính (STORE-UC01).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { SETTING_KEY } from "../src/constants/enums.js";
import { createStoreSettingService } from "../src/services/storeSetting.service.js";
import { AppError } from "../src/utils/AppError.js";
import { STORE_ID, makeSetting } from "../test-support/fakes.js";

const ACTOR = { id: "admin-1", storeId: STORE_ID };
const NEED_LOCATION = "Cần đặt vị trí cửa hàng (vĩ độ, kinh độ) trước khi bật chặn chấm công ngoài bán kính.";

// Repo giả giữ thiết lập trong bộ nhớ; updateSetting ghi đè các key được gửi
function setup(setting = {}) {
  const stored = makeSetting(setting);
  const storeRepository = {
    findById: async () => ({ id: STORE_ID, name: "Cửa hàng A", is_active: true }),
    findSetting: async () => ({ ...stored }),
    updateSetting: async (storeId, fields) => Object.assign(stored, fields),
  };
  const service = createStoreSettingService({ storeRepository, storeNetworkService: { getCurrent: async () => null } });
  return { service, stored };
}

const rejects400 = (promise, message) =>
  assert.rejects(promise, (err) => err instanceof AppError && err.status === 400 && err.message === message);

describe("chặn chấm công ngoài bán kính (STORE-UC01/BR-6)", () => {
  it("mặc định tắt và được trả về trong thiết lập", async () => {
    const { service } = setup();
    const { setting } = await service.get(ACTOR);
    assert.equal(setting.checkInRadiusEnforced, false);
  });

  it("cửa hàng đã có vị trí: bật được", async () => {
    // SC: STORE-UC01-SC6
    const { service, stored } = setup();
    const { setting } = await service.update(ACTOR, { checkInRadiusEnforced: true });
    assert.equal(stored[SETTING_KEY.CHECK_IN_RADIUS_ENFORCED], true);
    assert.equal(setting.checkInRadiusEnforced, true);
  });

  it("cửa hàng chưa có vị trí: không bật được", async () => {
    // SC: STORE-UC01-SC4
    const { service } = setup({ latitude: null, longitude: null });
    await rejects400(service.update(ACTOR, { checkInRadiusEnforced: true }), NEED_LOCATION);
  });

  it("bật vị trí và bật chặn trong cùng một lần lưu thì được", async () => {
    const { service } = setup({ latitude: null, longitude: null });
    const { setting } = await service.update(ACTOR, { latitude: 21.0285, longitude: 105.8542, checkInRadiusEnforced: true });
    assert.equal(setting.checkInRadiusEnforced, true);
  });

  it("đang bật chặn thì không xoá được vị trí", async () => {
    // SC: STORE-UC01-SC5
    const { service } = setup({ check_in_radius_enforced: true });
    await rejects400(service.update(ACTOR, { latitude: null, longitude: null }), NEED_LOCATION);
  });

  it("tắt chặn rồi xoá vị trí trong cùng một lần lưu thì được", async () => {
    const { service } = setup({ check_in_radius_enforced: true });
    const { setting } = await service.update(ACTOR, { latitude: null, longitude: null, checkInRadiusEnforced: false });
    assert.equal(setting.latitude, null);
  });

  it("giá trị không phải true/false thì báo lỗi", async () => {
    const { service } = setup();
    await rejects400(
      service.update(ACTOR, { checkInRadiusEnforced: "true" }),
      "Giá trị bật/tắt chặn chấm công ngoài bán kính không hợp lệ."
    );
  });
});
