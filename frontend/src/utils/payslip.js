// Phiếu lương 1 nhân viên (chi tiết từng ngày trong bảng lương): xuất file CSV
// (mở được bằng Excel) và in / lưu PDF qua hộp in của trình duyệt. Làm ngay ở
// trình duyệt từ dữ liệu đã tải (serializePaysheetDetail) — không cần gọi API.
import { fmtMinutes, fmtMoney, fmtTime, monthLabel } from "./format.js";

const dmy = (dateKey) => dateKey.split("-").reverse().join("/");

// Chống "CSV injection": ô bắt đầu bằng = + - @ bị Excel hiểu là công thức
function csvCell(v) {
  let s = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return `"${s.replace(/"/g, '""')}"`;
}

const fileSlug = (text) =>
  String(text).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D")
    .replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase();

// detail: 1 dòng của bảng lương; month: 'YYYY-MM'; statusLabel: "Nháp" / "Đã chốt"...
export function downloadPayslipCsv(detail, { month, statusLabel }) {
  const lines = [
    [`Phiếu lương ${monthLabel(month).toLowerCase()}`],
    ["Nhân viên", detail.fullName],
    ["Chức danh", detail.jobTitle || ""],
    ["Trạng thái bảng lương", statusLabel || ""],
    ["Lương giờ", detail.hourlyWage],
    [],
    ["Ngày", "Vào", "Ra", "Giờ làm (h)", "Muộn (phút)", "Về sớm (phút)", "Lương gộp", "Tiền phạt", "Thực nhận"],
    ...detail.dailyBreakdown.map((d) => [
      dmy(d.workDate),
      d.checkInTime ? fmtTime(d.checkInTime) : "",
      d.isMissingCheckOut ? "thiếu" : d.checkOutTime ? fmtTime(d.checkOutTime) : "",
      (d.workedMinutes / 60).toFixed(2),
      d.lateMinutes || "",
      d.earlyLeaveMinutes || "",
      d.grossSalary,
      d.penaltyAmount || "",
      d.netSalary,
    ]),
    [
      "Tổng cộng", "", "", (detail.workedMinutes / 60).toFixed(2), detail.lateMinutes, detail.earlyLeaveMinutes,
      detail.grossSalary, detail.penaltyAmount, detail.netSalary,
    ],
  ];
  const csv = "﻿" + lines.map((row) => row.map(csvCell).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `phieu-luong-${month}-${fileSlug(detail.fullName)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// Mở trang in phiếu lương — chọn "Lưu dưới dạng PDF" trong hộp in để ra file PDF
export function printPayslip(detail, { month, statusLabel, storeName }) {
  const w = window.open("", "_blank", "width=860,height=900");
  if (!w) return false;
  const zeroBlank = (n, fmt) => (n > 0 ? fmt(n) : "");
  const rows = detail.dailyBreakdown
    .map((d) => `<tr>
      <td>${esc(dmy(d.workDate))}</td>
      <td>${esc(d.checkInTime ? fmtTime(d.checkInTime) : "")}</td>
      <td>${d.isMissingCheckOut ? "thiếu" : esc(d.checkOutTime ? fmtTime(d.checkOutTime) : "")}</td>
      <td class="n">${esc(fmtMinutes(d.workedMinutes))}</td>
      <td class="n">${esc(zeroBlank(d.lateMinutes, (v) => `${v}p`))}</td>
      <td class="n">${esc(zeroBlank(d.earlyLeaveMinutes, (v) => `${v}p`))}</td>
      <td class="n">${esc(fmtMoney(d.grossSalary))}</td>
      <td class="n">${esc(zeroBlank(d.penaltyAmount, (v) => `−${fmtMoney(v)}`))}</td>
      <td class="n">${esc(fmtMoney(d.netSalary))}</td></tr>`)
    .join("");

  w.document.write(`<!doctype html><html lang="vi"><head><meta charset="utf-8">
<title>Phieu luong ${esc(month)} - ${esc(fileSlug(detail.fullName))}</title>
<style>
  body{font-family:Arial,sans-serif;color:#222;margin:24px;font-size:13px}
  h1{font-size:18px;text-align:center;margin:0 0 4px}
  .sub{text-align:center;color:#666;margin-bottom:16px}
  .info{display:flex;justify-content:space-between;gap:24px;margin-bottom:14px;line-height:1.7}
  table{width:100%;border-collapse:collapse}
  th,td{border:1px solid #ccc;padding:4px 6px}
  th{background:#f0f3f7;text-align:left}
  .n{text-align:right}
  tfoot td{font-weight:bold;background:#fafbfc}
  .net{font-size:15px;font-weight:bold}
  .sign{display:flex;justify-content:space-around;margin-top:48px;text-align:center}
  @media print{body{margin:12mm}}
</style></head><body>
<h1>PHIẾU LƯƠNG ${esc(monthLabel(month).toUpperCase())}</h1>
<div class="sub">${esc(storeName || "")}${storeName && statusLabel ? " · " : ""}${esc(statusLabel ? `Bảng lương: ${statusLabel}` : "")}</div>
<div class="info">
  <div>Nhân viên: <b>${esc(detail.fullName)}</b><br>Chức danh: ${esc(detail.jobTitle || "—")}<br>Lương giờ: ${esc(fmtMoney(detail.hourlyWage))}</div>
  <div>Ngày công: <b>${detail.workedDays ?? detail.dailyBreakdown.length}</b> · Giờ làm: <b>${esc(fmtMinutes(detail.workedMinutes))}</b><br>
  Lương gộp: ${esc(fmtMoney(detail.grossSalary))} · Phạt: −${esc(fmtMoney(detail.penaltyAmount))}<br>
  <span class="net">Thực nhận: ${esc(fmtMoney(detail.netSalary))}</span></div>
</div>
<table>
  <thead><tr><th>Ngày</th><th>Vào</th><th>Ra</th><th class="n">Giờ làm</th><th class="n">Muộn</th><th class="n">Sớm</th>
  <th class="n">Gộp</th><th class="n">Phạt</th><th class="n">Thực nhận</th></tr></thead>
  <tbody>${rows || '<tr><td colspan="9">Không có ngày công.</td></tr>'}</tbody>
  <tfoot><tr><td colspan="3">Tổng cộng</td><td class="n">${esc(fmtMinutes(detail.workedMinutes))}</td>
  <td class="n">${detail.lateMinutes ? `${detail.lateMinutes}p` : ""}</td><td class="n">${detail.earlyLeaveMinutes ? `${detail.earlyLeaveMinutes}p` : ""}</td>
  <td class="n">${esc(fmtMoney(detail.grossSalary))}</td><td class="n">${detail.penaltyAmount ? `−${esc(fmtMoney(detail.penaltyAmount))}` : ""}</td>
  <td class="n">${esc(fmtMoney(detail.netSalary))}</td></tr></tfoot>
</table>
<div class="sign"><div>Người lập phiếu<br><br><br>&nbsp;</div><div>Nhân viên<br><br><br>${esc(detail.fullName)}</div></div>
</body></html>`);
  w.document.close();
  w.focus();
  w.print();
  return true;
}
