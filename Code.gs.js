// 웹앱을 실행했을 때 가장 먼저 호출되는 함수입니다.
function doGet() {
  return HtmlService.createTemplateFromFile('index').evaluate()
      .setTitle('출석 관리 시스템')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// HTML 파일(CSS.html, JavaScript.html)을 서버 사이드에서 처리할 수 있도록 포함시키는 함수입니다.
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// --- 이하 학생 정보 처리 함수들 (이전과 동일) ---

// 스프레드시트 정보를 가져옵니다.
const SPREADSHEET_ID = SpreadsheetApp.getActiveSpreadsheet().getId();
const SHEET_STUDENTS = '학생명단';
const SHEET_ATTENDANCE = '출석기록';
const SHEET_PAYMENT = '교육비납부';

/**
 * 학생 이름을 검색하여 학생 정보를 반환합니다.
 * @param {string} name - 검색할 학생 이름
 * @returns {object|null} - 학생 정보 또는 null
 */
function searchStudent(name) {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_STUDENTS);
  const data = sheet.getDataRange().getValues();
  data.shift(); // 헤더 행 제거

  const student = data.find(row => row[0] === name);

  if (student) {
    return {
      name: student[0],
      teacher: student[1],
      materials: student[2],
      progress: student[3],
      notes: student[4]
    };
  }
  return null;
}

/**
 * 신규 학생을 추가합니다.
 * @param {object} studentData - 추가할 학생 정보 (name 필수)
 * @returns {object} - 성공 여부 메시지
 */
function addStudent(studentData) {
  if (!studentData.name || studentData.name.trim() === '') {
    return { success: false, message: '학생 이름은 필수입니다.' };
  }
  
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_STUDENTS);
  
  const existingStudent = searchStudent(studentData.name);
  if (existingStudent) {
    return { success: false, message: '이미 등록된 학생입니다.' };
  }

  sheet.appendRow([
    studentData.name,
    studentData.teacher || '',
    studentData.materials || '',
    studentData.progress || '',
    studentData.notes || ''
  ]);
  
  return { success: true, message: `'${studentData.name}' 학생을 추가했습니다.` };
}

/**
 * 특정 학생의 모든 정보를 가져옵니다.
 * @param {string} name - 학생 이름
 * @returns {object|null} - 학생의 모든 정보 또는 null
 */
function getStudentDetails(name) {
  const studentInfo = searchStudent(name);
  if (!studentInfo) {
    return null;
  }

  const attendanceSheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_ATTENDANCE);
  const paymentSheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_PAYMENT);

  const attendanceData = attendanceSheet.getDataRange().getValues().filter(row => row[0] === name);
  const paymentData = paymentSheet.getDataRange().getValues().filter(row => row[0] === name);

  return {
    info: studentInfo,
    attendance: attendanceData.map(row => ({ date: new Date(row[1]).toISOString().slice(0,10), status: row[2] })),
    payment: paymentData.map(row => ({ month: row[1], status: row[2] }))
  };
}

/**
 * 학생 정보를 업데이트합니다.
 * @param {object} details - 업데이트할 학생 정보
 * @returns {object} - 성공 여부 메시지
 */
function updateStudentDetails(details) {
  const { name, teacher, materials, progress, notes, attendance, payment } = details;

  try {
    const studentSheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_STUDENTS);
    const studentData = studentSheet.getDataRange().getValues();
    const studentRowIndex = studentData.findIndex(row => row[0] === name);
    
    if (studentRowIndex > -1) {
      studentSheet.getRange(studentRowIndex + 1, 2, 1, 4).setValues([[teacher, materials, progress, notes]]);
    } else {
      return { success: false, message: '학생을 찾을 수 없습니다.' };
    }

    const attendanceSheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_ATTENDANCE);
    const attendanceData = attendanceSheet.getDataRange().getValues();
    for (let i = attendanceData.length - 1; i >= 0; i--) {
      if (attendanceData[i][0] === name) {
        attendanceSheet.deleteRow(i + 1);
      }
    }
    if (attendance && attendance.length > 0) {
      const newAttendanceRows = attendance.map(att => [name, att.date, att.status]);
      attendanceSheet.getRange(attendanceSheet.getLastRow() + 1, 1, newAttendanceRows.length, 3).setValues(newAttendanceRows);
    }

    const paymentSheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_PAYMENT);
    const paymentData = paymentSheet.getDataRange().getValues();
    for (let i = paymentData.length - 1; i >= 0; i--) {
      if (paymentData[i][0] === name) {
        paymentSheet.deleteRow(i + 1);
      }
    }
    if (payment && payment.length > 0) {
      const newPaymentRows = payment.map(pay => [name, pay.month, pay.status]);
      paymentSheet.getRange(paymentSheet.getLastRow() + 1, 1, newPaymentRows.length, 3).setValues(newPaymentRows);
    }

    return { success: true, message: '정보를 성공적으로 업데이트했습니다.' };
  } catch (e) {
    return { success: false, message: '업데이트 중 오류가 발생했습니다: ' + e.toString() };
  }
}
