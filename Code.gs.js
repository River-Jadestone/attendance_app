const SPREADSHEET_ID = SpreadsheetApp.getActiveSpreadsheet().getId();
const SHEET_STUDENTS = '학생명단';
const SHEET_ATTENDANCE = '출석기록';
const SHEET_PAYMENT = '교육비납부';

function doGet() {
  return HtmlService.createTemplateFromFile('index').evaluate()
      .setTitle('출석 관리 시스템')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function _getNextId() {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_STUDENTS);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return 1;
  const maxId = sheet.getRange(2, 1, lastRow - 1, 1).getValues()
                   .reduce((max, row) => Math.max(max, row[0] || 0), 0);
  return maxId + 1;
}

function searchStudentsByName(name) {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_STUDENTS);
  const data = sheet.getDataRange().getValues();
  data.shift();
  const results = [];
  data.forEach(row => {
    if (row[1] === name) {
      results.push({ id: row[0], name: row[1], teacher: row[2] });
    }
  });
  return results;
}

/**
 * [구조 변경] 신규 학생을 추가하고, 즉시 상세정보까지 모두 반환합니다.
 */
function addStudent(studentData) {
  if (!studentData.name || studentData.name.trim() === '') {
    return { success: false, message: '학생 이름은 필수입니다.' };
  }
  
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_STUDENTS);
  const newId = _getNextId();

  sheet.appendRow([ newId, studentData.name, '', '', '', '' ]);
  SpreadsheetApp.flush(); // 변경사항 즉시 저장

  // 서버 내부에서 직접 getStudentDetails를 호출하여 완전한 데이터를 만듭니다.
  const newStudentDetails = getStudentDetails(newId);

  if (newStudentDetails) {
    return {
      success: true,
      message: `'${studentData.name}' 학생을 추가했습니다.`,
      details: newStudentDetails // 상세 정보를 함께 반환
    };
  } else {
    // 이 경우는 서버 내부의 심각한 오류입니다.
    return {
      success: false,
      message: '학생을 추가했지만 정보를 다시 불러오는 데 실패했습니다. 시트를 확인해주세요.'
    };
  }
}

function getStudentDetails(id) {
  const studentSheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_STUDENTS);
  const studentData = studentSheet.getDataRange().getValues();
  studentData.shift();
  const studentRow = studentData.find(row => String(row[0]) === String(id));

  if (!studentRow) return null;

  const studentInfo = { id: studentRow[0], name: studentRow[1], teacher: studentRow[2], materials: studentRow[3], progress: studentRow[4], notes: studentRow[5] };

  const attendanceSheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_ATTENDANCE);
  const paymentSheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_PAYMENT);

  const attendanceData = attendanceSheet.getDataRange().getValues().filter(row => String(row[0]) === String(id));
  const paymentData = paymentSheet.getDataRange().getValues().filter(row => String(row[0]) === String(id));

  const summary = {};
  attendanceData.forEach(row => {
    const status = row[3];
    if (status === '출석' || status === '보강') {
      try {
        const month = new Date(row[2]).toISOString().slice(0, 7);
        summary[month] = (summary[month] || 0) + 1;
      } catch(e) {}
    }
  });

  const attendanceSummary = Object.keys(summary).map(month => ({ month: month, count: summary[month] })).sort((a, b) => b.month.localeCompare(a.month));

  return {
    info: studentInfo,
    attendance: attendanceData.map(row => ({ date: row[2], status: row[3] })),
    payment: paymentData.map(row => ({ month: row[2], status: row[3] })),
    attendanceSummary: attendanceSummary
  };
}

function updateStudentDetails(details) {
  const { id, name, teacher, materials, notes, attendance, payment, newProgress } = details;
  try {
    const studentSheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_STUDENTS);
    const studentData = studentSheet.getDataRange().getValues();
    const studentRowIndex = studentData.findIndex(row => String(row[0]) === String(id));
    if (studentRowIndex > -1) {
      const range = studentSheet.getRange(studentRowIndex + 1, 2, 1, 5);
      const currentValues = range.getValues()[0];
      let updatedProgress = currentValues[3];
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
      if (String(attendanceData[i][0]) === String(id)) {
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
      if (String(paymentData[i][0]) === String(id)) {
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