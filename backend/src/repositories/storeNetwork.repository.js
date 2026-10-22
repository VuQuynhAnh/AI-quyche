// Truy cập bảng store_network (IP Wi-Fi của cửa hàng, dòng mới nhất = hiện tại).
export function createStoreNetworkRepository({ db }) {
  return {
    async findLatest(storeId, executor = db) {
      const r = await executor.query(
        `SELECT n.*, a.full_name AS detected_by_name
         FROM store_network n
         LEFT JOIN account a ON a.id = n.detected_by_account_id
         WHERE n.store_id = $1
         ORDER BY n.created_at DESC
         LIMIT 1`,
        [storeId]
      );
      return r.rows[0] || null;
    },

    async create({ storeId, ipAddress, detectedByAccountId }, executor = db) {
      const r = await executor.query(
        `INSERT INTO store_network (store_id, ip_address, detected_by_account_id)
         VALUES ($1, $2, $3) RETURNING *`,
        [storeId, ipAddress, detectedByAccountId]
      );
      return r.rows[0];
    },
  };
}
