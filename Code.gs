// Code.gs (날짜 형식 수정)

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
    studentSheet.appendRow([ newId, studentInfo.name, studentInfo.age, studentInfo.school, familyGroupId ]);
    return { success: true, message: "학생이 성공적으로 추가되었습니다." };
  } catch (e) {
    return { success: false, message: "오류 발생: " + e.message };
  }
}

function getStudentDetails(studentId) {
  try {
    const studentData = studentSheet.getDataRange().getValues();
    const studentHeaders = studentData.shift();
    const studentInfoRow = studentData.find(row => row[0] === studentId);
    if (!studentInfoRow) throw new Error("해당 ID의 학생을 찾을 수 없습니다.");
    
    const studentInfo = {};
    studentHeaders.forEach((header, i) => { studentInfo[header] = studentInfoRow[i]; });

    return {
      info: studentInfo,
      registrations: getDataByStudentId_("수강신청", studentId),
      payments: getDataByStudentId_("납부내역", studentId),
      attendance: getDataByStudentId_("출결", studentId), // 달력용 데이터
      progress: getDataByStudentId_("진도", studentId)
    };
  } catch (e) {
    return { error: true, message: e.message };
  }
}

// ----------------- 교육비 및 과목 관련 함수 -----------------

function getSubjects() {
  const data = subjectSheet.getDataRange().getValues();
  const headers = data.shift();
  return data.map(row => {
    const subject = {};
    headers.forEach((h, i) => subject[h] = row[i]);
    return subject;
  });
}

function calculateAndRecordPayment(paymentData) {
  try {
    const { studentId, studentName, subjectId, months } = paymentData;
    const allSubjects = getSubjects();
    const subjectInfo = allSubjects.find(s => s.과목ID == subjectId);
    if (!subjectInfo) throw new Error("과목 정보를 찾을 수 없습니다.");
    const studentInfo = getStudentDetails(studentId).info;
    if (!studentInfo) throw new Error("학생 정보를 찾을 수 없습니다.");

    let baseFee = parseFloat(subjectInfo.월수강료) * parseInt(months, 10);
    let discountAmount = 0;
    let discountReason = [];

    if (months == 3 && subjectInfo['3개월 할인율'] > 0) {
      let monthDiscount = baseFee * subjectInfo['3개월 할인율'];
      discountAmount += monthDiscount;
      discountReason.push(`3개월 할인 (${subjectInfo['3개월 할인율']*100}%)`);
    }
    if (months == 12 && subjectInfo['12개월 할인율'] > 0) {
       let monthDiscount = baseFee * subjectInfo['12개월 할인율'];
      discountAmount += monthDiscount;
      discountReason.push(`12개월 할인 (${subjectInfo['12개월 할인율']*100}%)`);
    }

    const familyGroupId = studentInfo['가족 그룹 ID'];
    if (familyGroupId) {
      const studentData = studentSheet.getDataRange().getValues();
      const familyMembers = studentData.filter(row => row[4] === familyGroupId && row[0] !== studentId);
      if (familyMembers.length > 0) {
        const settingsData = settingsSheet.getRange("A2:B2").getValues();
        const siblingDiscount = parseFloat(settingsData[0][1]) || 0;
        if (siblingDiscount > 0) {
          discountAmount += siblingDiscount;
          discountReason.push("형제 할인");
        }
      }
    }

    const finalAmount = baseFee - discountAmount;

    paymentSheet.appendRow([ "P" + new Date().getTime(), studentId, studentName, new Date(), finalAmount, paymentData.paymentMethod, paymentData.cardCompany, `[${subjectInfo.과목명}/${months}개월] ${discountReason.join(', ')}` ]);
    registrationSheet.appendRow([ "R" + new Date().getTime(), studentId, studentName, subjectId, new Date().getMonth() + 1 ]);

    return { success: true, message: "납부 처리가 완료되었습니다." };
  } catch (e) {
    return { success: false, message: "오류 발생: " + e.message };
  }
}

// ----------------- 출결 및 진도 관련 함수 -----------------

function recordAttendanceAndProgress(recordData) {
  try {
    const { studentId, studentName, classDate, attendanceStatus, subjectId, classContent, teacherName } = recordData;
    const classDateObj = new Date(classDate);

    attendanceSheet.appendRow([ "A" + new Date().getTime(), studentId, studentName, classDateObj, attendanceStatus ]);

    if (attendanceStatus === "출석") {
      progressSheet.appendRow([ "PG" + new Date().getTime(), studentId, studentName, classDateObj, subjectId, classContent, teacherName ]);
    }
    
    return { success: true, message: "출결 및 진도 기록이 완료되었습니다." };
  } catch (e) {
    return { success: false, message: "기록 중 오류 발생: " + e.message };
  }
}


// ----------------- 내부 헬퍼 함수 -----------------

function getDataByStudentId_(sheetName, studentId) {
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return [];
  
  const data = sheet.getDataRange().getValues();
  const headers = data.shift();
  const studentIdIndex = headers.indexOf("학생ID");

  if (studentIdIndex === -1) return [];

  const results = [];
  data.forEach(row => {
    if (row[studentIdIndex] === studentId) {
      // ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★
      // 수정된 부분: 출결 시트인 경우 달력 형식에 맞는 데이터로 가공
      // ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★
      if (sheetName === "출결") {
        const dateIndex = headers.indexOf("출석 날짜");
        const statusIndex = headers.indexOf("출결 상태");
        const status = row[statusIndex];
        let color = 'gray';
        if (status === '출석') color = '#28a745'; // green
        if (status === '결석') color = '#dc3545'; // red
        if (status === '보강') color = '#007bff'; // blue

        results.push({
          title: status,
          date: Utilities.formatDate(new Date(row[dateIndex]), "GMT+9", "yyyy-MM-dd"),
          color: color
        });

      } else {
        const record = {};
        headers.forEach((header, i) => {
          record[header] = (row[i] instanceof Date) ? Utilities.formatDate(row[i], "GMT+9", "yyyy. MM. dd") : row[i];
        });
        results.push(record);
      }
    }
  });
  
  if (sheetName !== "출결") {
      const dateColumn = headers.find(h => h.includes("날짜") || h.includes("납부일"));
      if(dateColumn) {
        results.sort((a, b) => new Date(b[dateColumn]) - new Date(a[dateColumn]));
      }
  }

  return results;
}
