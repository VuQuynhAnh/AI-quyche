import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import jsQR from "jsqr";

// Quét mã QR bằng camera NGAY TRONG APP (camera sau của điện thoại). Đọc từng
// khung hình video vào canvas rồi giải mã bằng jsQR; đọc được thì gọi
// onResult(text) và tự tắt camera.
// Lưu ý: trình duyệt chỉ cho mở camera trên HTTPS hoặc http://localhost.
export default function QrScanner({ title = "Quét mã QR tại cửa hàng", onResult, onClose }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let stream = null;
    let frame = 0;
    let stopped = false;

    function stop() {
      stopped = true;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((t) => t.stop());
    }

    function scan() {
      if (stopped) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(image.data, image.width, image.height, { inversionAttempts: "dontInvert" });
        if (code?.data) {
          stop();
          onResult(code.data);
          return;
        }
      }
      frame = requestAnimationFrame(scan);
    }

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("Trình duyệt không hỗ trợ mở camera (cần mở trang bằng HTTPS).");
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
        if (stopped) return stop();
        const video = videoRef.current;
        video.srcObject = stream;
        await video.play();
        scan();
      } catch (e) {
        setError(
          e?.name === "NotAllowedError"
            ? "Bạn chưa cho phép dùng camera. Hãy bật quyền camera cho trang này rồi thử lại."
            : "Không mở được camera trên thiết bị này."
        );
      }
    }

    start();
    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return createPortal(
    <div className="qr-scanner" role="dialog" aria-modal="true" aria-label={title}>
      <div className="qr-scanner-head">
        <span>{title}</span>
        <button type="button" className="btn-close btn-close-white" aria-label="Đóng" onClick={onClose} />
      </div>
      {error ? (
        <div className="qr-scanner-error">
          <p>{error}</p>
          <button type="button" className="btn btn-light btn-sm" onClick={onClose}>Đóng</button>
        </div>
      ) : (
        <div className="qr-scanner-view">
          <video ref={videoRef} playsInline muted />
          <div className="qr-scanner-frame" />
          <div className="qr-scanner-hint">Đưa mã QR dán tại quầy vào giữa khung</div>
        </div>
      )}
      <canvas ref={canvasRef} hidden />
    </div>,
    document.body
  );
}
