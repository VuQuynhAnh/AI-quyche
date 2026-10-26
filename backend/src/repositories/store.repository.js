// Truy cập bảng store (cửa hàng) và store_setting (thiết lập cửa hàng, key-value).
import { ROLE, SETTING_DEFINITIONS } from "../constants/enums.js";
import { parseSettingValue, serializeSettingValue } from "../utils/settingValue.js";

export function createStoreRepository({ db }) {
  const repo = {
    // Danh sách cửa hàng kèm số admin / nhân viên (màn superadmin)
    async listWithAccountCounts(executor = db) {
      const r = await executor.query(
        `SELECT s.*,
                COUNT(a.id) FILTER (WHERE a.role = $1)::int AS admin_count,
                COUNT(a.id) FILTER (WHERE a.role = $2)::int AS user_count,
                COUNT(a.id) FILTER (WHERE a.is_active)::int AS active_account_count
         FROM store s
         LEFT JOIN account a ON a.store_id = s.id AND NOT a.is_deleted
         GROUP BY s.id
         ORDER BY s.created_at`,
        [ROLE.ADMIN, ROLE.USER]
      );
      return r.rows;
    },

    async findById(id, executor = db) {
      const r = await executor.query(`SELECT * FROM store WHERE id = $1`, [id]);
      return r.rows[0] || null;
    },

    async create(
      { name, address, ownerPhoneNumber, maxEmployeeCount, expiryDate, createdByAccountId },
      executor = db
    ) {
      const r = await executor.query(
        `INSERT INTO store (name, address, owner_phone_number, max_employee_count, expiry_date, created_by_account_id)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [name, address, ownerPhoneNumber, maxEmployeeCount, expiryDate, createdByAccountId]
      );
      return r.rows[0];
    },

    // fields: { tên_cột: giá_trị }
    async update(id, fields, executor = db) {
      const cols = Object.keys(fields);
      const r = await executor.query(
        `UPDATE store SET ${cols.map((c, i) => `${c} = $${i + 2}`).join(", ")}, updated_at = now()
         WHERE id = $1 RETURNING *`,
        [id, ...cols.map((c) => fields[c])]
      );
      return r.rows[0] || null;
    },

    // ---------- Thiết lập (key-value, bảng store_setting) ----------
    // Trả về { <SETTING_KEY>: giá trị đúng kiểu, ..., updated_at } — key chưa
    // lưu thì lấy mặc định trong SETTING_DEFINITIONS. updated_at = lần sửa gần nhất.
    async findSetting(storeId, executor = db) {
      const r = await executor.query(`SELECT key, value, updated_at FROM store_setting WHERE store_id = $1`, [storeId]);
      const stored = new Map(r.rows.map((row) => [row.key, row]));
      const setting = {};
      for (const [key, { type, defaultValue }] of Object.entries(SETTING_DEFINITIONS)) {
        setting[key] = stored.has(key) ? parseSettingValue(type, stored.get(key).value) : defaultValue;
      }
      setting.updated_at = r.rows.reduce((max, row) => (!max || row.updated_at > max ? row.updated_at : max), null);
      return setting;
    },

    // fields: { <SETTING_KEY>: giá trị } — ghi tất cả trong 1 câu lệnh (đủ cả hoặc không)
    async updateSetting(storeId, fields, executor = db) {
      const keys = Object.keys(fields);
      for (const key of keys) {
        if (!SETTING_DEFINITIONS[key]) throw new Error(`Thiết lập không tồn tại: ${key}`);
      }
      await executor.query(
        `INSERT INTO store_setting (store_id, key, value)
         SELECT $1, t.key, t.value FROM unnest($2::text[], $3::text[]) AS t(key, value)
         ON CONFLICT (store_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
        [storeId, keys, keys.map((k) => serializeSettingValue(SETTING_DEFINITIONS[k].type, fields[k]))]
      );
      return repo.findSetting(storeId, executor);
    },

    // Cửa hàng mới: ghi sẵn mọi giá trị mặc định (để đổi mặc định trong code về
    // sau KHÔNG làm đổi thiết lập của cửa hàng đã có) + các giá trị truyền vào
    async createSetting(storeId, fields = {}, executor = db) {
      const defaults = Object.fromEntries(
        Object.entries(SETTING_DEFINITIONS)
          .filter(([, d]) => d.defaultValue != null)
          .map(([key, d]) => [key, d.defaultValue])
      );
      return repo.updateSetting(storeId, { ...defaults, ...fields }, executor);
    },
  };
  return repo;
}
