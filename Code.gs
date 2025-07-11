// Code.gs (계산 로직 강화 및 분리)

// ----------------- 설정 -----------------
const SPREADSHEET_ID = "YOUR_SPREADSHEET_ID"; // <<<--- 여기에 실제 스프레드시트 ID를 입력하세요.

// 시트 이름은 상수로 관리하여 오타를 방지합니다.
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


// ----------------- 웹 앱 진입점 -----------------

function doGet(e) {
  return HtmlService.createTemplateFromFile('index')
      .evaluate()
      .setTitle('학생 관리 시스템')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}


// ----------------- 학생 관련 함수 -----------------

function searchStudent(name) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const studentSheet = ss.getSheetByName(SHEETS.STUDENT);
  if (!name || !studentSheet) return [];
  const studentData = studentSheet.getDataRange().getValues();
  const headers = studentData.shift();
  const results = [];
  studentData.forEach(row => {
    const student = {};
    headers.forEach((header, i) => { student[header] = row[i]; });
    if (student["이름"].toString().toLowerCase().includes(name.toLowerCase())) {
      results.push(student);
    }
  });
  return results;
}

function addStudent(studentInfo) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const studentSheet = ss.getSheetByName(SHEETS.STUDENT);
    const newId = "S" + new Date().getTime();
    const familyGroupId = studentInfo.familyGroupId || "F" + new Date().getTime();
    studentSheet.appendRow([ newId, studentInfo.name, studentInfo.age, studentInfo.school, familyGroupId ]);
    return { success: true, message: "학생이 성공적으로 추가되었습니다." };
  } catch (e) {
    return { success: false, message: "오류 발생: " + e.message };
  }
}

function getStudentDetails(studentId) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    return {
      info: getStudentInfo_(ss, studentId),
      registrations: getDataByStudentId_(ss, SHEETS.REGISTRATION, studentId),
      payments: getDataByStudentId_(ss, SHEETS.PAYMENT, studentId),
      attendance: getAttendanceEvents_(ss, studentId),
      progress: getDataByStudentId_(ss, SHEETS.PROGRESS, studentId)
    };
  } catch (e) {
    return { error: true, message: e.message };
  }
}

// ----------------- 교육비 및 과목 관련 함수 -----------------

function getSubjects() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const subjectSheet = ss.getSheetByName(SHEETS.SUBJECT);
  const data = subjectSheet.getDataRange().getValues();
  const headers = data.shift();
  return data.map(row => {
    const subject = {};
    headers.forEach((h, i) => subject[h] = row[i]);
    return subject;
  });
}

/**
 * ★★★★★ 새로 추가된 함수 ★★★★★
 * 교육비를 계산만 하고 결과를 반환합니다. (프론트엔드 미리보기용)
 */
function calculateTuitionFee(data) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const { studentId, subjectId, months } = data;

    const allSubjects = getSubjects();
    const subjectInfo = allSubjects.find(s => s.과목ID == subjectId);
    if (!subjectInfo) return { success: false, message: "과목 정보 없음" };

    const studentInfo = getStudentInfo_(ss, studentId);
    if (!studentInfo) return { success: false, message: "학생 정보 없음" };

    // 월수강료에서 숫자만 추출하여 계산
    const monthlyFee = parseFloat(String(subjectInfo.월수강료).replace(/[^\d.-]/g, ''));
    if (isNaN(monthlyFee)) throw new Error("월수강료가 숫자가 아닙니다.");

    let baseFee = monthlyFee * parseInt(months, 10);
    let discountAmount = 0;
    let discountReason = [];

    // 할인율 적용
    const discountRate3 = parseFloat(subjectInfo['3개월 할인율']);
    const discountRate12 = parseFloat(subjectInfo['12개월 할인율']);
    if (months == 3 && discountRate3 > 0) {
      discountAmount += baseFee * discountRate3;
      discountReason.push(`3개월 할인 (${discountRate3 * 100}%)`);
    }
    if (months == 12 && discountRate12 > 0) {
      discountAmount += baseFee * discountRate12;
      discountReason.push(`12개월 할인 (${discountRate12 * 100}%)`);
    }

    // 형제 할인 적용
    const familyGroupId = studentInfo['가족 그룹 ID'];
    if (familyGroupId) {
      const studentSheet = ss.getSheetByName(SHEETS.STUDENT);
      const studentData = studentSheet.getDataRange().getValues();
      const familyMembers = studentData.filter(row => row[4] === familyGroupId && row[0] !== studentId);
      if (familyMembers.length > 0) {
        const settingsSheet = ss.getSheetByName(SHEETS.SETTINGS);
        const siblingDiscount = parseFloat(settingsSheet.getRange("B2").getValue()) || 0;
        if (siblingDiscount > 0) {
          discountAmount += siblingDiscount;
          discountReason.push("형제 할인");
        }
      }
    }

    const finalAmount = baseFee - discountAmount;
    return { success: true, finalAmount: finalAmount, details: discountReason.join(', ') };

  } catch (e) {
    return { success: false, message: e.message };
  }
}

function calculateAndRecordPayment(paymentData) {
  try {
    const calculationResult = calculateTuitionFee(paymentData);
    if (!calculationResult.success) {
      throw new Error(calculationResult.message);
    }

    const { studentId, studentName, subjectId, months } = paymentData;
    const finalAmount = calculationResult.finalAmount;
    const details = calculationResult.details;
    
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const subjectInfo = getSubjects().find(s => s.과목ID == subjectId);

    ss.getSheetByName(SHEETS.PAYMENT).appendRow([ "P" + new Date().getTime(), studentId, studentName, new Date(), finalAmount, paymentData.paymentMethod, paymentData.cardCompany, `[${subjectInfo.과목명}/${months}개월] ${details}` ]);
    ss.getSheetByName(SHEETS.REGISTRATION).appendRow([ "R" + new Date().getTime(), studentId, studentName, subjectId, new Date().getMonth() + 1 ]);

    return { success: true, message: "납부 처리가 완료되었습니다." };
  } catch (e) {
    return { success: false, message: "오류 발생: " + e.message };
  }
}

// ----------------- 출결 및 진도 관련 함수 -----------------

function recordAttendanceAndProgress(recordData) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const { studentId, studentName, classDate, attendanceStatus, subjectId, classContent, teacherName } = recordData;
    const classDateObj = new Date(classDate);

    ss.getSheetByName(SHEETS.ATTENDANCE).appendRow([ "A" + new Date().getTime(), studentId, studentName, classDateObj, attendanceStatus ]);

    if (attendanceStatus === "출석") {
      ss.getSheetByName(SHEETS.PROGRESS).appendRow([ "PG" + new Date().getTime(), studentId, studentName, classDateObj, subjectId, classContent, teacherName ]);
    }
    
    return { success: true, message: "출결 및 진도 기록이 완료되었습니다." };
  } catch (e) {
    return { success: false, message: "기록 중 오류 발생: " + e.message };
  }
}


// ----------------- 내부 헬퍼 함수 -----------------

function getStudentInfo_(ss, studentId) {
  const studentSheet = ss.getSheetByName(SHEETS.STUDENT);
  const studentData = studentSheet.getDataRange().getValues();
  const headers = studentData.shift();
  const studentInfoRow = studentData.find(row => row[0] === studentId);
  if (!studentInfoRow) return null;
  const studentInfo = {};
  headers.forEach((header, i) => { studentInfo[header] = studentInfoRow[i]; });
  return studentInfo;
}

function getAttendanceEvents_(ss, studentId) {
  const sheet = ss.getSheetByName(SHEETS.ATTENDANCE);
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  const headers = data.shift();
  const studentIdIndex = headers.indexOf("학생ID");
  const dateIndex = headers.indexOf("출석 날짜");
  const statusIndex = headers.indexOf("출결 상태");
  if (studentIdIndex === -1) return [];

  const results = [];
  data.forEach(row => {
    if (row[studentIdIndex] === studentId) {
      const status = row[statusIndex];
      let color = 'gray';
      if (status === '출석') color = '#28a745';
      if (status === '결석') color = '#dc3545';
      if (status === '보강') color = '#007bff';
      results.push({ title: status, date: Utilities.formatDate(new Date(row[dateIndex]), "UTC", "yyyy-MM-dd"), color: color });
    }
  });
  return results;
}

function getDataByStudentId_(ss, sheetName, studentId) {
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  const headers = data.shift();
  const studentIdIndex = headers.indexOf("학생ID");
  if (studentIdIndex === -1) return [];

  const results = [];
  data.forEach(row => {
    if (row[studentIdIndex] === studentId) {
      const record = {};
      headers.forEach((header, i) => {
        record[header] = (row[i] instanceof Date) ? Utilities.formatDate(row[i], "GMT+9", "yyyy. MM. dd") : row[i];
      });
      results.push(record);
    }
  });
  
  const dateColumn = headers.find(h => h.includes("날짜") || h.includes("납부일"));
  if(dateColumn) {
    results.sort((a, b) => new Date(b[dateColumn]) - new Date(a[dateColumn]));
  }
  return results;
}