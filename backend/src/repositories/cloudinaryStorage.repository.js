// Lưu ẢNH lên Cloudinary (gói free, có CDN) thay cho ổ đĩa server. Cần khi
// deploy lên Render bản free: ổ đĩa ở đó bị xoá sạch mỗi lần deploy/khởi động
// lại nên ảnh lưu trong uploads/ sẽ mất.
//
// Cùng các method với fileStorage.repository.js (save / remove) nên service
// không phải sửa; thêm publicUrl() để route /api/avatars chuyển hướng sang CDN.
// Đường dẫn lưu trong DB giữ nguyên dạng "avatars/<uuid>.jpg"; trên Cloudinary
// ảnh nằm ở "<folder>/avatars/<uuid>" (folder để tách khỏi app khác cùng tài khoản).
import { v2 as cloudinary } from "cloudinary";

// CLOUDINARY_URL dạng cloudinary://<api_key>:<api_secret>@<cloud_name>
// (copy nguyên ở trang Dashboard của Cloudinary). Trả về null nếu chưa đặt.
export function parseCloudinaryUrl(value) {
  if (!value) return null;
  const url = new URL(value);
  if (url.protocol !== "cloudinary:" || !url.hostname || !url.username || !url.password) {
    throw new Error("CLOUDINARY_URL không hợp lệ (cần dạng cloudinary://<api_key>:<api_secret>@<cloud_name>).");
  }
  return {
    cloud_name: url.hostname,
    api_key: decodeURIComponent(url.username),
    api_secret: decodeURIComponent(url.password),
  };
}

export function createCloudinaryStorage({ config, folder = "smartclocking" }) {
  cloudinary.config({ ...config, secure: true });

  // "avatars/abc.jpg" -> { publicId: "smartclocking/avatars/abc", format: "jpg" }
  function toAsset(storagePath) {
    const dot = storagePath.lastIndexOf(".");
    return { publicId: `${folder}/${storagePath.slice(0, dot)}`, format: storagePath.slice(dot + 1) };
  }

  return {
    async save(storagePath, buffer) {
      const { publicId } = toAsset(storagePath);
      await new Promise((resolve, reject) => {
        cloudinary.uploader
          .upload_stream({ public_id: publicId, resource_type: "image", overwrite: false }, (err, result) =>
            err ? reject(err) : resolve(result)
          )
          .end(buffer);
      });
    },

    // Xoá ảnh; bỏ qua lỗi (ảnh không còn / mạng lỗi) giống bản lưu trên đĩa
    async remove(storagePath) {
      await cloudinary.uploader.destroy(toAsset(storagePath).publicId, { invalidate: true }).catch(() => {});
    },

    // Link CDN; f_auto,q_auto = Cloudinary tự chọn định dạng & nén cho nhẹ
    publicUrl(storagePath) {
      const { publicId, format } = toAsset(storagePath);
      return cloudinary.url(publicId, { format, transformation: [{ fetch_format: "auto", quality: "auto" }] });
    },
  };
}
