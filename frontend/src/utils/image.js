// Thu nhỏ ảnh ngay trong trình duyệt trước khi tải lên (ảnh điện thoại thường
// vài MB): cắt vuông ở giữa rồi thu về `size` x `size` px, xuất JPEG.
export async function resizeImageToSquare(file, size = 320, quality = 0.85) {
  if (!file || !file.type.startsWith("image/")) throw new Error("Hãy chọn 1 file ảnh (JPG, PNG, WEBP).");
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Không đọc được file ảnh này."));
      el.src = url;
    });
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff"; // ảnh PNG trong suốt -> nền trắng khi đổi sang JPEG
    ctx.fillRect(0, 0, size, size);
    ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, size, size);
    return await new Promise((resolve, reject) =>
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Không xử lý được ảnh."))), "image/jpeg", quality)
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}
