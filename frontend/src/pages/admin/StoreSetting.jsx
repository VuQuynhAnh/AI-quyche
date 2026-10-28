import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { api } from "../../api/client.js";
import { useNotification } from "../../context/NotificationContext.jsx";
import { getBestPosition } from "../../utils/geo.js";
import { fmtDateTime } from "../../utils/format.js";
import TimeInput from "../../components/hr/TimeInput.jsx";
import MoneyInput from "../../components/hr/MoneyInput.jsx";
import StoreLocationMap from "../../components/hr/StoreLocationMap.jsx";
import HelpTip from "../../components/HelpTip.jsx";

// Sai số GPS lớn hơn mức này thì cảnh báo (vẫn điền vị trí): vị trí cửa hàng
// lệch nhiều sẽ làm chấm công bị gắn cờ / bị chặn oan, nên admin cần kéo ghim lại
const MAX_GOOD_ACCURACY_METERS = 100;

// Thiết lập cửa hàng: giờ vào/tan ca, tiền phạt mỗi phút muộn/sớm, vị trí (chọn
// trên bản đồ OpenStreetMap) + bán kính chấm công và tuỳ chọn chặn chấm QR ngoài
// bán kính, bật/tắt chấm công Wi-Fi, và mã QR dán tại quầy.
export default function StoreSetting() {
  const { notifySuccess, notifyError } = useNotification();
  const [store, setStore] = useState(null);
  const [wifiNetwork, setWifiNetwork] = useState(null);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);
  // Sai số (m) của lần "Lấy vị trí hiện tại" gần nhất; null = vị trí chọn tay / trên bản đồ
  const [locationAccuracy, setLocationAccuracy] = useState(null);
  // Tăng mỗi lần lấy vị trí GPS -> bản đồ bay tới và phóng to vào vị trí vừa lấy
  const [mapFocusKey, setMapFocusKey] = useState(0);

  function applyResponse(d) {
    setStore(d.store);
    setWifiNetwork(d.wifiNetwork);
    const s = d.setting;
    setForm({
      shiftStartTime: s.shiftStartTime,
      shiftEndTime: s.shiftEndTime,
      penaltyAmountPerMinute: String(s.penaltyAmountPerMinute),
      latitude: s.latitude ?? "",
      longitude: s.longitude ?? "",
      checkInRadiusMeters: String(s.checkInRadiusMeters),
      checkInRadiusEnforced: Boolean(s.checkInRadiusEnforced),
      wifiClockingEnabled: Boolean(s.wifiClockingEnabled),
      wifiMaxDistanceMeters: String(s.wifiMaxDistanceMeters ?? 200),
    });
  }

  useEffect(() => {
    api.get("/hr/setting").then(applyResponse).catch((e) => notifyError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  // Toạ độ lưu dạng chuỗi 6 chữ số thập phân (~10 cm) — dùng chung cho bản đồ và GPS
  const setLocation = (lat, lng) => setForm((f) => ({ ...f, latitude: lat.toFixed(6), longitude: lng.toFixed(6) }));

  // Chọn trên bản đồ / gõ tay: không còn là vị trí GPS nên bỏ dòng sai số
  function pickLocation(lat, lng) {
    setLocation(lat, lng);
    setLocationAccuracy(null);
  }
  const setCoordinate = (k) => (e) => {
    set(k)(e);
    setLocationAccuracy(null);
  };

  // Đọc GPS tối đa 3 giây, lấy lần chính xác nhất (dừng ngay khi sai số ≤ 50 m).
  // Luôn điền toạ độ và đưa bản đồ tới đó; sai số > 100 m (thường là máy tính
  // không có GPS) thì kèm cảnh báo để admin kéo ghim lại cho đúng cửa hàng.
  async function useMyLocation() {
    setLocating(true);
    try {
      const p = await getBestPosition({ maxWaitMs: 3000, goodEnoughMeters: 50 });
      setLocation(p.lat, p.lng);
      setMapFocusKey((k) => k + 1);
      setLocationAccuracy(Math.round(p.accuracy));
    } catch (e) {
      notifyError(e.message);
    } finally {
      setLocating(false);
    }
  }

  // Chấm bằng Wi-Fi và chặn chấm ngoài bán kính đều cần vị trí cửa hàng để đo khoảng cách
  const hasLocation = form ? form.latitude !== "" && form.longitude !== "" : false;

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const d = await api.patch("/hr/setting", {
        shiftStartTime: form.shiftStartTime,
        shiftEndTime: form.shiftEndTime,
        penaltyAmountPerMinute: Number(form.penaltyAmountPerMinute),
        checkInRadiusMeters: Number(form.checkInRadiusMeters),
        checkInRadiusEnforced: form.checkInRadiusEnforced,
        latitude: form.latitude === "" ? null : Number(form.latitude),
        longitude: form.longitude === "" ? null : Number(form.longitude),
        wifiClockingEnabled: form.wifiClockingEnabled,
        wifiMaxDistanceMeters: Number(form.wifiMaxDistanceMeters),
      });
      applyResponse(d);
      notifySuccess("Đã lưu thiết lập cửa hàng.");
    } catch (err) {
      notifyError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (!store || !form) return null; // lớp phủ "Đang xử lý" toàn màn hình đang hiện

  return (
    // Form chiếm cả chiều ngang tới xl: cạnh sidebar admin, chia 2 cột từ lg làm form bị dồn
    <div className="row g-3">
      <div className="col-12 col-xl-8">
        <form className="card" onSubmit={save}>
          <div className="card-body">
            <h2 className="h6 mb-1">{store.name}</h2>
            {store.address && <div className="text-muted small">{store.address}</div>}

            <section className="border-top pt-3 mt-3">
              <h3 className="h6 mb-2">Ca làm và tiền phạt</h3>
              <div className="row g-2">
                <div className="col-6 col-md-3">
                  {/* d-block: nhãn luôn nằm trên ô giờ, thẳng hàng với nhãn ô tiền phạt */}
                  <label className="form-label small d-block mb-1">
                    Giờ vào ca
                    <HelpTip>Giờ ca mới áp dụng từ ngày chấm công tiếp theo; các ngày đã có công giữ giờ ca cũ.</HelpTip>
                  </label>
                  <TimeInput block required value={form.shiftStartTime} onChange={(v) => setForm((f) => ({ ...f, shiftStartTime: v }))} />
                </div>
                <div className="col-6 col-md-3">
                  <label className="form-label small d-block mb-1">Giờ tan ca</label>
                  <TimeInput block required value={form.shiftEndTime} onChange={(v) => setForm((f) => ({ ...f, shiftEndTime: v }))} />
                </div>
                <div className="col-12 col-md-6">
                  <label className="form-label small mb-1">
                    Tiền phạt mỗi phút đi muộn / về sớm
                    <HelpTip>Mức phạt mới áp dụng cho các bảng lương chưa chốt khi bấm "Tính lại". Bảng lương đã chốt giữ nguyên.</HelpTip>
                  </label>
                  <MoneyInput required value={form.penaltyAmountPerMinute} onChange={(v) => setForm((f) => ({ ...f, penaltyAmountPerMinute: v }))} />
                </div>
              </div>
            </section>

            <section className="border-top pt-3 mt-3">
              <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2">
                <h3 className="h6 mb-0">
                  Vị trí và phạm vi chấm công
                  <HelpTip>
                    Chọn trên bản đồ (bấm hoặc kéo ghim, tìm theo địa chỉ) hoặc nhập vĩ độ, kinh độ. Có vị trí thì lần chấm
                    công ngoài bán kính được gắn cờ cho admin xem; bật "Chặn chấm công QR ngoài bán kính" để không cho chấm.
                  </HelpTip>
                </h3>
                <div className="d-flex align-items-center gap-2">
                  {locating && <span className="small text-muted">Đang dò GPS…</span>}
                  <button type="button" className="btn btn-link btn-sm p-0" disabled={locating} onClick={useMyLocation}>
                    Lấy vị trí hiện tại
                  </button>
                </div>
              </div>
              <div className="row g-2">
                <div className="col-sm-6">
                  <label className="form-label small text-muted mb-1" htmlFor="store-lat">Vĩ độ</label>
                  <input id="store-lat" className="form-control" placeholder="VD 21.0245" value={form.latitude} onChange={setCoordinate("latitude")} />
                </div>
                <div className="col-sm-6">
                  <label className="form-label small text-muted mb-1" htmlFor="store-lng">Kinh độ</label>
                  <input id="store-lng" className="form-control" placeholder="VD 105.8522" value={form.longitude} onChange={setCoordinate("longitude")} />
                </div>
              </div>
              {locationAccuracy !== null &&
                (locationAccuracy <= MAX_GOOD_ACCURACY_METERS ? (
                  <div className="small text-muted mt-1">Vị trí hiện tại, độ chính xác khoảng ±{locationAccuracy} m.</div>
                ) : (
                  <div className="small text-warning-emphasis mt-1">
                    Vị trí lệch ±{locationAccuracy} m (quá {MAX_GOOD_ACCURACY_METERS} m) — kiểm tra và kéo ghim tới đúng cửa hàng.
                    <HelpTip>
                      Máy tính thường không có GPS nên trình duyệt chỉ đoán vị trí theo Wi-Fi/mạng. Muốn lấy vị trí chính xác, mở
                      trang này trên điện thoại khi đang đứng ở cửa hàng rồi bấm "Lấy vị trí hiện tại".
                    </HelpTip>
                  </div>
                ))}
              <StoreLocationMap
                latitude={form.latitude}
                longitude={form.longitude}
                radiusMeters={form.checkInRadiusMeters}
                focusKey={mapFocusKey}
                onPick={pickLocation}
                onSearchError={notifyError}
              />
              {/* Công tắc trên, ô bán kính dưới — cùng kiểu khối Wi-Fi bên dưới */}
              <div className="form-check form-switch mt-3">
                <input
                  id="radius-enforced"
                  type="checkbox"
                  className="form-check-input"
                  role="switch"
                  checked={form.checkInRadiusEnforced}
                  disabled={!hasLocation && !form.checkInRadiusEnforced}
                  onChange={(e) => setForm((f) => ({ ...f, checkInRadiusEnforced: e.target.checked }))}
                />
                <label className="form-check-label" htmlFor="radius-enforced">Chặn chấm công QR ngoài bán kính</label>
                <HelpTip>
                  Bật: nhân viên quét QR khi đang ở xa cửa hàng hơn bán kính chấm công sẽ không chấm được (trừ hao sai số
                  GPS tối đa 100 m). Tắt: vẫn cho chấm, chỉ gắn cờ "ngoài phạm vi" cho admin xem. Chấm bằng Wi-Fi theo
                  giới hạn riêng bên dưới.
                </HelpTip>
              </div>
              <div className="row g-2 mt-1">
                <div className="col-sm-5 col-md-4">
                  <label className="form-label small text-muted mb-1" htmlFor="store-radius">
                    Bán kính chấm công
                    <HelpTip>
                      Lần chấm công cách vị trí cửa hàng xa hơn bán kính này bị gắn cờ "ngoài phạm vi" cho admin xem — hoặc
                      bị chặn nếu bật "Chặn chấm công QR ngoài bán kính". Từ 10 đến 5000 m.
                    </HelpTip>
                  </label>
                  <div className="input-group">
                    <input
                      id="store-radius"
                      type="number"
                      min="10"
                      max="5000"
                      className="form-control text-end"
                      value={form.checkInRadiusMeters}
                      onChange={set("checkInRadiusMeters")}
                    />
                    <span className="input-group-text">m</span>
                  </div>
                </div>
              </div>
              {!hasLocation && (
                <div className="small text-warning-emphasis mt-2">
                  Cần đặt vị trí cửa hàng mới bật được chặn chấm công ngoài bán kính và chấm công bằng Wi-Fi.
                </div>
              )}
            </section>

            <section className="border-top pt-3 mt-3">
              <h3 className="h6 mb-2">Chấm công bằng Wi-Fi</h3>
              <div className="form-check form-switch">
                <input
                  id="wifi-clocking"
                  type="checkbox"
                  className="form-check-input"
                  role="switch"
                  checked={form.wifiClockingEnabled}
                  disabled={!hasLocation && !form.wifiClockingEnabled}
                  onChange={(e) => setForm((f) => ({ ...f, wifiClockingEnabled: e.target.checked }))}
                />
                <label className="form-check-label" htmlFor="wifi-clocking">Cho phép chấm công bằng Wi-Fi cửa hàng</label>
                <HelpTip>
                  Nhân viên đang dùng Wi-Fi cửa hàng thấy thêm nút chấm công Wi-Fi cạnh nút quét QR (không cần quét mã).
                  Wi-Fi cửa hàng được nhận theo mạng lúc admin đăng nhập gần nhất — hãy đăng nhập khi đang ở cửa hàng.
                  Khi chấm bằng Wi-Fi, điện thoại còn phải ở gần cửa hàng (theo GPS) trong phạm vi bên dưới.
                </HelpTip>
              </div>
              {form.wifiClockingEnabled && (
                <div className="row g-2 mt-1">
                  <div className="col-sm-5 col-md-4">
                    <label className="form-label small text-muted mb-1" htmlFor="wifi-distance">
                      Khoảng cách tối đa khi chấm Wi-Fi
                      <HelpTip>
                        Wi-Fi cửa hàng được nhận theo IP lúc admin đăng nhập, nên nếu admin đăng nhập ở nơi khác (nhà, quán cà
                        phê) thì mạng đó cũng bị coi là Wi-Fi cửa hàng. Kiểm tra thêm khoảng cách GPS để người dùng chung mạng
                        ở nơi khác không chấm công được. Nên đặt 100–300 m (GPS trong nhà thường lệch vài chục mét).
                      </HelpTip>
                    </label>
                    <div className="input-group">
                      <input
                        id="wifi-distance"
                        type="number"
                        min="20"
                        max="5000"
                        step="10"
                        required
                        className="form-control text-end"
                        value={form.wifiMaxDistanceMeters}
                        onChange={set("wifiMaxDistanceMeters")}
                      />
                      <span className="input-group-text">m</span>
                    </div>
                  </div>
                  <div className="col-12 small text-muted">
                    {wifiNetwork ? (
                      <>
                        Wi-Fi hiện tại: <span className="font-monospace text-body">{wifiNetwork.ipAddress}</span>
                        <HelpTip>
                          Nhận lúc {fmtDateTime(wifiNetwork.detectedAt)}
                          {wifiNetwork.detectedByName ? `, khi ${wifiNetwork.detectedByName} đăng nhập` : ""}.
                        </HelpTip>
                      </>
                    ) : (
                      <span className="text-warning-emphasis">Chưa nhận được Wi-Fi — admin đăng nhập lại khi đang ở cửa hàng.</span>
                    )}
                  </div>
                </div>
              )}
            </section>

            <div className="d-flex justify-content-end border-top pt-3 mt-3">
              <button type="submit" className="btn btn-primary" disabled={saving}>Lưu thiết lập</button>
            </div>
          </div>
        </form>
      </div>

      <div className="col-12 col-xl-4">
        <StoreQrCard store={store} />
      </div>
    </div>
  );
}

// Mã QR trỏ tới /s/<id> của chính website này — in ra dán tại quầy.
function StoreQrCard({ store }) {
  const [dataUrl, setDataUrl] = useState("");
  const url = `${window.location.origin}/s/${store.id}`;

  useEffect(() => {
    QRCode.toDataURL(url, { width: 480, margin: 2 }).then(setDataUrl).catch(() => setDataUrl(""));
  }, [url]);

  function print() {
    const w = window.open("", "_blank", "width=480,height=640");
    if (!w) return;
    w.document.write(
      `<html><head><title>QR</title></head>` +
        `<body style="font-family:sans-serif;text-align:center;padding:24px">` +
        `<h2></h2><img src="${dataUrl}" style="width:360px"/><p>Quét mã để chấm công</p></body></html>`
    );
    w.document.querySelector("h2").textContent = store.name; // textContent: tránh chèn HTML từ tên cửa hàng
    w.document.close();
    w.focus();
    w.print();
  }

  return (
    <div className="card h-100">
      <div className="card-body text-center">
        <h2 className="h6">Mã QR chấm công</h2>
        {dataUrl ? <img src={dataUrl} alt="Mã QR cửa hàng" className="store-qr-img" /> : <p className="text-muted">Đang tạo mã...</p>}
        <div className="small text-muted text-break mt-2">{url}</div>
        <div className="d-flex justify-content-center gap-2 mt-3">
          <a className={`btn btn-outline-secondary btn-sm ${dataUrl ? "" : "disabled"}`} href={dataUrl} download={`qr-${store.name}.png`}>Tải ảnh</a>
          <button type="button" className="btn btn-primary btn-sm" onClick={print} disabled={!dataUrl}>In</button>
        </div>
      </div>
    </div>
  );
}
