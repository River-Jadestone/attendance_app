const SPREADSHEET_ID = SpreadsheetApp.getActiveSpreadsheet().getId();
const SHEET_STUDENTS = '학생명단';
const SHEET_ATTENDANCE = '출석기록';
const SHEET_PAYMENT = '교육비납부';

// 웹앱 실행 시 첫 화면 로드
function doGet() {
  return HtmlService.createTemplateFromFile('index').evaluate()
      .setTitle('출석 관리 시스템')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// HTML 파일 include 헬퍼 함수
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// --- 신규 기능 및 수정된 함수 ---

/**
 * 다음 학생 ID를 생성합니다.
 * @returns {number} - 다음 학생 ID
 */
function _getNextId() {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_STUDENTS);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return 1; // 헤더만 있으면 1번 시작
  // 마지막 행의 ID + 1을 반환 (더 안전하게 하려면 모든 ID를 읽고 max를 찾아야 함)
  const maxId = sheet.getRange(2, 1, lastRow - 1, 1).getValues()
                   .reduce((max, row) => Math.max(max, row[0] || 0), 0);
  return maxId + 1;
}

/**
 * 이름으로 학생을 검색하여 동명이인을 포함한 목록을 반환합니다.
 * @param {string} name - 검색할 학생 이름
 * @returns {Array<object>} - 학생 목록 (id, name, teacher)
 */
function searchStudentsByName(name) {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_STUDENTS);
  const data = sheet.getDataRange().getValues();
  data.shift(); // 헤더 제거

  const results = [];
  data.forEach(row => {
    // row[0]: id, row[1]: name, row[2]: teacher
    if (row[1] === name) {
      results.push({
        id: row[0],
        name: row[1],
        teacher: row[2]
      });
    }
  });
  return results;
}

/**
 * 신규 학생을 추가합니다. (ID 자동 생성)
 * @param {object} studentData - 추가할 학생 정보 (name 필수)
 * @returns {object} - 성공 여부 및 추가된 학생 정보
 */
function addStudent(studentData) {
  if (!studentData.name || studentData.name.trim() === '') {
    return { success: false, message: '학생 이름은 필수입니다.' };
  }
  
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_STUDENTS);
  const newId = _getNextId();

  sheet.appendRow([
    newId,
    studentData.name,
    '', // 담당교사
    '', // 사용교구
    '', // 진도
    ''  // 특이사항
  ]);
  
  SpreadsheetApp.flush();
  
  return { 
    success: true, 
    message: `'${studentData.name}' 학생을 추가했습니다.`,
    newStudent: { id: newId, name: studentData.name, teacher: '' }
  };
}

/**
 * 학생 ID로 특정 학생의 모든 정보를 가져옵니다.
 * @param {number} id - 학생 ID
 * @returns {object|null} - 학생의 모든 정보 또는 null
 */
function getStudentDetails(id) {
  const studentSheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_STUDENTS);
  const studentData = studentSheet.getDataRange().getValues();
  studentData.shift();
  const studentRow = studentData.find(row => row[0] == id);

  if (!studentRow) return null;

  const studentInfo = {
    id: studentRow[0],
    name: studentRow[1],
    teacher: studentRow[2],
    materials: studentRow[3],
    progress: studentRow[4],
    notes: studentRow[5]
  };

  const attendanceSheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_ATTENDANCE);
  const paymentSheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_PAYMENT);

  const attendanceData = attendanceSheet.getDataRange().getValues().filter(row => row[0] == id);
  const paymentData = paymentSheet.getDataRange().getValues().filter(row => row[0] == id);

  const summary = {};
  attendanceData.forEach(row => {
    const status = row[3]; // 상태 열 인덱스 변경
    if (status === '출석' || status === '보강') {
      try {
        const month = new Date(row[2]).toISOString().slice(0, 7);
        summary[month] = (summary[month] || 0) + 1;
      } catch(e) {}
    }
  });

  const attendanceSummary = Object.keys(summary).map(month => ({
    month: month,
    count: summary[month]
  })).sort((a, b) => b.month.localeCompare(a.month));

  return {
    info: studentInfo,
    attendance: attendanceData.map(row => ({ date: row[2], status: row[3] })),
    payment: paymentData.map(row => ({ month: row[2], status: row[3] })),
    attendanceSummary: attendanceSummary
  };
}

/**
 * 학생 정보를 업데이트합니다. (ID 기준)
 * @param {object} details - 업데이트할 학생 정보 (id 포함)
 * @returns {object} - 성공 여부 메시지
 */
function updateStudentDetails(details) {
  const { id, name, teacher, materials, notes, attendance, payment, newProgress } = details;

  try {
    const studentSheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_STUDENTS);
    const studentData = studentSheet.getDataRange().getValues();
    const studentRowIndex = studentData.findIndex(row => row[0] == id);

    if (studentRowIndex > -1) {
      const range = studentSheet.getRange(studentRowIndex + 1, 2, 1, 5);
      const currentValues = range.getValues()[0];
      
      let updatedProgress = currentValues[3]; // 기존 진도
      if (newProgress && newProgress.trim() !== '') {
        const today = new Date().toLocaleDateString('ko-KR');
        updatedProgress = updatedProgress ? `${updatedProgress}\n${today}: ${newProgress}` : `${today}: ${newProgress}`;
      }

      range.setValues([[name, teacher, materials, updatedProgress, notes]]);
    } else {
      return { success: false, message: '학생을 찾을 수 없습니다.' };
    }

    const attendanceSheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_ATTENDANCE);
    const attendanceData = attendanceSheet.getDataRange().getValues();
    for (let i = attendanceData.length - 1; i > 0; i--) {
      if (attendanceData[i][0] == id) {
        attendanceSheet.deleteRow(i + 1);
      }
    }
    if (attendance && attendance.length > 0) {
      const newAttendanceRows = attendance.map(att => [id, name, att.date, att.status]);
      attendanceSheet.getRange(attendanceSheet.getLastRow() + 1, 1, newAttendanceRows.length, 4).setValues(newAttendanceRows);
    }

    const paymentSheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_PAYMENT);
    const paymentData = paymentSheet.getDataRange().getValues();
    for (let i = paymentData.length - 1; i > 0; i--) {
      if (paymentData[i][0] == id) {
        paymentSheet.deleteRow(i + 1);
      }
    }
    if (payment && payment.length > 0) {
      const newPaymentRows = payment.map(pay => [id, name, pay.month, pay.status]);
      paymentSheet.getRange(paymentSheet.getLastRow() + 1, 1, newPaymentRows.length, 4).setValues(newPaymentRows);
    }

    return { success: true, message: '정보를 성공적으로 업데이트했습니다.' };
  } catch (e) {
    return { success: false, message: '업데이트 중 오류가 발생했습니다: ' + e.toString() };
  }
}