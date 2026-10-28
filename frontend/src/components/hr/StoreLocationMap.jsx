import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

// Chưa có vị trí cửa hàng -> mở bản đồ ở trung tâm Hà Nội
const DEFAULT_CENTER = [21.0285, 105.8542];
const DEFAULT_ZOOM = 12;
const PINNED_ZOOM = 17;

// Vite đổi tên file ảnh khi build nên đường dẫn icon ghim mặc định của Leaflet bị
// hỏng -> khai báo lại icon từ chính các file ảnh đã import
const PIN_ICON = L.icon({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  shadowSize: [41, 41],
});

// Bản đồ nền + tìm địa chỉ đều của OpenStreetMap: miễn phí, không cần khoá API.
// Máy chủ OSM có quy định dùng hợp lý (ghi nguồn, không gửi dồn dập) — màn thiết
// lập chỉ admin mở, mỗi lần tìm là 1 lần bấm nên nằm trong giới hạn.
const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
const GEOCODE_URL = "https://nominatim.openstreetmap.org/search";

// Bản đồ chọn vị trí cửa hàng (Thiết lập cửa hàng — STORE-UC01): bấm vào bản đồ
// hoặc kéo ghim để đặt vị trí, tìm theo địa chỉ, và vẽ vòng tròn bán kính chấm
// công quanh ghim. Ghim luôn theo latitude/longitude của form (kể cả khi admin
// gõ tay hoặc bấm "Lấy vị trí hiện tại").
//  - latitude, longitude: chuỗi trong form ("" = chưa có vị trí)
//  - focusKey: đổi giá trị (VD sau "Lấy vị trí hiện tại") -> bay tới và phóng to vào vị trí
//  - onPick(lat, lng): admin chọn vị trí mới trên bản đồ
//  - onSearchError(message): tìm địa chỉ không thấy / lỗi mạng
export default function StoreLocationMap({ latitude, longitude, radiusMeters, focusKey, onPick, onSearchError }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null); // { map, marker, circle }
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);

  const lat = latitude === "" ? NaN : Number(latitude);
  const lng = longitude === "" ? NaN : Number(longitude);
  const position = Number.isFinite(lat) && Number.isFinite(lng) ? [lat, lng] : null;

  // Tạo bản đồ 1 lần, huỷ khi rời trang
  useEffect(() => {
    const map = L.map(containerRef.current).setView(position || DEFAULT_CENTER, position ? PINNED_ZOOM : DEFAULT_ZOOM);
    L.tileLayer(TILE_URL, { maxZoom: 19, attribution: TILE_ATTRIBUTION }).addTo(map);
    const marker = L.marker(DEFAULT_CENTER, { icon: PIN_ICON, draggable: true, title: "Vị trí cửa hàng" });
    const circle = L.circle(DEFAULT_CENTER, { radius: 0, color: "#0d6efd", weight: 1, fillOpacity: 0.12, interactive: false });
    const pick = ({ lat: pickedLat, lng: pickedLng }) => onPickRef.current(pickedLat, pickedLng);
    map.on("click", (e) => pick(e.latlng));
    marker.on("dragend", () => pick(marker.getLatLng()));
    mapRef.current = { map, marker, circle };
    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Ghim + vòng tròn bán kính theo vị trí / bán kính hiện tại của form
  useEffect(() => {
    const { map, marker, circle } = mapRef.current;
    if (!position) {
      marker.remove();
      circle.remove();
      return;
    }
    marker.setLatLng(position).addTo(map);
    circle.setLatLng(position).setRadius(Number(radiusMeters) || 0).addTo(map);
    if (!map.getBounds().contains(position)) map.panTo(position);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lng, radiusMeters]);

  // Vừa lấy vị trí GPS: bay tới và phóng to để thấy rõ ghim (không đổi zoom khi
  // admin tự bấm / kéo ghim trên bản đồ)
  useEffect(() => {
    if (!focusKey || !position) return;
    mapRef.current.map.flyTo(position, Math.max(mapRef.current.map.getZoom(), PINNED_ZOOM));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey]);

  async function search() {
    const address = query.trim();
    if (!address) return;
    setSearching(true);
    try {
      const params = new URLSearchParams({ q: address, format: "json", limit: "1", countrycodes: "vn", "accept-language": "vi" });
      const res = await fetch(`${GEOCODE_URL}?${params}`);
      const [found] = res.ok ? await res.json() : [];
      if (!found) {
        onSearchError("Không tìm thấy địa chỉ này trên bản đồ.");
        return;
      }
      const foundLat = Number(found.lat);
      const foundLng = Number(found.lon);
      mapRef.current.map.setView([foundLat, foundLng], PINNED_ZOOM);
      onPickRef.current(foundLat, foundLng);
    } catch {
      onSearchError("Không tìm được địa chỉ (lỗi kết nối) — thử lại hoặc chọn trực tiếp trên bản đồ.");
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="mt-2">
      <div className="input-group input-group-sm mb-2">
        <input
          className="form-control"
          placeholder="Tìm địa chỉ, VD 12 Hàng Bài, Hoàn Kiếm, Hà Nội"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          // Enter trong ô tìm kiếm: tìm địa chỉ, không gửi form thiết lập
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              search();
            }
          }}
        />
        <button type="button" className="btn btn-outline-secondary" disabled={searching} onClick={search}>
          Tìm
        </button>
      </div>
      <div ref={containerRef} className="store-map rounded border" />
      <div className="small text-muted mt-1">Bấm vào bản đồ hoặc kéo ghim để đặt vị trí cửa hàng.</div>
    </div>
  );
}
