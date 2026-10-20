// Chuyển dòng dữ liệu DB (snake_case, NUMERIC dạng chuỗi) sang JSON trả về API
// (camelCase, số thật). Dùng chung cho nhiều service.
const hhmm = (time) => (time == null ? null : String(time).slice(0, 5));
const toNumber = (value) => (value == null ? null : Number(value));

export function serializeAccount(a) {
  return {
    id: a.id,
    storeId: a.store_id,
    fullName: a.full_name,
    email: a.email,
    role: a.role,
    isActive: a.is_active,
    createdAt: a.created_at,
  };
}

export function serializeEmployee(e) {
  return {
    id: e.id,
    accountId: e.account_id,
    fullName: e.full_name,
    email: e.email,
    role: e.role,
    phoneNumber: e.phone_number,
    jobTitle: e.job_title,
    hourlyWage: toNumber(e.hourly_wage),
    isActive: e.is_active,
    createdAt: e.created_at,
  };
}

export function serializeStore(s) {
  return {
    id: s.id,
    name: s.name,
    address: s.address,
    ownerPhoneNumber: s.owner_phone_number,
    maxEmployeeCount: s.max_employee_count,
    expiryDate: s.expiry_date, // 'YYYY-MM-DD' hoặc null (không thời hạn)
    isActive: s.is_active,
    createdAt: s.created_at,
  };
}

export function serializeSetting(s) {
  return {
    shiftStartTime: hhmm(s.shift_start_time),
    shiftEndTime: hhmm(s.shift_end_time),
    penaltyAmountPerMinute: toNumber(s.penalty_amount_per_minute),
    latitude: s.latitude,
    longitude: s.longitude,
    checkInRadiusMeters: s.check_in_radius_meters,
    updatedAt: s.updated_at,
  };
}

export function serializeClocking(c) {
  return {
    id: c.id,
    workDate: c.work_date,
    shiftStartTime: hhmm(c.shift_start_time),
    shiftEndTime: hhmm(c.shift_end_time),
    checkInTime: c.check_in_time,
    checkOutTime: c.check_out_time,
    workedMinutes: c.worked_minutes,
    lateMinutes: c.late_minutes,
    earlyLeaveMinutes: c.early_leave_minutes,
    isMissingCheckOut: c.is_missing_check_out,
    isOutOfRange: c.is_out_of_range,
  };
}

// withLocation = false: ẩn toạ độ (màn của nhân viên không cần)
export function serializeClockingHistory(h, { withLocation = true } = {}) {
  return {
    id: h.id,
    actionType: h.action_type,
    clockTime: h.clock_time,
    source: h.source,
    status: h.status,
    isOutOfRange: h.is_out_of_range,
    replacedHistoryId: h.replaced_history_id,
    ...(withLocation
      ? {
          latitude: h.latitude,
          longitude: h.longitude,
          gpsAccuracyMeters: h.gps_accuracy_meters,
          distanceToStoreMeters: h.distance_to_store_meters,
        }
      : {}),
  };
}

export function serializePaysheet(p) {
  return {
    id: p.id,
    payMonth: p.pay_month,
    status: p.status,
    penaltyAmountPerMinute: toNumber(p.penalty_amount_per_minute),
    employeeCount: p.employee_count,
    totalWorkedMinutes: p.total_worked_minutes,
    totalGrossSalary: toNumber(p.total_gross_salary),
    totalPenaltyAmount: toNumber(p.total_penalty_amount),
    totalNetSalary: toNumber(p.total_net_salary),
    calculatedAt: p.calculated_at,
    createdAt: p.created_at,
    createdByName: p.created_by_name ?? null,
    finalizedAt: p.finalized_at,
    finalizedByName: p.finalized_by_name ?? null,
    cancelledAt: p.cancelled_at,
    cancelledByName: p.cancelled_by_name ?? null,
    cancelReason: p.cancel_reason,
  };
}

export function serializePaysheetDetail(d) {
  return {
    id: d.id,
    employeeId: d.employee_id,
    fullName: d.full_name,
    jobTitle: d.job_title,
    hourlyWage: toNumber(d.hourly_wage),
    workedDays: d.worked_days,
    workedMinutes: d.worked_minutes,
    lateMinutes: d.late_minutes,
    earlyLeaveMinutes: d.early_leave_minutes,
    missingCheckOutDays: d.missing_check_out_days,
    grossSalary: toNumber(d.gross_salary),
    penaltyAmount: toNumber(d.penalty_amount),
    netSalary: toNumber(d.net_salary),
    dailyBreakdown: d.daily_breakdown,
  };
}

export function serializeDocument(d) {
  return {
    id: d.id,
    title: d.title,
    category: d.category,
    originalFileName: d.original_file_name,
    isSensitive: d.is_sensitive,
    processingStatus: d.processing_status,
    uploadedByName: d.uploaded_by_name ?? null,
    chunkCount: d.chunk_count ?? 0,
    createdAt: d.created_at,
  };
}
