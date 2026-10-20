// Truy cập bảng store (cửa hàng) và setting (thiết lập cửa hàng, 1–1).
import { ROLE } from "../constants/enums.js";

export function createStoreRepository({ db }) {
  return {
    // Danh sách cửa hàng kèm số admin / nhân viên (màn superadmin)
    async listWithAccountCounts(executor = db) {
      const r = await executor.query(
        `SELECT s.id, s.name, s.address, s.is_active, s.created_at,
                COUNT(a.id) FILTER (WHERE a.role = $1)::int AS admin_count,
                COUNT(a.id) FILTER (WHERE a.role = $2)::int AS user_count
         FROM store s
         LEFT JOIN account a ON a.store_id = s.id
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

    async create({ name, address, createdByAccountId }, executor = db) {
      const r = await executor.query(
        `INSERT INTO store (name, address, created_by_account_id) VALUES ($1, $2, $3) RETURNING *`,
        [name, address, createdByAccountId]
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

    // ---------- Thiết lập ----------
    async createSetting(storeId, fields = {}, executor = db) {
      const cols = ["store_id", ...Object.keys(fields)];
      const values = [storeId, ...Object.values(fields)];
      await executor.query(
        `INSERT INTO setting (${cols.join(",")}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(",")})`,
        values
      );
    },

    async findSetting(storeId, executor = db) {
      const r = await executor.query(`SELECT * FROM setting WHERE store_id = $1`, [storeId]);
      return r.rows[0] || null;
    },

    async updateSetting(storeId, fields, executor = db) {
      const cols = Object.keys(fields);
      const r = await executor.query(
        `UPDATE setting SET ${cols.map((c, i) => `${c} = $${i + 2}`).join(", ")}, updated_at = now()
         WHERE store_id = $1 RETURNING *`,
        [storeId, ...cols.map((c) => fields[c])]
      );
      return r.rows[0] || null;
    },
  };
}
