// ===================================================
// 보스턴 온누리교회 예배 출석 보고 - Apps Script
// A:제출시간 B:보고날짜 C:예배날짜 D:예배명
// E:총인원 F:현장 G:온라인 H:학생 I:교역자+교사 J:그외 K:서명
// ===================================================

const SHEET_NAME = "출석보고";
const ADMIN_PW   = PropertiesService.getScriptProperties().getProperty("ADMIN_PW");
const SHEET_ID   = "1VNkF5t-MJWc5abCvFXdA-JlT0YEf-Y00cN1kPkF3lLI";

function getSheet() {
  return SpreadsheetApp.openById(SHEET_ID);
}

// ── 날짜 문자열 로컬 파싱 (UTC 자정 파싱 오류 방지) ──
// new Date("YYYY-MM-DD") → UTC 자정 → 보스턴(UTC-5)에서 전날로 밀림
// parseLocalDate("2026-01-04") → new Date(2026, 0, 4) 로컬 자정 → 항상 정확
function parseLocalDate(str) {
  var p = String(str).slice(0, 10).split("-");
  return new Date(parseInt(p[0]), parseInt(p[1]) - 1, parseInt(p[2]));
}

// ── 날짜 객체 → 로컬 자정으로 정규화 ──
function toLocalMidnight(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

// ── 날짜 객체 → "YYYY-MM-DD" (toISOString 금지: UTC 변환으로 하루 밀림) ──
function fmtKey(d) {
  return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0");
}

// ===================================================
// 예배명 별칭 (구 이름 → 현행 이름)   ※ index.html의 SVC_ALIAS와 반드시 동일 유지
// 2026-11-01 개편: 예꿈→예꿈 유치부, 중등부→PW 중등부, 고등부→PW 고등부
// 시트의 과거 데이터는 마이그레이션하지 않고 그대로 둔다.
// 대신 시트에서 예배명을 "읽을 때마다" canonSvc()로 현행 이름으로 통일한 뒤 계산한다.
// → 과거 "예꿈" 기록과 신규 "예꿈 유치부" 기록이 평균·합산·중복판정에서 같은 항목으로 처리됨.
// ===================================================
var SVC_ALIAS = {
  "예꿈":   "예꿈 유치부",
  "중등부": "PW 중등부",
  "고등부": "PW 고등부"
};
function canonSvc(name) {
  var n = String(name === null || name === undefined ? "" : name).trim();
  return SVC_ALIAS[n] || n;
}

// ── 예배별 운영 기간 (여기 없는 예배 = 항상 운영) ──
// 운영위 보고서에서 "보고 기간 동안 운영되지 않은 예배"는 데이터가 없을 때 줄 자체를 생략(미제출 미표시).
// 운영 기간 안인데 데이터가 없으면 정상적으로 "미제출" 표시.
var SVC_PERIOD = {
  "위윈EM":          { end:   "2026-05-31" },   // 폐지
  "주일 3부 EM예배": { start: "2026-06-01" },   // 신설(성인)
  "예꿈 영아부":     { start: "2026-11-01" }    // 신설(차세대)
};
// 보고 기간 [sKey, eKey] ("YYYY-MM-DD") 동안 해당 예배가 운영 중이었는지
function svcActiveIn(svc, sKey, eKey) {
  var p = SVC_PERIOD[svc];
  if (!p) return true;
  if (p.start && p.start > eKey) return false;   // 보고 기간이 신설 전에 끝남
  if (p.end   && p.end   < sKey) return false;   // 보고 기간이 폐지 후에 시작
  return true;
}

function doPost(e) {
  try {
    var data   = JSON.parse(e.postData.contents);
    var action = data.action;
    if (action === "submit") return handleSubmit(data);
    return jsonResponse({ success: false, message: "Unknown action" });
  } catch (err) {
    return jsonResponse({ success: false, message: err.toString() });
  }
}

function doGet(e) {
  var params = (e && e.parameter) ? e.parameter : {};
  var action = params.action || "";

  if (action === "ping") {
    return jsonResponse({ success: true, message: "OK", version: "v5" });
  }
  if (action === "login") {
    return handleLogin(params.pw || "");
  }
  if (action === "logout") {
    if (params.token) {
      CacheService.getScriptCache().remove("tok_" + params.token);
    }
    return jsonResponse({ success: true });
  }
  if (action === "submit") {
    return handleSubmit(params);
  }
  if (action === "delete") {
    if (!validateToken(params.token)) return jsonResponse({ success: false, message: "Unauthorized" });
    return handleDelete(parseInt(params.rowIndex), params);
  }
  if (action === "getData") {
    if (!validateToken(params.token)) return jsonResponse({ success: false, message: "Unauthorized" });
    return handleGetData();
  }
  if (action === "report") {
    if (!validateToken(params.token)) return jsonResponse({ success: false, message: "Unauthorized" });
    return handleReport(params.startDate, params.endDate);
  }
  if (action === "monthlyReport") {
    if (!validateToken(params.token)) return jsonResponse({ success: false, message: "Unauthorized" });
    return handleMonthlyReport(params.year, params.month, params.author || "");
  }

  // action 없음 → 단순 확인용
  return jsonResponse({ success: true, message: "Server running v4" });
}

// ── 관리자 로그인 → 1시간짜리 토큰 발급 ──
function handleLogin(password) {
  if (password !== ADMIN_PW)
    return jsonResponse({ success: false, message: "비밀번호가 틀렸습니다." });
  var token = Utilities.getUuid();
  CacheService.getScriptCache().put("tok_" + token, "1", 3600); // 3600초 = 1시간
  return jsonResponse({ success: true, token: token });
}

// ── 토큰 유효성 검증 ──
function validateToken(token) {
  if (!token) return false;
  return CacheService.getScriptCache().get("tok_" + token) === "1";
}

// ── 제출 처리 ──
function handleSubmit(data) {
  var ss    = getSheet();
  var sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    var hdr = sheet.getRange(1, 1, 1, 11);
    sheet.appendRow(["제출시간","보고날짜","예배날짜","예배명","총인원","현장","온라인","학생","교역자+교사","그외","서명"]);
    hdr.setFontWeight("bold").setBackground("#1A3070").setFontColor("#FFFFFF");
    sheet.setFrozenRows(1);
    [160,120,110,80,70,70,70,70,70,70,100].forEach(function(w,i){ sheet.setColumnWidth(i+1,w); });
  }

  var submitTime = Utilities.formatDate(new Date(), "America/New_York", "yyyy-MM-dd HH:mm:ss");
  var newRow = [
    submitTime,
    data.reportDate  || "",
    data.worshipDate || "",
    canonSvc(data.service),   // 구 이름으로 들어와도 현행 이름으로 저장
    Number(data.total)   || 0,
    Number(data.onsite)  || 0,
    Number(data.online)  || 0,
    Number(data.student) || 0,
    Number(data.teacher) || 0,
    Number(data.other)   || 0,
    data.signature   || ""
  ];

  var lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    var values = sheet.getRange(2, 1, lastRow-1, 11).getValues();
    for (var i = 0; i < values.length; i++) {
      var rowDate = values[i][2] instanceof Date
        ? Utilities.formatDate(values[i][2], "America/New_York", "yyyy-MM-dd")
        : String(values[i][2]).trim();
      // 예배명은 별칭 변환 후 비교 → 과거 "예꿈" 행을 "예꿈 유치부"로 수정해도 같은 행을 찾아 덮어씀(새 행 추가 방지)
      var rowSvc = canonSvc(values[i][3]);
      if (rowDate === (data.worshipDate||"").trim() && rowSvc === canonSvc(data.service)) {
        saveHistory(ss, values[i], newRow, submitTime, data.reason || "", data.modifier || "");
        sheet.getRange(i+2, 1, 1, 11).setValues([newRow]);
        return jsonResponse({ success: true, message: "수정 완료" });
      }
    }
  }

  sheet.appendRow(newRow);
  return jsonResponse({ success: true, message: "제출 완료" });
}

// ── 수정이력 보관 ──
function saveHistory(ss, oldRow, newRow, modifiedTime, reason, modifier) {
  var HIST = "수정이력";
  var hist = ss.getSheetByName(HIST);
  if (!hist) {
    hist = ss.insertSheet(HIST);
    hist.appendRow(["수정일시","구분","예배날짜","예배명",
      "기존_총인원","기존_현장","기존_온라인","기존_학생","기존_교역자+교사","기존_그외","기존_서명",
      "새_총인원","새_현장","새_온라인","새_학생","새_교역자+교사","새_그외","새_서명","사유","처리자"]);
    hist.getRange(1,1,1,20).setFontWeight("bold").setBackground("#B45309").setFontColor("#FFFFFF");
    hist.setFrozenRows(1);
    hist.setColumnWidth(1, 160);
    hist.setColumnWidth(2, 60);
    hist.setColumnWidth(19, 200);
    hist.setColumnWidth(20, 100);
  }
  hist.appendRow([modifiedTime, "수정", oldRow[2], oldRow[3],
    oldRow[4],oldRow[5],oldRow[6],oldRow[7],oldRow[8],oldRow[9],oldRow[10],
    newRow[4],newRow[5],newRow[6],newRow[7],newRow[8],newRow[9],newRow[10],
    reason || "", modifier || ""]);
}

// ── 삭제 처리 ──
function handleDelete(rowIndex, params) {
  if (!rowIndex || rowIndex < 2)
    return jsonResponse({ success: false, message: "Invalid row" });
  var ss    = getSheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) return jsonResponse({ success: false, message: "Sheet not found" });

  // 삭제 전 이력 저장
  try {
    var delTime = Utilities.formatDate(new Date(), "America/New_York", "yyyy-MM-dd HH:mm:ss");
    var HIST = "수정이력";
    var hist = ss.getSheetByName(HIST);
    if (!hist) {
      hist = ss.insertSheet(HIST);
      hist.appendRow(["수정일시","구분","예배날짜","예배명",
        "기존_총인원","기존_현장","기존_온라인","기존_학생","기존_교역자+교사","기존_그외","기존_서명",
        "새_총인원","새_현장","새_온라인","새_학생","새_교역자+교사","새_그외","새_서명","사유","처리자"]);
      hist.getRange(1,1,1,20).setFontWeight("bold").setBackground("#B45309").setFontColor("#FFFFFF");
      hist.setFrozenRows(1);
      hist.setColumnWidth(20, 100);
    }
    hist.appendRow([
      delTime, "삭제",
      params.dk||"", params.svc||"",
      Number(params.total)||0, Number(params.onsite)||0, Number(params.online)||0,
      Number(params.student)||0, Number(params.teacher)||0, Number(params.other)||0,
      params.sig||"",
      "","","","","","","",
      params.reason||"", params.modifier||""
    ]);
  } catch(e) {}

  sheet.deleteRow(rowIndex);
  return jsonResponse({ success: true, message: "삭제 완료" });
}

// ── 데이터 조회 ──
function handleGetData() {
  var sheet = getSheet().getSheetByName(SHEET_NAME);
  if (!sheet) return jsonResponse({ success: true, data: [] });
  return jsonResponse({ success: true, data: sheet.getDataRange().getValues() });
}

// ── JSON 응답 ──
function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── 보고서 생성 ──
function handleReport(startStr, endStr) {
  try {
    if (!startStr || !endStr) throw new Error("날짜를 입력해주세요.");

    // ── 날짜 파싱: 전역 parseLocalDate / toLocalMidnight 사용 ──
    var startDate = parseLocalDate(startStr); startDate.setHours(0,0,0,0);
    var endDate   = parseLocalDate(endStr);   endDate.setHours(23,59,59,999);

    var sheet = getSheet().getSheetByName(SHEET_NAME);
    if (!sheet || sheet.getLastRow() <= 1) throw new Error("데이터가 없습니다.");

    var allRows = sheet.getRange(2, 1, sheet.getLastRow()-1, 11).getValues();
    var rows = allRows.filter(function(row) {
      var raw = row[2];
      var d = raw instanceof Date ? toLocalMidnight(raw) : parseLocalDate(String(raw));
      d.setHours(0,0,0,0);
      return d >= startDate && d <= endDate;
    });
    if (!rows.length) throw new Error("해당 기간에 데이터가 없습니다.");

    // 표 순서 (2026-11-01 개편 순서). 위윈EM(폐지)은 위윈 바로 뒤 — 운영 기간 밖이면 자동 생략됨
    var SERVICE_ORDER = ["주일 1부 예배","주일 2부 예배","주일 3부 EM예배","예꿈 영아부","예꿈 유치부","꿈땅","PW 중등부","PW 고등부","이음","위윈","위윈EM","새벽예배","수요예배","금요여성예배"];
    var SVC2 = ["새벽예배","금요여성예배"];
    var SVC3 = ["예꿈 영아부","예꿈 유치부","꿈땅","PW 중등부","PW 고등부"];
    var sKey = fmtKey(startDate), eKey = fmtKey(endDate);   // 운영 기간 판정용 "YYYY-MM-DD"

    var stats = {};
    SERVICE_ORDER.forEach(function(svc) {
      stats[svc] = { count:0, total:0, onsite:0, online:0, student:0, teacher:0, other:0 };
    });
    rows.forEach(function(row) {
      var svc = canonSvc(row[3]);   // 구 이름(예꿈·중등부·고등부)은 현행 이름으로 합쳐서 집계
      if (!stats[svc]) stats[svc] = { count:0, total:0, onsite:0, online:0, student:0, teacher:0, other:0 };
      stats[svc].count++;
      stats[svc].total   += Number(row[4])||0;
      stats[svc].onsite  += Number(row[5])||0;
      stats[svc].online  += Number(row[6])||0;
      stats[svc].student += Number(row[7])||0;
      stats[svc].teacher += Number(row[8])||0;
      stats[svc].other   += Number(row[9])||0;
    });

    function avg(sum, cnt) { return cnt > 0 ? Math.round(sum/cnt*10)/10 : "-"; }
    function fmtD(d) {
      var days=["일","월","화","수","목","금","토"];
      return d.getFullYear()+"."+String(d.getMonth()+1).padStart(2,"0")+"."+String(d.getDate()).padStart(2,"0")+"("+days[d.getDay()]+")";
    }

    var NAVY="#1A3070", PALE="#EEF2F9", WHITE="#FFFFFF", HDR="#C5D3EE", INK="#1A2440";

    var docTitle = "예배 출석 인원 보고 " + Utilities.formatDate(new Date(),"America/New_York","yyyy.MM.dd");
    var doc  = DocumentApp.create(docTitle);
    var body = doc.getBody();
    body.setMarginTop(40).setMarginBottom(40).setMarginLeft(54).setMarginRight(54);

    // 헤더 배너
    var hdrTbl = body.appendTable([[""]]);
    hdrTbl.setBorderWidth(0);
    var hc = hdrTbl.getCell(0,0);
    hc.setBackgroundColor(NAVY).setPaddingTop(20).setPaddingBottom(20).setPaddingLeft(24).setPaddingRight(24);
    hc.getChild(0).asParagraph().setAlignment(DocumentApp.HorizontalAlignment.CENTER)
      .editAsText().setText("BOSTON ONNURI CHURCH").setFontSize(9).setForegroundColor(HDR).setBold(false);
    var tp = hc.appendParagraph("예배 출석 인원 보고");
    tp.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
    tp.editAsText().setFontSize(24).setForegroundColor(WHITE).setBold(true);
    var pp = hc.appendParagraph(fmtD(startDate)+"  ~  "+fmtD(endDate));
    pp.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
    pp.editAsText().setFontSize(11).setForegroundColor(HDR).setBold(false);
    hdrTbl.getRow(0).setMinimumHeight(80);

    body.appendParagraph("").setSpacingAfter(8);

    // 테이블
    var headerRow = ["예배","집계\n(횟수)","총인원\n(평균)","현장\n(평균)","온라인\n(평균)","학생\n(평균)","교역자+교사\n(평균)","그외\n(평균)"];
    var tableData = [headerRow];

    function statRow(label, svc, s) {
      return [
        label,
        s.count+"회",
        avg(s.total,s.count)+"명",
        SVC2.indexOf(svc)>=0 ? avg(s.onsite,s.count)+"명" : "-",   // SVC3는 현장 "-"
        SVC2.indexOf(svc)>=0 ? avg(s.online,s.count)+"명"  : "-",
        SVC3.indexOf(svc)>=0 ? avg(s.student,s.count)+"명" : "-",
        SVC3.indexOf(svc)>=0 ? avg(s.teacher,s.count)+"명" : "-",
        SVC3.indexOf(svc)>=0 ? avg(s.other,s.count)+"명"   : "-"
      ];
    }

    SERVICE_ORDER.forEach(function(svc) {
      var s = stats[svc];
      if (!s || s.count === 0) {
        // 보고 기간 동안 운영되지 않은 예배(폐지·신설 전)는 줄 자체를 생략. 운영 중인데 없으면 "미제출".
        if (!svcActiveIn(svc, sKey, eKey)) return;
        tableData.push([svc,"미제출","-","-","-","-","-","-"]);
        return;
      }
      tableData.push(statRow(svc, svc, s));
    });

    // 안전장치: 표 순서 목록에 없는 예배명(오타·구버전 앱 제출 등)에 데이터가 있으면 표 끝에 표시 — 조용히 누락되지 않도록
    Object.keys(stats).forEach(function(svc) {
      if (SERVICE_ORDER.indexOf(svc) >= 0) return;
      var s = stats[svc];
      if (!s || s.count === 0) return;
      tableData.push(statRow(svc + " (목록 외)", svc, s));
    });

    var tbl = body.appendTable(tableData);
    tbl.setBorderColor("#C2CFE8").setBorderWidth(1);

    // 헤더행
    var hr = tbl.getRow(0);
    hr.setMinimumHeight(44);
    for (var c=0;c<8;c++) {
      var hcell = hr.getCell(c);
      hcell.setBackgroundColor(NAVY).setPaddingTop(6).setPaddingBottom(6).setPaddingLeft(5).setPaddingRight(5);
      hcell.getChild(0).asParagraph()
        .setAlignment(DocumentApp.HorizontalAlignment.CENTER)
        .editAsText().setFontSize(11).setForegroundColor(WHITE).setBold(true);
      if (c > 0 && hcell.getNumChildren() > 1) {
        hcell.getChild(1).asParagraph()
          .setAlignment(DocumentApp.HorizontalAlignment.CENTER)
          .editAsText().setFontSize(9).setForegroundColor(WHITE).setBold(false);
      }
    }
    // 데이터행
    for (var ri=1;ri<tableData.length;ri++) {
      var dr=tbl.getRow(ri);
      var miss = tableData[ri][1]==="미제출";
      var bg = miss ? "#F8F8F8" : (ri%2===1?WHITE:PALE);
      dr.setMinimumHeight(26);
      for (var ci=0;ci<8;ci++) {
        var dc=dr.getCell(ci);
        dc.setBackgroundColor(ci===2?"#E8EEF8":bg).setPaddingTop(5).setPaddingBottom(5).setPaddingLeft(5).setPaddingRight(5);
        dc.getChild(0).asParagraph()
          .setAlignment(ci===0?DocumentApp.HorizontalAlignment.LEFT:DocumentApp.HorizontalAlignment.CENTER)
          .editAsText().setFontSize(10).setBold(ci===0||ci===2)
          .setForegroundColor(miss?"#AAAAAA":(ci===0?NAVY:INK));
      }
    }

    body.appendParagraph("").setSpacingAfter(4);
    var note = body.appendParagraph("※ 평균값은 실제 제출된 건수 기준   |   생성: "+new Date().toLocaleString("ko-KR"));
    note.setAlignment(DocumentApp.HorizontalAlignment.RIGHT);
    note.editAsText().setFontSize(8).setForegroundColor("#AAAAAA");

    doc.saveAndClose();

    // ── 저장: 종료일 연도 기준 yyyy_인원 폴더 (없으면 생성) ──
    try {
      var RPT_ROOT   = DriveApp.getFolderById("1rsZdo4qlV3BPSoZ_YFIOMArEx7fwUbuX");
      var endYear    = endDate.getFullYear();
      var yearFName  = endYear + "_인원";
      var yfi        = RPT_ROOT.getFoldersByName(yearFName);
      var yearFolder = yfi.hasNext() ? yfi.next() : RPT_ROOT.createFolder(yearFName);
      var file       = DriveApp.getFileById(doc.getId());
      yearFolder.addFile(file);
      DriveApp.getRootFolder().removeFile(file);
    } catch(fe) {}

    // 생성된 문서로 리다이렉트
    var docUrl = doc.getUrl();
    return HtmlService.createHtmlOutput(
      '<script>window.location.href="'+docUrl+'";</script>' +
      '<p>보고서가 생성되었습니다. <a href="'+docUrl+'">여기를 클릭하세요</a></p>'
    );

  } catch(err) {
    return HtmlService.createHtmlOutput(
      '<p style="color:red;font-family:sans-serif;padding:20px;">보고서 생성 실패: '+err.toString()+'</p>'
    );
  }
}

// ══════════════════════════════════════════════════
// ── 월간보고 생성 (v2) ──
// ══════════════════════════════════════════════════
function handleMonthlyReport(yearStr, monthStr, authorStr) {
  // 임시 파일 ID 목록 (오류 시에도 정리)
  var tmpIds = [];

  try {
    var year  = parseInt(yearStr);
    var month = parseInt(monthStr);
    if (!year || !month || month < 1 || month > 12)
      throw new Error("올바른 연도/월을 입력해주세요.");

    var mmStr = String(month).padStart(2, "0");
    var ym    = String(year) + mmStr;

    // ────────────────────────────────────────────
    // 1. 주차 계산
    //    1주: 월의 첫 번째 일요일 ~ 그 주 토요일 (일~토)
    //         단, 첫 일요일 이전 날짜도 1주에 포함
    //    2주~: 그 다음 일요일부터 토요일씩
    //    마지막 주: 마지막 일요일 ~ 해당 월 마지막 날
    // ────────────────────────────────────────────
    var firstSun = new Date(year, month - 1, 1);
    while (firstSun.getDay() !== 0) firstSun.setDate(firstSun.getDate() + 1);
    // 첫 일요일이 속한 주의 토요일 = 첫 일요일 + 6
    var firstWeekEndDate = firstSun.getDate() + 6; // 1주차 마지막 날(일 기준)

    function getWeekNum(d) {
      if (d.getFullYear() !== year || d.getMonth() + 1 !== month) return null;
      var day = d.getDate();
      if (day <= firstWeekEndDate) return 1;
      return Math.floor((day - firstWeekEndDate - 1) / 7) + 2;
    }

    var lastDayOfMonth = new Date(year, month, 0).getDate();
    var numWeeks = getWeekNum(new Date(year, month - 1, lastDayOfMonth));
    var weekLabels = ["1주","2주","3주","4주","5주"];

    // ────────────────────────────────────────────
    // 2. 예배 인원 집계 (일요일 날짜만 사용)
    // ────────────────────────────────────────────
    var attByWeek = {};
    for (var w = 1; w <= numWeeks; w++) attByWeek[w] = {};

    var attSheet = getSheet().getSheetByName(SHEET_NAME);
    if (attSheet && attSheet.getLastRow() > 1) {
      var allAttRows = attSheet.getRange(2, 1, attSheet.getLastRow() - 1, 11).getValues();
      allAttRows.forEach(function(row) {
        var raw = row[2];
        var d   = raw instanceof Date ? toLocalMidnight(raw) : parseLocalDate(String(raw));
        if (isNaN(d.getTime())) return;
        if (d.getFullYear() !== year || d.getMonth() + 1 !== month) return;

        var wk  = getWeekNum(d);
        var svc = canonSvc(row[3]);   // 구 이름은 현행 이름으로 통일해서 합산
        if (!wk || wk < 1 || wk > numWeeks) return;
        if (!attByWeek[wk]) attByWeek[wk] = {};
        attByWeek[wk][svc] = (attByWeek[wk][svc] || 0) + (Number(row[4]) || 0);
      });
    }

    // OMA 보고서 카테고리 구성 (본문·검증시트 공통 — 여기 한 곳만 고치면 됨)
    //   성인   = 주일 1부 + 주일 2부 + 주일 3부 EM예배
    //   대청   = 위윈 + 위윈EM(폐지, 과거 합산용) + 이음
    //   차세대 = 예꿈 영아부 + 예꿈 유치부 + 꿈땅 + PW 중등부 + PW 고등부
    var CAT_ADULT = ["주일 1부 예배", "주일 2부 예배", "주일 3부 EM예배"];
    var CAT_DAEC  = ["위윈", "위윈EM", "이음"];
    var CAT_NG    = ["예꿈 영아부", "예꿈 유치부", "꿈땅", "PW 중등부", "PW 고등부"];

    function sumAtt(wk, svcs) {
      var total = 0, hasAny = false;
      svcs.forEach(function(s) {
        if (attByWeek[wk] && attByWeek[wk][s] !== undefined) {
          total  += attByWeek[wk][s];
          hasAny  = true;
        }
      });
      return hasAny ? total : "";
    }

    // ────────────────────────────────────────────
    // 3. Offerings 파일 읽기 (지정 폴더에서 검색)
    //    폴더: 1eNZOXg6B99xUa-NWDQ_eK6dFlLyvebKa
    //    파일명 내에 yyyymm(예: 202602) 포함 여부로 탐색
    // ────────────────────────────────────────────
    var OFFER_FOLDER_ID = "1eNZOXg6B99xUa-NWDQ_eK6dFlLyvebKa";

    // 하위 폴더까지 재귀 탐색
    function findOfferFile(folder) {
      var iter = folder.getFiles();
      while (iter.hasNext()) {
        var f    = iter.next();
        var name = f.getName().replace(/\s/g, "");
        if (name.indexOf(ym) >= 0 ||
            name.indexOf(year + "_" + mmStr) >= 0 ||
            name.indexOf(year + "-" + mmStr) >= 0) {
          return f;
        }
      }
      var subIter = folder.getFolders();
      while (subIter.hasNext()) {
        var found = findOfferFile(subIter.next());
        if (found) return found;
      }
      return null;
    }

    var ofFile = findOfferFile(DriveApp.getFolderById(OFFER_FOLDER_ID));
    if (!ofFile)
      throw new Error(
        "헌금내역 폴더(및 하위 폴더)에서 " + year + "년 " + month + "월 Offerings 파일을 찾을 수 없습니다.\n" +
        "파일명에 '" + ym + "' 이 포함되어야 합니다. (예: Offerings_" + ym + ".xlsx)"
      );

    // xlsx → Google Sheets 변환
    var ofResource = { title: "tmp_offers_" + ym, mimeType: MimeType.GOOGLE_SHEETS };
    var ofTmpMeta  = Drive.Files.insert(ofResource, ofFile.getBlob(), { convert: true });
    tmpIds.push(ofTmpMeta.id);

    var offerByWeek = {};
    for (var w = 1; w <= numWeeks; w++) {
      offerByWeek[w] = { gen: 0, pur: 0, oth: 0, fee: 0 };
    }

    var ofTmpSS  = SpreadsheetApp.openById(ofTmpMeta.id);
    var ofSh     = ofTmpSS.getSheets()[0];
    var ofData   = ofSh.getDataRange().getValues();

    // '날짜' 헤더 행 탐색
    var hdrIdx = -1;
    for (var i = 0; i < ofData.length; i++) {
      if (String(ofData[i][0]).trim() === "날짜") { hdrIdx = i; break; }
    }
    if (hdrIdx < 0) throw new Error("Offerings 파일에서 '날짜' 헤더를 찾을 수 없습니다.");

    for (var i = hdrIdx + 1; i < ofData.length; i++) {
      var r   = ofData[i];
      var dv  = r[0];
      var lbl = String(r[1] || "").trim();
      if (!dv || lbl === "총계" || lbl === "") continue;
      var d = dv instanceof Date ? toLocalMidnight(dv) : parseLocalDate(String(dv));
      if (isNaN(d.getTime())) continue;
      if (d.getFullYear() !== year || d.getMonth() + 1 !== month) continue;

      var wk = getWeekNum(d);
      if (!wk || wk < 1 || wk > numWeeks) continue;
      if (!offerByWeek[wk]) offerByWeek[wk] = { gen: 0, pur: 0, oth: 0, fee: 0 };

      // 일반헌금  = 주일(2) + 십일조(3) + 감사(4)
      offerByWeek[wk].gen += (Number(r[2])||0) + (Number(r[3])||0) + (Number(r[4])||0);
      // 목적헌금  = 선교작정(5) + 일반선교(7) + 비전헌금(8)
      offerByWeek[wk].pur += (Number(r[5])||0) + (Number(r[7])||0) + (Number(r[8])||0);
      // 그 외 헌금 = 절기(9)+지정(10)+순헌금(11)+회비(12)+내부(13)+기타(14)+건축(15)
      offerByWeek[wk].oth +=
        (Number(r[9])||0)+(Number(r[10])||0)+(Number(r[11])||0)+
        (Number(r[12])||0)+(Number(r[13])||0)+(Number(r[14])||0)+(Number(r[15])||0);
      // 온라인수수료(6) — 음수값 그대로
      offerByWeek[wk].fee += Number(r[6]) || 0;
    }

    // ────────────────────────────────────────────
    // 4. 템플릿 복사 후 데이터 삽입
    //    템플릿 ID: 1_lrGmsT2pbjMFAzwESfHD1pzSKYNkmJI
    //    행 구조:
    //      A1  = 'mm월 보고서'   → month + '월 보고서'
    //      B6  = 'mm_dd'        → 오늘 날짜(MM/dd)
    //      9   = 출석 헤더
    //      10~14 = 출석 주차 (1~5주, 5주차는 필요 시만)
    //      15  = 월 평균 (AVERAGE 수식 유지)
    //      18  = 헌금 헤더
    //      19~23 = 헌금 주차 (1~5주)
    //      25  = 월간 합계 (SUM 수식 유지)
    // ────────────────────────────────────────────
    var TMPL_ID = "1_lrGmsT2pbjMFAzwESfHD1pzSKYNkmJI";
    var tmplFile = DriveApp.getFileById(TMPL_ID);

    // 템플릿을 Google Sheets로 변환 (수식 보존)
    var tplResource = { title: "tmp_report_" + ym, mimeType: MimeType.GOOGLE_SHEETS };
    var tplMeta     = Drive.Files.insert(tplResource, tmplFile.getBlob(), { convert: true });
    tmpIds.push(tplMeta.id);

    var tplSS = SpreadsheetApp.openById(tplMeta.id);
    var ws    = tplSS.getSheets()[0];

    // ── 헤더 ──
    ws.getRange("A1").setValue(month + "월 보고서");
    ws.getRange("B5").setValue(authorStr || "");
    ws.getRange("B6").setValue(Utilities.formatDate(new Date(), "America/New_York", "MM/dd"));

    // 출석 데이터 행: 1주=10, 2주=11, ..., 5주=14
    // 새 템플릿 컬럼 구성:
    //   B열(B:C 병합) = 성인   (CAT_ADULT)
    //   D열(D:E 병합) = 대청   (CAT_DAEC)
    //   F열          = 차세대 (CAT_NG)
    //   G열          = 총 참석자 (성인 + 대청 + 차세대)
    var ATT_ROWS = [10, 11, 12, 13, 14];
    for (var w = 1; w <= numWeeks; w++) {
      var rn     = ATT_ROWS[w - 1];
      var adult  = sumAtt(w, CAT_ADULT);
      var daec   = sumAtt(w, CAT_DAEC);
      var ng     = sumAtt(w, CAT_NG);
      var gt     = (adult !== "" ? adult : 0) +
                   (daec  !== "" ? daec  : 0) +
                   (ng    !== "" ? ng    : 0);
      ws.getRange(rn, 1).setValue(weekLabels[w - 1]);
      ws.getRange(rn, 2).setValue(adult);  // B열 = 성인 (B:C 병합)
      ws.getRange(rn, 4).setValue(daec);   // D열 = 대청 (D:E 병합)
      ws.getRange(rn, 6).setValue(ng);     // F열 = 차세대
      ws.getRange(rn, 7).setValue(gt !== 0 ? gt : "");
    }

    // 헌금 데이터 행: 1주=19, 2주=20, ..., 5주=23
    var OF_ROWS = [19, 20, 21, 22, 23];
    for (var w = 1; w <= numWeeks; w++) {
      var rn = OF_ROWS[w - 1];
      var o  = offerByWeek[w] || { gen: 0, pur: 0, oth: 0, fee: 0 };
      var gn  = Math.round(o.gen * 100) / 100;
      var pur = Math.round(o.pur * 100) / 100;
      var oth = Math.round(o.oth * 100) / 100;
      var fee = Math.round(o.fee * 100) / 100;
      var tot = Math.round((gn + pur + oth) * 100) / 100;
      var net = Math.round((tot + fee) * 100) / 100;

      ws.getRange(rn, 1).setValue(weekLabels[w - 1]);
      ws.getRange(rn, 2).setValue(gn  || "");
      ws.getRange(rn, 3).setValue(pur || "");
      ws.getRange(rn, 4).setValue(oth || "");
      ws.getRange(rn, 5).setValue(tot || "");
      ws.getRange(rn, 6).setValue(fee || "");
      ws.getRange(rn, 7).setValue(net || "");
    }

    SpreadsheetApp.flush();

    // ────────────────────────────────────────────
    // 5. xlsx 내보내기 후 지정 폴더/연도 서브폴더에 저장
    //    출력 폴더: 1vnJDELG4Zwh-4thJ4VBp9ZeEpjVSK1WK
    //    서브폴더: yyyy_OMA (없으면 생성)
    // ────────────────────────────────────────────
    var rptTitle = "보스턴 온누리_월간보고_" + year + "_" + mmStr;

    var expUrl  = "https://docs.google.com/spreadsheets/d/" + tplMeta.id + "/export?format=xlsx";
    var expBlob = UrlFetchApp.fetch(expUrl, {
      headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken() },
      muteHttpExceptions: true
    }).getBlob().setName(rptTitle + ".xlsx");

    var ROOT_FOLDER_ID  = "1vnJDELG4Zwh-4thJ4VBp9ZeEpjVSK1WK";
    var yearFolderName  = year + "_OMA";
    var rootFolder      = DriveApp.getFolderById(ROOT_FOLDER_ID);
    var yearFolderIter  = rootFolder.getFoldersByName(yearFolderName);
    var yearFolder      = yearFolderIter.hasNext()
                            ? yearFolderIter.next()
                            : rootFolder.createFolder(yearFolderName);

    var outFile = yearFolder.createFile(expBlob);

    // ────────────────────────────────────────────
    // 6. 검증 파일 생성 (확인용 하위 폴더)
    //    - Sheet1: Offerings 사본 + 셀 색상 표시 + 범례
    //    - Sheet2: 예배인원 확인 (주차별 상세)
    // ────────────────────────────────────────────
    var verFolderIter = yearFolder.getFoldersByName("확인용");
    var verFolder     = verFolderIter.hasNext()
                          ? verFolderIter.next()
                          : yearFolder.createFolder("확인용");

    // Offerings 사본 (Drive.Files.copy)
    var verTitle = "확인용_" + year + "_" + mmStr;
    var verMeta  = Drive.Files.copy({ title: verTitle }, ofTmpMeta.id);
    var verSS    = SpreadsheetApp.openById(verMeta.id);
    var verSh    = verSS.getSheets()[0];
    verSh.setName("헌금내역 확인");

    // 색상 정의 — 주차별 행 색상 (연한 배경)
    var C_WEEK = ["#FFF9C4","#E8F5E9","#E3F2FD","#FFF3E0","#F3E5F5"]; // 1~5주: 노/초/파/주황/보라
    // 색상 정의 — 카테고리별 셀 색상 (진한 강조, 행 색상 위에 덮어씀)
    var C_GEN = "#93C6E5"; // 일반헌금  — 파란색
    var C_PUR = "#82C991"; // 목적헌금  — 초록색
    var C_OTH = "#F4A572"; // 그 외 헌금 — 주황색
    var C_FEE = "#F28B8B"; // 온라인수수료 — 빨간색

    // 데이터 행 순회: 먼저 주차 행 색상 → 그 위에 카테고리 셀 색상
    var maxCol = verSh.getLastColumn();
    for (var vi = hdrIdx + 1; vi < ofData.length; vi++) {
      var vr  = ofData[vi];
      var vdv = vr[0];
      var vlb = String(vr[1] || "").trim();
      if (!vdv || vlb === "총계" || vlb === "") continue;
      var vd  = vdv instanceof Date ? toLocalMidnight(vdv) : parseLocalDate(String(vdv));
      if (isNaN(vd.getTime())) continue;
      if (vd.getFullYear() !== year || vd.getMonth() + 1 !== month) continue;

      var vsr  = vi + 1; // sheet row (1-based)
      var vwk  = getWeekNum(vd);
      var wBg  = C_WEEK[(vwk - 1) % 5]; // 주차 배경색

      // ① 행 전체에 주차 배경색 적용
      verSh.getRange(vsr, 1, 1, maxCol).setBackground(wBg);

      // ② 카테고리 해당 셀에 강조색 덮어쓰기
      // 일반헌금: 주일(3), 십일조(4), 감사(5)
      if (Number(vr[2])) verSh.getRange(vsr, 3).setBackground(C_GEN);
      if (Number(vr[3])) verSh.getRange(vsr, 4).setBackground(C_GEN);
      if (Number(vr[4])) verSh.getRange(vsr, 5).setBackground(C_GEN);
      // 목적헌금: 선교작정(6), 일반선교(8), 비전헌금(9)
      if (Number(vr[5])) verSh.getRange(vsr, 6).setBackground(C_PUR);
      if (Number(vr[7])) verSh.getRange(vsr, 8).setBackground(C_PUR);
      if (Number(vr[8])) verSh.getRange(vsr, 9).setBackground(C_PUR);
      // 온라인수수료: (7)
      if (Number(vr[6])) verSh.getRange(vsr, 7).setBackground(C_FEE);
      // 그 외 헌금: 절기(10)~건축(16)
      for (var vc = 9; vc <= 15; vc++) {
        if (Number(vr[vc])) verSh.getRange(vsr, vc + 1).setBackground(C_OTH);
      }
    }

    // 범례 (주차 + 카테고리 모두 표시)
    var legRow = ofData.length + 3;
    verSh.getRange(legRow, 1).setValue("[ 행 색상 — 주차 구분 ]").setFontWeight("bold").setFontSize(11);
    for (var lw = 0; lw < Math.min(numWeeks, 5); lw++) {
      verSh.getRange(legRow + 1 + lw, 1)
        .setValue("  " + (lw+1) + "주차")
        .setBackground(C_WEEK[lw]).setFontWeight("bold").setFontColor("#1A2440");
    }
    var legCat = legRow + 7;
    verSh.getRange(legCat, 1).setValue("[ 셀 색상 — 카테고리 구분 (행 색상 위에 표시) ]").setFontWeight("bold").setFontSize(11);
    verSh.getRange(legCat+1, 1).setValue("■ 일반헌금   — 주일 + 십일조 + 감사").setBackground(C_GEN).setFontWeight("bold").setFontColor("#1A2440");
    verSh.getRange(legCat+2, 1).setValue("■ 목적헌금   — 선교작정 + 일반선교 + 비전헌금").setBackground(C_PUR).setFontWeight("bold").setFontColor("#1A2440");
    verSh.getRange(legCat+3, 1).setValue("■ 그 외 헌금 — 절기 + 지정 + 순헌금 + 회비 + 내부 + 기타 + 건축").setBackground(C_OTH).setFontWeight("bold").setFontColor("#1A2440");
    verSh.getRange(legCat+4, 1).setValue("■ 온라인수수료").setBackground(C_FEE).setFontWeight("bold").setFontColor("#1A2440");

    // ── 예배인원 확인 탭 ──
    var attVsh = verSS.insertSheet("예배인원 확인");
    var HDR_BG = "#1A3070";

    // 헤더
    attVsh.getRange(1,1,1,6).setValues([["주차","예배날짜","예배명","총인원","구성 상세","보고서 반영 카테고리"]])
      .setBackground(HDR_BG).setFontColor("#FFFFFF").setFontWeight("bold").setHorizontalAlignment("center");
    attVsh.setFrozenRows(1);

    // 서비스 타입 분류
    var SVC_ONOFF  = ["새벽예배","금요여성예배"];
    var SVC_CHILD  = CAT_NG;   // 차세대 = 학생/교역자+교사/그외 구성

    // 카테고리 색상·라벨 — CAT_ADULT/CAT_DAEC/CAT_NG 기준으로 자동 생성 (현행 이름 기준)
    var CAT_COLOR = {}, CAT_LABEL = {};
    CAT_ADULT.forEach(function(s) { CAT_COLOR[s] = "#DDEEFF"; CAT_LABEL[s] = "성인"; });
    CAT_DAEC .forEach(function(s) { CAT_COLOR[s] = "#D8EED9"; CAT_LABEL[s] = "대청"; });
    CAT_NG   .forEach(function(s) { CAT_COLOR[s] = "#FCE4D6"; CAT_LABEL[s] = "차세대"; });

    var attVRow = 2;

    for (var w = 1; w <= numWeeks; w++) {
      // 주차 구분 행
      attVsh.getRange(attVRow, 1, 1, 6).merge()
        .setValue("◆ " + weekLabels[w-1])
        .setBackground(C_WEEK[w-1]).setFontWeight("bold").setFontSize(11)
        .setHorizontalAlignment("left").setFontColor("#1A3070");
      attVRow++;

      // 이 주차에 해당하는 레코드
      var wkRecs = [];
      allAttRows.forEach(function(row) {
        var rraw = row[2];
        var rd   = rraw instanceof Date ? toLocalMidnight(rraw) : parseLocalDate(String(rraw));
        if (isNaN(rd.getTime())) return;
        if (rd.getFullYear() !== year || rd.getMonth() + 1 !== month) return;
        if (getWeekNum(rd) !== w) return;
        var rawSvc = String(row[3]).trim();
        var rsvc   = canonSvc(rawSvc);                       // 카테고리 판정·합산은 현행 이름 기준
        var dispSvc = (rawSvc !== rsvc) ? rsvc + " (구 " + rawSvc + ")" : rsvc;   // 시트 원문이 구 이름이면 병기
        var rtotal = Number(row[4]) || 0;
        var detail = "";
        if (SVC_ONOFF.indexOf(rsvc) >= 0) {
          detail = "현장 " + (Number(row[5])||0) + " + 온라인 " + (Number(row[6])||0);
        } else if (SVC_CHILD.indexOf(rsvc) >= 0) {
          detail = "학생 " + (Number(row[7])||0) + " + 교역자+교사 " + (Number(row[8])||0) + " + 그외 " + (Number(row[9])||0);
        }
        var dstr = Utilities.formatDate(rd, "America/New_York", "MM/dd (EEE)");
        wkRecs.push({ date: dstr, svc: rsvc, disp: dispSvc, total: rtotal, detail: detail });
      });

      if (wkRecs.length === 0) {
        attVsh.getRange(attVRow, 1, 1, 6)
          .setValues([[weekLabels[w-1], "", "(데이터 없음)", "", "", ""]])
          .setBackground(C_WEEK[w-1]).setFontColor("#AAAAAA").setFontStyle("italic");
        attVRow++;
      } else {
        wkRecs.forEach(function(rec) {
          var cat = CAT_LABEL[rec.svc] || "-";
          // 행 전체: 주차 배경색 → 카테고리 열만 진한 강조
          attVsh.getRange(attVRow, 1, 1, 6).setBackground(C_WEEK[w-1]);
          attVsh.getRange(attVRow, 3).setBackground(CAT_COLOR[rec.svc] || C_WEEK[w-1]);
          attVsh.getRange(attVRow, 1, 1, 6).setValues([[
            weekLabels[w-1], rec.date, rec.disp, rec.total, rec.detail, cat
          ]]);
          attVRow++;
        });
      }

      // 주차 소계 행
      var sAdult = sumAtt(w, CAT_ADULT);
      var sDaec  = sumAtt(w, CAT_DAEC);
      var sNg    = sumAtt(w, CAT_NG);
      attVsh.getRange(attVRow, 1, 1, 6).setValues([[
        "", "→ 보고서 입력",
        "성인: " + (sAdult||0) + "   대청: " + (sDaec||0) + "   차세대: " + (sNg||0),
        "", "", ""
      ]]).setBackground("#EEF2F9").setFontColor("#556789").setFontStyle("italic");
      attVRow++;
      attVRow++; // 빈 행
    }

    // 열 너비
    [70, 100, 140, 70, 220, 140].forEach(function(w, i) { attVsh.setColumnWidth(i+1, w); });
    verSh.activate();

    // 검증 파일 확인용 폴더로 이동
    var verDriveFile = DriveApp.getFileById(verMeta.id);
    verFolder.addFile(verDriveFile);
    DriveApp.getRootFolder().removeFile(verDriveFile);

    // 임시 파일 정리
    tmpIds.forEach(function(id) {
      try { DriveApp.getFileById(id).setTrashed(true); } catch(e) {}
    });

    // ── 완료 화면 ──
    var html =
      '<!DOCTYPE html><html lang="ko"><head>' +
      '<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<style>' +
      'body{font-family:-apple-system,sans-serif;background:#F4F7FC;margin:0;padding:20px;' +
      'display:flex;align-items:center;justify-content:center;min-height:100vh;box-sizing:border-box;}' +
      '.card{background:#fff;border-radius:16px;padding:32px 24px;max-width:420px;width:100%;' +
      'text-align:center;box-shadow:0 4px 20px rgba(26,48,112,.12);}' +
      '.icon{font-size:56px;margin-bottom:12px;}' +
      'h2{color:#1A3070;font-size:18px;margin:0 0 6px;}' +
      '.sub{color:#2E7D32;font-size:13px;margin:0 0 4px;}' +
      '.fname{color:#556789;font-size:12px;margin:0 0 20px;word-break:break-all;}' +
      '.btn{display:inline-block;padding:13px 24px;background:#1A3070;color:#fff;' +
      'text-decoration:none;border-radius:10px;font-weight:700;font-size:14px;}' +
      '.note{font-size:11px;color:#AAAAAA;margin-top:14px;line-height:1.6;}' +
      '</style></head><body>' +
      '<div class="card">' +
      '<div class="icon">✅</div>' +
      '<h2>월간보고 생성 완료</h2>' +
      '<p class="sub">📁 ' + yearFolderName + ' 폴더에 저장됨</p>' +
      '<p class="fname">' + rptTitle + '.xlsx</p>' +
      '<a class="btn" href="' + outFile.getUrl() + '" target="_blank">📂 월간보고서 열기</a>' +
      '<br><br>' +
      '<a class="btn" href="' + verSS.getUrl() + '" target="_blank" style="background:#2E7D32;">🔍 검증 파일 열기</a>' +
      '<p class="note">' +
        year + '년 ' + month + '월 · ' + numWeeks + '주차 데이터<br>' +
        '검증 파일 저장 위치: ' + yearFolderName + '/확인용/<br>' +
        '생성: ' + Utilities.formatDate(new Date(),"America/New_York","yyyy-MM-dd HH:mm") + ' (Boston)' +
      '</p>' +
      '</div></body></html>';

    return HtmlService.createHtmlOutput(html)
      .setTitle("월간보고 생성 완료")
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);

  } catch(err) {
    // 오류 시 임시 파일 정리
    tmpIds.forEach(function(id) {
      try { DriveApp.getFileById(id).setTrashed(true); } catch(e) {}
    });
    var errHtml =
      '<!DOCTYPE html><html><body style="font-family:sans-serif;padding:30px;">' +
      '<h3 style="color:#C0392B;">⚠️ 오류 발생</h3>' +
      '<pre style="background:#FFF0F0;padding:12px;border-radius:8px;font-size:13px;white-space:pre-wrap;">' +
      err.toString() + '</pre>' +
      '<p style="color:#556789;font-size:12px;margin-top:12px;">' +
      '확인 사항:<br>' +
      '① Apps Script Services 에서 <b>Google Drive API (v2)</b> 활성화<br>' +
      '② 헌금내역 폴더에 해당 월 Offerings 파일 존재 여부<br>' +
      '③ 템플릿 파일 접근 권한' +
      '</p></body></html>';
    return HtmlService.createHtmlOutput(errHtml);
  }
}