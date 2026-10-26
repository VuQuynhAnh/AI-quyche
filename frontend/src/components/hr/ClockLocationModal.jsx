import Modal from "./Modal.jsx";

// Vị trí của 1 lần chấm công so với cửa hàng: bản đồ (OpenStreetMap nhúng, không
// cần API key) + khoảng cách, bán kính cho phép, sai số GPS và link Google Maps.
//  - point: lần chấm (latitude, longitude, gpsAccuracyMeters, distanceToStoreMeters, isOutOfRange)
//  - store: { latitude, longitude, checkInRadiusMeters } hoặc null nếu cửa hàng chưa đặt vị trí

// Khoảng cách 2 toạ độ (mét) — công thức haversine
function distanceMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const rad = (d) => (d * Math.PI) / 180;
  const a =
    Math.sin(rad(lat2 - lat1) / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

const fmtMeters = (m) => (m >= 1000 ? `${(m / 1000).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} km` : `${Math.round(m)} m`);

// Khung bản đồ bao cả 2 điểm, chừa lề để ghim không sát mép
function mapEmbedUrl(point, store) {
  const lats = [point.latitude, store?.latitude].filter((v) => v != null);
  const lngs = [point.longitude, store?.longitude].filter((v) => v != null);
  const pad = Math.max(0.002, (Math.max(...lats) - Math.min(...lats)) * 0.3, (Math.max(...lngs) - Math.min(...lngs)) * 0.3);
  const bbox = [Math.min(...lngs) - pad, Math.min(...lats) - pad, Math.max(...lngs) + pad, Math.max(...lats) + pad].join(",");
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${point.latitude},${point.longitude}`;
}

export default function ClockLocationModal({ title, point, store, onClose }) {
  const distance =
    point.distanceToStoreMeters ??
    (store ? distanceMeters(point.latitude, point.longitude, store.latitude, store.longitude) : null);
  const radius = store?.checkInRadiusMeters;
  const outside = point.isOutOfRange || (distance != null && radius != null && distance > radius);
  const coords = `${point.latitude},${point.longitude}`;

  return (
    <Modal
      title={title}
      onClose={onClose}
      width={640}
      footer={
        <>
          <a className="btn btn-outline-secondary btn-sm me-auto" href={`https://www.google.com/maps?q=${coords}`} target="_blank" rel="noreferrer">
            Mở trên Google Maps
          </a>
          {store && (
            <a
              className="btn btn-primary btn-sm"
              href={`https://www.google.com/maps/dir/?api=1&origin=${store.latitude},${store.longitude}&destination=${coords}`}
              target="_blank"
              rel="noreferrer"
            >
              Xem đường từ cửa hàng
            </a>
          )}
        </>
      }
    >
      {distance != null ? (
        <div className={`alert ${outside ? "alert-danger" : "alert-success"} py-2 mb-3`}>
          Cách cửa hàng <strong>{fmtMeters(distance)}</strong>
          {radius != null && (
            <> — {outside ? "ngoài" : "trong"} bán kính cho phép <strong>{fmtMeters(radius)}</strong></>
          )}
        </div>
      ) : (
        <div className="alert alert-secondary py-2 mb-3">Cửa hàng chưa đặt vị trí nên chưa tính được khoảng cách.</div>
      )}

      <div className="ratio ratio-16x9 border rounded overflow-hidden mb-3">
        <iframe title="Bản đồ vị trí chấm công" src={mapEmbedUrl(point, store)} loading="lazy" />
      </div>

      <div className="row g-2 small">
        <div className="col-sm-6">
          <div className="text-muted">Vị trí chấm công</div>
          <div className="font-monospace">{point.latitude.toFixed(6)}, {point.longitude.toFixed(6)}</div>
        </div>
        <div className="col-sm-6">
          <div className="text-muted">Vị trí cửa hàng</div>
          <div className="font-monospace">{store ? `${store.latitude.toFixed(6)}, ${store.longitude.toFixed(6)}` : "—"}</div>
        </div>
        {point.gpsAccuracyMeters != null && (
          <div className="col-12 text-muted">
            Sai số GPS khoảng ±{fmtMeters(point.gpsAccuracyMeters)} (điện thoại tự báo; trong nhà thường lệch vài chục mét).
          </div>
        )}
      </div>
    </Modal>
  );
}
