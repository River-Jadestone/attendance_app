// Code.gs

// ----------------- 설정 -----------------
const SPREADSHEET_ID = "YOUR_SPREADSHEET_ID"; // <<<--- 여기에 실제 스프레드시트 ID를 입력하세요.
const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

// 각 시트 이름에 해당하는 변수 설정
const studentSheet = ss.getSheetByName("학생정보");
const subjectSheet = ss.getSheetByName("과목정보");
const paymentSheet = ss.getSheetByName("납부내역");
const registrationSheet = ss.getSheetByName("수강신청");
const attendanceSheet = ss.getSheetByName("출결");
const progressSheet = ss.getSheetByName("진도");
const familySheet = ss.getSheetByName("가족그룹");
const settingsSheet = ss.getSheetByName("설정");


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
  if (!name) return [];
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
    const newId = "S" + new Date().getTime();
    const familyGroupId = studentInfo.familyGroupId || "F" + new Date().getTime();
    studentSheet.appendRow([
      newId,
      studentInfo.name,
      studentInfo.age,
      studentInfo.school,
      familyGroupId
    ]);
    return { success: true, message: "학생이 성공적으로 추가되었습니다." };
  } catch (e) {
    return { success: false, message: "오류 발생: " + e.message };
  }
}

/**
 * 학생 ID를 기반으로 모든 관련 정보를 가져옵니다.
 * @param {string} studentId - 조회할 학생의 ID
 * @returns {Object} - 학생의 모든 상세 정보
 */
function getStudentDetails(studentId) {
  try {
    // 1. 기본 학생 정보 가져오기
    const studentData = studentSheet.getDataRange().getValues();
    const studentHeaders = studentData.shift();
    const studentInfoRow = studentData.find(row => row[0] === studentId);
    if (!studentInfoRow) {
      throw new Error("해당 ID의 학생을 찾을 수 없습니다.");
    }
    const studentInfo = {};
    studentHeaders.forEach((header, i) => {
      studentInfo[header] = studentInfoRow[i];
    });

    // 2. 나머지 정보들을 헬퍼 함수로 가져오기
    return {
      info: studentInfo,
      registrations: getDataByStudentId_("수강신청", studentId),
      payments: getDataByStudentId_("납부내역", studentId),
      attendance: getDataByStudentId_("출결", studentId),
      progress: getDataByStudentId_("진도", studentId)
    };
  } catch (e) {
    // 오류를 클라이언트에 전파하기 위해 객체로 반환
    return { error: true, message: e.message };
  }
}


// ----------------- 내부 헬퍼 함수 -----------------

/**
 * 특정 시트에서 학생 ID로 데이터를 필터링하여 가져옵니다. (내부용)
 * @param {string} sheetName - 데이터를 가져올 시트 이름
 * @param {string} studentId - 필터링할 학생 ID
 * @returns {Array<Object>} - 필터링된 데이터 배열
 */
function getDataByStudentId_(sheetName, studentId) {
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return [];
  
  const data = sheet.getDataRange().getValues();
  const headers = data.shift();
  const studentIdIndex = headers.indexOf("학생ID");

  if (studentIdIndex === -1) return []; // 학생ID 열이 없으면 빈 배열 반환

  const results = [];
  data.forEach(row => {
    if (row[studentIdIndex] === studentId) {
      const record = {};
      headers.forEach((header, i) => {
        // 날짜 객체는 문자열로 변환하여 전송
        record[header] = (row[i] instanceof Date) ? row[i].toLocaleDateString() : row[i];
      });
      results.push(record);
    }
  });
  
  // 최신 데이터가 위로 오도록 정렬 (날짜 관련 열이 있는 경우)
  const dateColumn = headers.find(h => h.includes("날짜") || h.includes("납부일"));
  if(dateColumn) {
    results.sort((a, b) => new Date(b[dateColumn]) - new Date(a[dateColumn]));
  }

  return results;
}
