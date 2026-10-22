// Cache dùng chung trên Redis, chia theo TỪNG CỬA HÀNG.
//
// Vô hiệu hoá (invalidate) bằng "phiên bản": mỗi cửa hàng có 1 số phiên bản
// `sc:ver:<storeId>`, nằm trong mọi key cache của cửa hàng đó:
//
//   sc:<storeId>:v<phiên bản>:<tên>     VD  sc:9f1c...:v3:paysheet-month:2026-09
//
// Khi dữ liệu cửa hàng đổi, chỉ cần INCR phiên bản (invalidateStore) -> mọi key
// cũ không còn được đọc tới nữa và tự hết hạn theo TTL. Không phải đi tìm &
// xoá từng key (lệnh KEYS/SCAN chậm khi Redis có nhiều dữ liệu).
//
// Mọi lỗi Redis đều bị nuốt: cache chỉ để tăng tốc, KHÔNG được làm hỏng API.
const PREFIX = "sc";

export function createRedisCache({ client, logger = console }) {
  const isReady = () => Boolean(client?.isReady);
  const versionKey = (storeId) => `${PREFIX}:ver:${storeId}`;

  async function storeKey(storeId, name) {
    const version = (await client.get(versionKey(storeId))) || 0;
    return `${PREFIX}:${storeId}:v${version}:${name}`;
  }

  // Lấy từ cache; chưa có thì gọi loader() rồi lưu lại `ttlSeconds` giây.
  // cacheIf(value) = false -> trả kết quả nhưng KHÔNG lưu (VD dữ liệu còn đang đổi).
  async function remember({ storeId, name, ttlSeconds, cacheIf = () => true }, loader) {
    if (!isReady()) return loader();

    let key;
    try {
      key = await storeKey(storeId, name);
      const cached = await client.get(key);
      if (cached) return JSON.parse(cached);
    } catch (err) {
      logger.warn("[cache] Đọc cache lỗi, bỏ qua:", err.message);
      return loader();
    }

    const value = await loader();
    if (cacheIf(value)) {
      client.set(key, JSON.stringify(value), { EX: ttlSeconds }).catch((err) => {
        logger.warn("[cache] Ghi cache lỗi, bỏ qua:", err.message);
      });
    }
    return value;
  }

  // Bỏ toàn bộ cache của 1 cửa hàng. Gọi SAU khi ghi DB xong (đã commit).
  async function invalidateStore(storeId) {
    if (!isReady() || !storeId) return;
    try {
      await client.incr(versionKey(storeId));
    } catch (err) {
      logger.warn("[cache] Không vô hiệu hoá được cache cửa hàng", storeId, err.message);
    }
  }

  return { remember, invalidateStore };
}
