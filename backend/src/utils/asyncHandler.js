// Express 4 không tự bắt lỗi (Promise rejection) ném ra trong route handler async —
// nếu không bọc thủ công, request sẽ bị "treo" mãi mà không có response trả về.
// Hàm này bọc handler async và tự động gọi next(err) khi có lỗi, để middleware
// xử lý lỗi tập trung trong index.js có thể bắt được.
export function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
