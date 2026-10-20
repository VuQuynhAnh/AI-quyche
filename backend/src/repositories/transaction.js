// Chạy nhiều câu lệnh trong 1 transaction PostgreSQL. Service gọi:
//   await transaction.run(async (tx) => {
//     await userRepository.createEmployee(data, tx);
//     await employeeRateRepository.create(rate, tx);
//   });
// Mọi method repository đều nhận tham số cuối `executor` (mặc định là pool);
// truyền `tx` vào để câu lệnh chạy trong cùng transaction. Lỗi → ROLLBACK.
export function createTransactionManager({ pool }) {
  return {
    async run(work) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await work(client);
        await client.query("COMMIT");
        return result;
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    },
  };
}
