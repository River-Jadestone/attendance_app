// Code.gs (수정 버전 - 개선 적용)
// ----------------- 설정 -----------------
const SPREADSHEET_ID = "0000"; // <<<--- 여기에 실제 스프레드시트 ID를 입력하세요.
const SHEETS = {
  STUDENT: "학생정보",
  SUBJECT: "과목정보",
  PAYMENT: "납부내역",
  REGISTRATION: "수강신청",
  ATTENDANCE: "출결",
  PROGRESS: "진도",
  FAMILY: "가족그룹",
  SETTINGS: "설정"
};

// 글로벌 ss 캐싱 (성능 개선)
let cachedSS = null;
function getSpreadsheet() {
  if (!cachedSS) {
    cachedSS = SpreadsheetApp.openById(SPREADSHEET_ID);
  }
  return cachedSS;
}

// ----------------- 웹 앱 진입점 -----------------
function doGet(e) {
  try {
    return HtmlService.createTemplateFromFile('index').evaluate().setTitle('학생 관리 시스템').addMetaTag('viewport', 'width=device-width, initial-scale=1');
  } catch (err) {
    Logger.log("doGet Error: " + err.message + " | Stack: " + err.stack);
    return HtmlService.createHtmlOutput("<h1>Script Error</h1><p>Could not load the application. Please contact support.</p><p>" + err.message + "</p>");
  }
}
function include(filename) {
  try {
    return HtmlService.createHtmlOutputFromFile(filename).getContent();
  } catch (err) {
    Logger.log("Include Error (" + filename + "): " + err.message);
    return '';
  }
}
// ----------------- 데이터 조회 함수 -----------------
function getDashboardData() {
  try {
    const ss = getSpreadsheet();
    const studentSheet = ss.getSheetByName(SHEETS.STUDENT);
    const studentData = studentSheet.getDataRange().getValues();
    const headers = studentData.shift();
    const statusIndex = headers.indexOf("상태");
    const regDateIndex = headers.indexOf("등록일");
    const statusDateIndex = headers.indexOf("상태 변경일");
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth();
    let activeStudents = 0;
    let monthlyNewStudents = 0;
    let monthlyBreakStudents = 0;
    studentData.forEach(row => {
      if (row[statusIndex] === '재원') activeStudents++;
      const regDateValue = row[regDateIndex];
      if (regDateValue) {
        try {
          const regDate = new Date(regDateValue);
          if (!isNaN(regDate) && regDate.getFullYear() === currentYear && regDate.getMonth() === currentMonth) {
            monthlyNewStudents++;
          }
        } catch(dateError) { /* 날짜 변환 오류 무시 */ }
      }
      const statusDateValue = row[statusDateIndex];
      if (statusDateValue) {
        try {
          const statusDate = new Date(statusDateValue);
          if (!isNaN(statusDate) && row[statusIndex] === '휴회' && statusDate.getFullYear() === currentYear && statusDate.getMonth() === currentMonth) {
            monthlyBreakStudents++;
          }
        } catch(dateError) { /* 날짜 변환 오류 무시 */ }
      }
    });
    return {
      activeStudents: activeStudents,
      monthlyNewStudents: monthlyNewStudents,
      monthlyBreakStudents: monthlyBreakStudents
    };
  } catch (e) {
    Logger.log("getDashboardData 오류: " + e.message + " | Stack: " + e.stack);
    return { activeStudents: '-', monthlyNewStudents: '-', monthlyBreakStudents: '-' };
  }
}
// null 반환 방지 + JSON 반환 searchStudent 함수
function searchStudent(name) {
  let results = [];
  try {
    const ss = getSpreadsheet();
    const studentSheet = ss.getSheetByName(SHEETS.STUDENT);
    if (!name || !studentSheet) return JSON.stringify([]);
    const studentData = studentSheet.getDataRange().getValues();
    if (studentData.length < 2) return JSON.stringify([]);
    const headers = studentData.shift();
    const nameIndex = headers.indexOf("이름");
    if (nameIndex === -1) return JSON.stringify([]);
    const searchTermLower = name.toLowerCase();
    studentData.forEach((row) => {
      if (row.every(cell => cell === "")) return;
      const studentName = row[nameIndex];
      if (studentName && typeof studentName.toString === 'function') {
        if (studentName.toString().toLowerCase().includes(searchTermLower)) {
          const student = {};
          headers.forEach((header, i) => { if(header) student[header] = row[i]; });
          results.push(student);
        }
      }
    });
    return JSON.stringify(results);
  } catch (e) {
    Logger.log("[심각] searchStudent 오류: " + e.message + "\n" + e.stack);
    return JSON.stringify([]);
  }
}
// 전체 학생 보기 함수
function getAllStudents() {
  let results = [];
  try {
    const ss = getSpreadsheet();
    const studentSheet = ss.getSheetByName(SHEETS.STUDENT);
    if (!studentSheet) return JSON.stringify([]);
    const studentData = studentSheet.getDataRange().getValues();
    if (studentData.length < 2) return JSON.stringify([]);
    const headers = studentData.shift();
    studentData.forEach((row) => {
      if (row.every(cell => cell === "")) return;
      const student = {};
      headers.forEach((header, i) => { if(header && i < row.length) student[header] = row[i]; else if (header) student[header] = ""; });
      results.push(student);
    });
    return JSON.stringify(results);
  } catch (e) {
    Logger.log("[심각] getAllStudents 오류: " + e.message + "\n" + e.stack);
    return JSON.stringify([]);
  }
}
// 안정화된 getStudentDetails 함수 (null 절대 반환 방지)
function getStudentDetails(studentId) {
  let details = { info: null, payments: [], attendance: [], progress: [], error: false, message: "" };
  try {
    const ss = getSpreadsheet();
    if (!ss) throw new Error("스프레드시트를 열 수 없습니다.");
    details.info = getStudentInfo_(ss, studentId);
    // info가 null이면 오류로 처리하고 바로 반환 (학생 정보 못 찾는 경우)
    if (!details.info) {
      details.error = true;
      details.message = `학생 정보(ID: ${studentId})를 찾을 수 없습니다.`;
      Logger.log(details.message); // 로그 기록
      return details; // ★★★ 여기서 details 객체 반환 ★★★
    }
    // 나머지 데이터는 오류 발생해도 빈 배열로 처리하고 계속 진행
    try { details.payments = getDataByStudentId_(ss, SHEETS.PAYMENT, studentId) || []; } catch (e) { Logger.log(`납부 내역 오류 무시: ${e.message}`); details.payments = [];}
    try { details.attendance = getAttendanceEvents_(ss, studentId) || []; } catch (e) { Logger.log(`출결 오류 무시: ${e.message}`); details.attendance = [];}
    try { details.progress = getProgressDataWithSubjectName_(ss, studentId) || []; } catch (e) { Logger.log(`진도 오류 무시: ${e.message}`); details.progress = [];}
    // 출석 통계 추가
    try { details.stats = getAttendanceStats(ss, studentId) || {}; } catch (e) { Logger.log(`통계 오류 무시: ${e.message}`); details.stats = {}; }
    return details; // ★★★ 최종 성공 시 details 객체 반환 ★★★
  } catch (e) {
    Logger.log(`[심각] getStudentDetails 오류: ${e.message}\n${e.stack} | StudentID: ${studentId}`);
    details.error = true;
    details.message = "상세 정보 로딩 중 서버 오류: " + e.message;
    // catch 블록에서도 details 객체 반환 (null 방지)
    details.payments = details.payments || []; details.attendance = details.attendance || []; details.progress = details.progress || []; details.stats = {};
    return details; // ★★★ 여기서 details 객체 반환 ★★★
  }
}
// (getSubjects, getFamilyGroups 등 나머지 조회 함수는 이전과 동일)
function getSubjects() { 
  try{ 
    const ss = getSpreadsheet(); 
    const subjectSheet = ss.getSheetByName(SHEETS.SUBJECT); 
    const data = subjectSheet.getDataRange().getValues(); 
    const headers = data.shift(); 
    return data.map(row => { 
      const subject = {}; 
      headers.forEach((h, i) => { if(h) subject[h] = row[i]; }); 
      return subject; 
    }); 
  } catch (e) { 
    Logger.log("getSubjects 오류: " + e.message); 
    return []; 
  } 
}
function getFamilyGroups() { 
  try { 
    const ss = getSpreadsheet(); 
    const familySheet = ss.getSheetByName(SHEETS.FAMILY); 
    if (!familySheet) return []; 
    return familySheet.getDataRange().getValues(); 
  } catch (e) { 
    Logger.log("getFamilyGroups 오류: " + e.message); 
    return []; 
  } 
}
// 추가: 출석 통계 함수
function getAttendanceStats(ss, studentId) {
  try {
    const [headers, filteredData] = filterSheetByColumnValue_(ss, SHEETS.ATTENDANCE, "학생ID", studentId);
    if (headers.length === 0 || filteredData.length === 0) return { total: 0, attended: 0, absent: 0, rate: 0 };
    const statusIndex = headers.indexOf("출결 상태");
    if (statusIndex === -1) return { total: 0, attended: 0, absent: 0, rate: 0 };
    let attended = 0, absent = 0;
    filteredData.forEach(row => {
      const status = row[statusIndex];
      if (status === '출석' || status === '보강') attended++;
      else if (status === '결석') absent++;
    });
    const total = attended + absent;
    const rate = total > 0 ? Math.round((attended / total) * 100) : 0;
    return { total, attended, absent, rate };
  } catch (e) {
    Logger.log(`getAttendanceStats 오류: ${e.message}`);
    return { total: 0, attended: 0, absent: 0, rate: 0 };
  }
}
// ----------------- 데이터 생성/수정 함수 (이전과 동일) -----------------
function addStudent(studentInfo) { 
  try { 
    const ss = getSpreadsheet(); 
    const studentSheet = ss.getSheetByName(SHEETS.STUDENT); 
    const familySheet = ss.getSheetByName(SHEETS.FAMILY); 
    const lock = LockService.getScriptLock();
    lock.waitLock(10000); // ID 생성 락 (동시성 방지)
    const newId = getNextStudentId_(ss); 
    lock.releaseLock();
    let familyGroupId = studentInfo.familyGroupId; 
    if (familyGroupId === '__NEW__') { 
      familyGroupId = "F" + new Date().getTime(); 
      familySheet.appendRow([familyGroupId, studentInfo.newFamilyGroupDesc]); 
    } 
    const headers = studentSheet.getRange(1, 1, 1, studentSheet.getLastColumn()).getValues()[0]; 
    const newRow = Array(headers.length).fill(''); 
    newRow[headers.indexOf("학생ID")] = newId; 
    newRow[headers.indexOf("이름")] = studentInfo.name; 
    newRow[headers.indexOf("나이")] = studentInfo.age; 
    newRow[headers.indexOf("학교")] = studentInfo.school; 
    newRow[headers.indexOf("가족 그룹 ID")] = familyGroupId; 
    newRow[headers.indexOf("상태")] = '재원'; 
    newRow[headers.indexOf("등록일")] = new Date(); 
    newRow[headers.indexOf("상태 변경일")] = new Date(); 
    studentSheet.appendRow(newRow); 
    return { success: true, message: "학생이 성공적으로 추가되었습니다." }; 
  } catch (e) { 
    Logger.log("addStudent 오류: " + e.message); 
    return { success: false, message: "오류 발생: " + e.message }; 
  } 
}
function updateStudentInfo(studentData) { 
  try { 
    const ss = getSpreadsheet(); 
    const studentSheet = ss.getSheetByName(SHEETS.STUDENT); 
    const data = studentSheet.getDataRange().getValues(); 
    const headers = data.shift(); 
    const idIndex = headers.indexOf("학생ID"); 
    const rowIndex = data.findIndex(row => row[idIndex] == studentData.studentId); 
    if (rowIndex > -1) { 
      const originalName = data[rowIndex][headers.indexOf("이름")]; 
      const rowToUpdate = studentSheet.getRange(rowIndex + 2, 1, 1, headers.length).getValues()[0]; 
      rowToUpdate[headers.indexOf("이름")] = studentData.이름; 
      rowToUpdate[headers.indexOf("나이")] = studentData.나이; 
      rowToUpdate[headers.indexOf("학교")] = studentData.학교; 
      rowToUpdate[headers.indexOf("가족 그룹 ID")] = studentData['가족 그룹 ID']; 
      rowToUpdate[headers.indexOf("담당 선생님")] = studentData['담당 선생님']; 
      studentSheet.getRange(rowIndex + 2, 1, 1, rowToUpdate.length).setValues([rowToUpdate]); 
      if (originalName !== studentData.이름) { 
        updateStudentNameInOtherSheets_(ss, studentData.studentId, studentData.이름); 
      } 
      return { success: true, message: "정보가 성공적으로 수정되었습니다." }; 
    } else { 
      return { success: false, message: "해당 학생을 찾을 수 없습니다." }; 
    } 
  } catch (e) { 
    Logger.log("updateStudentInfo 오류: " + e.message); 
    return { success: false, message: "수정 중 오류 발생: " + e.message }; 
  } 
}
function updateStudentStatus(studentId, newStatus) { 
  try { 
    const ss = getSpreadsheet(); 
    const studentSheet = ss.getSheetByName(SHEETS.STUDENT); 
    const data = studentSheet.getDataRange().getValues(); 
    const headers = data.shift(); 
    const idIndex = headers.indexOf("학생ID"); 
    const statusIndex = headers.indexOf("상태"); 
    const statusDateIndex = headers.indexOf("상태 변경일"); 
    if (statusIndex === -1 || statusDateIndex === -1) { 
      return { success: false, message: "'상태' 또는 '상태 변경일' 열을 찾을 수 없습니다." }; 
    } 
    const rowIndex = data.findIndex(row => row[idIndex] == studentId); 
    if (rowIndex > -1) { 
      const sheetRowIndex = rowIndex + 2; 
      studentSheet.getRange(sheetRowIndex, statusIndex + 1).setValue(newStatus); 
      studentSheet.getRange(sheetRowIndex, statusDateIndex + 1).setValue(new Date()); 
      return { success: true, message: `학생 상태가 '${newStatus}'(으)로 변경되었습니다.` }; 
    } else { 
      return { success: false, message: "해당 학생을 찾을 수 없습니다." }; 
    } 
  } catch (e) { 
    Logger.log("updateStudentStatus 오류: " + e.message); 
    return { success: false, message: "상태 변경 중 오류 발생: " + e.message }; 
  } 
}
function calculateTuitionFee(data) { 
  try { 
    const ss = getSpreadsheet(); 
    const { studentId, subjectId, months } = data; 
    const subjectInfo = getSubjects().find(s => s.과목ID == subjectId); 
    if (!subjectInfo) return { success: false, message: "과목 정보 없음" }; 
    const studentInfo = getStudentInfo_(ss, studentId); 
    if (!studentInfo) return { success: false, message: "학생 정보 없음" }; 
    const parseNumber = (value) => parseFloat(String(value).replace(/[^\d.-]/g, '')) || 0; 
    const monthlyFee = parseNumber(subjectInfo.월수강료); 
    if (monthlyFee === 0) throw new Error("월수강료가 0이거나 숫자가 아닙니다."); 
    let baseFee = monthlyFee * parseInt(months, 10); 
    let discountAmount = 0; 
    let discountReason = []; 
    let isSiblingDiscountApplicable = false; 
    let siblingMonthlyDiscount = 0; 
    const familyGroupId = studentInfo['가족 그룹 ID']; 
    if (familyGroupId) { 
      const studentSheet = ss.getSheetByName(SHEETS.STUDENT); 
      const studentData = studentSheet.getDataRange().getValues(); 
      if (studentData.filter(row => row[4] === familyGroupId && row[0] !== studentId).length > 0) { 
        const settingsSheet = ss.getSheetByName(SHEETS.SETTINGS); 
        siblingMonthlyDiscount = parseNumber(settingsSheet.getRange("B2").getValue()); 
        if (siblingMonthlyDiscount > 0) { 
          isSiblingDiscountApplicable = true; 
        } 
      } 
    } 
    if (isSiblingDiscountApplicable) { 
      discountAmount = siblingMonthlyDiscount * parseInt(months, 10); 
      discountReason.push(`형제 할인 (${siblingMonthlyDiscount}원/월 * ${months}개월)`); 
    } else { 
      const discountRate3 = parseNumber(subjectInfo['3개월 할인율']); 
      const discountRate12 = parseNumber(subjectInfo['12개월 할인율']); 
      if (months == 3 && discountRate3 > 0) { 
        discountAmount += baseFee * discountRate3; 
        discountReason.push(`3개월 할인 (${discountRate3 * 100}%)`); 
      } 
      if (months == 12 && discountRate12 > 0) { 
        discountAmount += baseFee * discountRate12; 
        discountReason.push(`12개월 할인 (${discountRate12 * 100}%)`); 
      } 
    } 
    const finalAmount = baseFee - discountAmount; 
    return { success: true, finalAmount: finalAmount, details: discountReason.join(', ') }; 
  } catch (e) { 
    Logger.log("calculateTuitionFee 오류: " + e.message); 
    return { success: false, message: e.message }; 
  } 
}
function calculateAndRecordPayment(paymentData) { 
  try { 
    const calculationResult = calculateTuitionFee(paymentData); 
    if (!calculationResult.success) throw new Error(calculationResult.message); 
    const { studentId, studentName, subjectId, months } = paymentData; 
    const finalAmount = calculationResult.finalAmount; 
    const details = calculationResult.details; 
    const ss = getSpreadsheet(); 
    const subjectInfo = getSubjects().find(s => s.과목ID == subjectId); 
    ss.getSheetByName(SHEETS.PAYMENT).appendRow([ "P" + new Date().getTime(), studentId, studentName, new Date(), finalAmount, paymentData.paymentMethod, paymentData.cardCompany, `[${subjectInfo.과목명}/${months}개월] ${details}` ]); 
    ss.getSheetByName(SHEETS.REGISTRATION).appendRow([ "R" + new Date().getTime(), studentId, studentName, subjectId, new Date().getMonth() + 1 ]); 
    return { success: true, message: "납부 처리가 완료되었습니다." }; 
  } catch (e) { 
    Logger.log("calculateAndRecordPayment 오류: " + e.message); 
    return { success: false, message: "오류 발생: " + e.message }; 
  } 
}
function recordAttendanceAndProgress(recordData) { 
  try { 
    const ss = getSpreadsheet(); 
    const { studentId, studentName, classDate, attendanceStatus, subjectId, classContent, teacherName } = recordData; 
    const classDateObj = new Date(classDate + 'T00:00:00Z'); // ISO 날짜 보정 (timezone 문제 방지)
    if (isNaN(classDateObj)) throw new Error("유효하지 않은 날짜 형식입니다.");
    ss.getSheetByName(SHEETS.ATTENDANCE).appendRow([ "A" + new Date().getTime(), studentId, studentName, classDateObj, attendanceStatus ]); 
    if (attendanceStatus === "출석") { // 서버 측 검증 추가
      if (!subjectId) throw new Error("출석 시 과목이 필수입니다.");
      ss.getSheetByName(SHEETS.PROGRESS).appendRow([ "PG" + new Date().getTime(), studentId, studentName, classDateObj, subjectId, classContent, teacherName ]); 
    } 
    return { success: true, message: "출결 및 진도 기록이 완료되었습니다." }; 
  } catch (e) { 
    Logger.log("recordAttendanceAndProgress 오류: " + e.message); 
    return { success: false, message: "기록 중 오류 발생: " + e.message }; 
  } 
}
// ----------------- 내부 헬퍼 함수 (안정화 버전) -----------------
function filterSheetByColumnValue_(ss, sheetName, columnName, value) {
  try {
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) return [[], []];
    const dataRange = sheet.getDataRange();
    if (dataRange.getNumRows() <= 1) return [[], []];
    const values = dataRange.getValues();
    const headers = values.shift() || [];
    const columnIndex = headers.indexOf(columnName);
    if (columnIndex === -1) return [headers, []];
    const filteredData = values.filter(row => row[columnIndex] == value);
    return [headers, filteredData];
  } catch (e) {
    Logger.log(`[헬퍼 심각] filterSheetByColumnValue_ (${sheetName}) 오류: ${e.message}`);
    return [[], []];
  }
}
function getStudentInfo_(ss, studentId) {
  try {
    const studentSheet = ss.getSheetByName(SHEETS.STUDENT);
    if (!studentSheet) return null;
    const studentData = studentSheet.getDataRange().getValues();
    if (studentData.length < 2) return null;
    const headers = studentData.shift();
    const idIndex = headers.indexOf("학생ID");
    if (idIndex === -1) return null;
    const studentInfoRow = studentData.find(row => {
      const rowId = row[idIndex];
      Logger.log(`Comparing ID: input '${studentId}' (type: ${typeof studentId}) vs row '${rowId}' (type: ${typeof rowId})`);
      return rowId == studentId;  // === -> == 로 변경 (타입 무시 비교)
    });
    if (!studentInfoRow) {
      Logger.log(`[경고] Student not found for ID: ${studentId}`);
      return null;
    }
    const studentInfo = {};
    headers.forEach((header, i) => { if(header && i < studentInfoRow.length) studentInfo[header] = studentInfoRow[i]; else if(header) studentInfo[header] = ""; });
    return studentInfo;
  } catch (e) {
    Logger.log(`[헬퍼 심각] getStudentInfo_ 오류: ${e.message}\nStack: ${e.stack} | StudentID: ${studentId}`);
    return null;
  }
}
function getAttendanceEvents_(ss, studentId) {
  try {
    const [headers, filteredData] = filterSheetByColumnValue_(ss, SHEETS.ATTENDANCE, "학생ID", studentId);
    if (headers.length === 0 || filteredData.length === 0) return [];
    const dateIndex = headers.indexOf("출석 날짜");
    const statusIndex = headers.indexOf("출결 상태");
    if (dateIndex === -1 || statusIndex === -1) return [];
    const events = filteredData.map(row => {
      const status = row[statusIndex];
      let color = 'gray';
      if (status === '출석') color = '#28a745';
      else if (status === '결석') color = '#dc3545';
      else if (status === '보강') color = '#007bff';
      const dateValue = row[dateIndex];
      const date = (dateValue instanceof Date && !isNaN(dateValue)) ? dateValue : null;
      if (!date) return null;
      return { title: status, date: Utilities.formatDate(date, "UTC", "yyyy-MM-dd"), color: color };
    }).filter(event => event !== null);
    return events;
  } catch (e) {
    Logger.log(`[헬퍼 심각] getAttendanceEvents_ 오류: ${e.message}`);
    return [];
  }
}
function getProgressDataWithSubjectName_(ss, studentId) {
  try {
    const [headers, filteredData] = filterSheetByColumnValue_(ss, SHEETS.PROGRESS, "학생ID", studentId);
    if (headers.length === 0 || filteredData.length === 0) return [];
    const allSubjects = getSubjects();
    if (!allSubjects || allSubjects.length === 0) Logger.log("[경고] 과목 정보가 없습니다.");
    const dateHeader = "수업 날짜";
    const dateIndex = headers.indexOf(dateHeader);
    if (dateIndex === -1) { Logger.log("[오류] 진도 시트 날짜 헤더 없음"); return []; }
    const results = filteredData.map(row => {
      const record = {};
      headers.forEach((header, i) => {
        if (!header) return;
        const cellValue = (i < row.length) ? row[i] : "";
        if (header === "과목ID") {
          const subjectId = cellValue;
          const subject = allSubjects.find(s => s.과목ID == subjectId);
          record["과목명"] = subject ? subject.과목명 : "(과목 정보 없음)";
        } else {
          record[header] = (cellValue instanceof Date && !isNaN(cellValue)) ? Utilities.formatDate(cellValue, "GMT+9", "yyyy. MM. dd") : cellValue;
        }
      });
      return record;
    });
    results.sort((a, b) => {
      const dateStrA = a[dateHeader] || "";
      const dateStrB = b[dateHeader] || "";
      const dateA = new Date(typeof dateStrA.replace === 'function' ? dateStrA.replace(/\.\s*/g, '-') : null);
      const dateB = new Date(typeof dateStrB.replace === 'function' ? dateStrB.replace(/\.\s*/g, '-') : null);
      if (isNaN(dateA)) return 1;
      if (isNaN(dateB)) return -1;
      return dateB - dateA;
    });
    return results;
  } catch (e) {
    Logger.log(`[헬퍼 심각] getProgressDataWithSubjectName_ 오류: ${e.message}\nStack: ${e.stack}`);
    return [];
  }
}
function getDataByStudentId_(ss, sheetName, studentId) {
  try{
    const [headers, filteredData] = filterSheetByColumnValue_(ss, sheetName, "학생ID", studentId);
    if (headers.length === 0 || filteredData.length === 0) return [];
    const dateColumn = headers.find(h => h && (h.includes("날짜") || h.includes("납부일")));
    const dateIndex = dateColumn ? headers.indexOf(dateColumn) : -1;
    const results = filteredData.map(row => {
      const record = {};
      headers.forEach((header, i) => {
        if (!header) return;
        const cellValue = (i < row.length) ? row[i] : "";
        record[header] = (cellValue instanceof Date && !isNaN(cellValue)) ? Utilities.formatDate(cellValue, "GMT+9", "yyyy. MM. dd") : cellValue;
      });
      return record;
    });
    if (dateIndex !== -1 && dateColumn) {
      results.sort((a, b) => {
        const dateStrA = a[dateColumn] || "";
        const dateStrB = b[dateColumn] || "";
        const dateA = new Date(typeof dateStrA.replace === 'function' ? dateStrA.replace(/\.\s*/g, '-') : null);
        const dateB = new Date(typeof dateStrB.replace === 'function' ? dateStrB.replace(/\.\s*/g, '-') : null);
        if (isNaN(dateA)) return 1;
        if (isNaN(dateB)) return -1;
        return dateB - dateA;
      });
    }
    return results;
  } catch (e) {
    Logger.log(`[헬퍼 심각] getDataByStudentId_ (${sheetName}) 오류: ${e.message}\nStack: ${e.stack}`);
    return [];
  }
}
// (getNextStudentId_, updateStudentNameInOtherSheets_ 함수는 이전과 동일)
function getNextStudentId_(ss) { 
  try { 
    const studentSheet = ss.getSheetByName(SHEETS.STUDENT); 
    const lastRow = studentSheet.getLastRow(); 
    if (lastRow < 2) return new Date().getFullYear().toString().slice(-2) + "-001"; 
    const lastId = studentSheet.getRange(lastRow, 1).getValue(); 
    const [year, number] = lastId.split('-'); 
    const currentYear = new Date().getFullYear().toString().slice(-2); 
    let nextNumber; 
    if (year == currentYear) { 
      nextNumber = parseInt(number) + 1; 
    } else { 
      nextNumber = 1; 
    } 
    return currentYear + "-" + String(nextNumber).padStart(3, '0'); 
  } catch(e) { 
    Logger.log("getNextStudentId_ 오류: " + e.message); 
    return "ERR-000"; 
  } 
}
function updateStudentNameInOtherSheets_(ss, studentId, newName) { 
  const sheetsToUpdate = [SHEETS.PAYMENT, SHEETS.REGISTRATION, SHEETS.ATTENDANCE, SHEETS.PROGRESS]; 
  sheetsToUpdate.forEach(sheetName => { 
    try { 
      const sheet = ss.getSheetByName(sheetName); 
      if (!sheet) return; 
      const data = sheet.getDataRange().getValues(); 
      const headers = data.shift(); 
      const idIndex = headers.indexOf("학생ID"); 
      const nameIndex = headers.indexOf("학생 이름"); 
      if (idIndex === -1 || nameIndex === -1) return; 
      data.forEach((row, i) => { 
        if (row[idIndex] == studentId) { 
          sheet.getRange(i + 2, nameIndex + 1).setValue(newName); 
        } 
      }); 
    } catch (e) { 
      Logger.log(`updateStudentNameInOtherSheets_ 오류 (${sheetName}): ` + e.message); 
    } 
  }); 
}
