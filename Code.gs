// Code.gs (최종, 완벽한 버전)

// ----------------- 설정 -----------------
const SPREADSHEET_ID = "YOUR_SPREADSHEET_ID"; // <<<--- 여기에 실제 스프레드시트 ID를 입력하세요.

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
  return HtmlService.createTemplateFromFile('index').evaluate().setTitle('학생 관리 시스템').addMetaTag('viewport', 'width=device-width, initial-scale=1');
}
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// ----------------- 데이터 조회 함수 -----------------

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

function getStudentDetails(studentId) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    return {
      info: getStudentInfo_(ss, studentId),
      payments: getDataByStudentId_(ss, SHEETS.PAYMENT, studentId),
      attendance: getAttendanceEvents_(ss, studentId),
      progress: getProgressDataWithSubjectName_(ss, studentId)
    };
  } catch (e) {
    return { error: true, message: e.message };
  }
}

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

function getFamilyGroups() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const familySheet = ss.getSheetByName(SHEETS.FAMILY);
  if (!familySheet) return [];
  return familySheet.getDataRange().getValues();
}

// ----------------- 데이터 생성/수정 함수 -----------------

function addStudent(studentInfo) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const studentSheet = ss.getSheetByName(SHEETS.STUDENT);
    const familySheet = ss.getSheetByName(SHEETS.FAMILY);

    const newId = getNextStudentId_(ss);
    let familyGroupId = studentInfo.familyGroupId;

    if (familyGroupId === '__NEW__') {
      familyGroupId = "F" + new Date().getTime();
      familySheet.appendRow([familyGroupId, studentInfo.newFamilyGroupDesc]);
    }

    studentSheet.appendRow([ newId, studentInfo.name, studentInfo.age, studentInfo.school, familyGroupId ]);
    return { success: true, message: "학생이 성공적으로 추가되었습니다." };
  } catch (e) {
    return { success: false, message: "오류 발생: " + e.message };
  }
}

function updateStudentInfo(studentData) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const studentSheet = ss.getSheetByName(SHEETS.STUDENT);
    const data = studentSheet.getDataRange().getValues();
    const headers = data.shift();
    const idIndex = headers.indexOf("학생ID");

    const rowIndex = data.findIndex(row => row[idIndex] == studentData.studentId);

    if (rowIndex > -1) {
      const originalName = data[rowIndex][headers.indexOf("이름")];
      // 기존 행 데이터 복사 후 업데이트
      const rowToUpdate = studentSheet.getRange(rowIndex + 2, 1, 1, headers.length).getValues()[0];
      
      rowToUpdate[headers.indexOf("이름")] = studentData.이름;
      rowToUpdate[headers.indexOf("나이")] = studentData.나이;
      rowToUpdate[headers.indexOf("학교")] = studentData.학교;
      rowToUpdate[headers.indexOf("가족 그룹 ID")] = studentData['가족 그룹 ID'];

      studentSheet.getRange(rowIndex + 2, 1, 1, rowToUpdate.length).setValues([rowToUpdate]);

      // 이름이 변경된 경우 다른 시트도 업데이트
      if (originalName !== studentData.이름) {
        updateStudentNameInOtherSheets_(ss, studentData.studentId, studentData.이름);
      }
      return { success: true, message: "정보가 성공적으로 수정되었습니다." };
    } else {
      return { success: false, message: "해당 학생을 찾을 수 없습니다." };
    }
  } catch (e) {
    return { success: false, message: "수정 중 오류 발생: " + e.message };
  }
}

function calculateTuitionFee(data) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
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

    const familyGroupId = studentInfo['가족 그룹 ID'];
    if (familyGroupId) {
      const studentSheet = ss.getSheetByName(SHEETS.STUDENT);
      const studentData = studentSheet.getDataRange().getValues();
      if (studentData.filter(row => row[4] === familyGroupId && row[0] !== studentId).length > 0) {
        const settingsSheet = ss.getSheetByName(SHEETS.SETTINGS);
        const siblingDiscount = parseNumber(settingsSheet.getRange("B2").getValue());
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
    if (!calculationResult.success) throw new Error(calculationResult.message);

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

function getNextStudentId_(ss) {
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
}

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
  const [studentIdIndex, dateIndex, statusIndex] = [headers.indexOf("학생ID"), headers.indexOf("출석 날짜"), headers.indexOf("출결 상태")];
  if (studentIdIndex === -1) return [];

  return data.filter(row => row[studentIdIndex] === studentId).map(row => {
    const status = row[statusIndex];
    let color = 'gray'; // 기본값
    if (status === '출석') color = '#28a745'; // green
    else if (status === '결석') color = '#dc3545'; // red
    else if (status === '보강') color = '#007bff'; // blue

    return { title: status, date: Utilities.formatDate(new Date(row[dateIndex]), "UTC", "yyyy-MM-dd"), color: color };
  });
}

function getProgressDataWithSubjectName_(ss, studentId) {
  const progressSheet = ss.getSheetByName(SHEETS.PROGRESS);
  if (!progressSheet) return [];
  
  const allSubjects = getSubjects();
  
  const data = progressSheet.getDataRange().getValues();
  const headers = data.shift();
  const studentIdIndex = headers.indexOf("학생ID");
  if (studentIdIndex === -1) return [];

  const results = [];
  data.forEach(row => {
    if (row[studentIdIndex] === studentId) {
      const record = {};
      headers.forEach((header, i) => {
        if (header === "과목ID") {
          const subjectId = row[i];
          const subject = allSubjects.find(s => s.과목ID == subjectId);
          record["과목명"] = subject ? subject.과목명 : "(삭제된 과목)";
        } else {
           record[header] = (row[i] instanceof Date) ? Utilities.formatDate(row[i], "GMT+9", "yyyy. MM. dd") : row[i];
        }
      });
      results.push(record);
    }
  });

  results.sort((a, b) => new Date(b["수업 날짜"]) - new Date(a["수업 날짜"]));
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

function updateStudentNameInOtherSheets_(ss, studentId, newName) {
  const sheetsToUpdate = [SHEETS.PAYMENT, SHEETS.REGISTRATION, SHEETS.ATTENDANCE, SHEETS.PROGRESS];
  sheetsToUpdate.forEach(sheetName => {
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
  });
}
