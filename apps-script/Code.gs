/**
 * 후쿠오카 여행앱 (Apps Script 웹 앱)
 *
 * 배포: 배포 → 새 배포 → 웹 앱
 *   - 다음 사용자 인증 정보로 실행: "웹 앱에 액세스하는 사용자"
 *   - 액세스 권한이 있는 사용자: "Google 계정이 있는 모든 사용자"
 * 접속 권한은 ☆후쿠오카 폴더(또는 이 시트) 공유로 관리한다. 공유받지 않은 계정은 데이터를 읽을 수 없다.
 *
 * 스크립트 속성(선택): ROUTINE_FIRE_URL, ROUTINE_TOKEN, ROUTINE_HEADERS(JSON) → 요청이 들어오면 Claude 루틴을 깨운다.
 */
const SHEET_ID = '1la5_IUEKxlXuIySWkCRexx_n-4QUPi80eRuLv0BW27Y';
const ATTACH_FOLDER_ID = '1u2wL6asQIthUxrB_H34sQgSGiSMBHyRI';
const TABS = ['일정', '예약정보', '비용', '쇼핑', '체크리스트', '일자정보', '앱설정', '요청'];
const MAX_LEN = 500;
const MAX_FILES = 3;
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const ALLOWED_TYPES = /^(image\/(jpeg|png|webp|heic|heif|gif)|application\/pdf)$/;

function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('후쿠오카 3박 4일')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover');
}

/** 앱이 읽는 모든 탭을 표시값 그대로 돌려준다. 공유받지 않은 사용자는 여기서 권한 오류가 난다. */
function getData() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const tabs = {};
  TABS.forEach(function (name) {
    const sh = ss.getSheetByName(name);
    if (!sh) return;
    const rows = sh.getDataRange().getDisplayValues();
    while (rows.length > 1 && rows[rows.length - 1].every(function (v) { return v === ''; })) rows.pop();
    tabs[name] = rows;
  });
  return { tabs: tabs, user: Session.getActiveUser().getEmail() };
}

/** 앱의 "Claude에게 요청" → '요청' 탭에 한 줄 추가하고 루틴을 깨운다. 보낸 사람은 로그인한 구글 계정. */
function submitRequest(req) {
  const user = Session.getActiveUser().getEmail() || '알 수 없음';
  const text = String((req && req.text) || '').trim().slice(0, MAX_LEN);
  if (!text) throw new Error('요청 내용이 비어 있어요');

  const ss = SpreadsheetApp.openById(SHEET_ID);
  const files = Array.isArray(req.files) ? req.files.slice(0, MAX_FILES) : [];
  const saved = [];
  if (files.length) {
    const folder = DriveApp.getFolderById(ATTACH_FOLDER_ID);
    const stamp = Utilities.formatDate(new Date(), 'Asia/Seoul', 'MMdd-HHmm');
    files.forEach(function (f) {
      const type = String(f.type || '');
      if (!ALLOWED_TYPES.test(type)) throw new Error('사진이나 PDF만 올릴 수 있어요');
      const bytes = Utilities.base64Decode(String(f.data || ''));
      if (!bytes.length || bytes.length > MAX_FILE_BYTES) throw new Error('파일은 8MB까지 올릴 수 있어요');
      const safeName = (stamp + ' ' + user.split('@')[0] + ' ' + String(f.name || 'file')).replace(/[\\/:*?"<>|]/g, '_').slice(0, 120);
      saved.push(safeName + ' | ' + folder.createFile(Utilities.newBlob(bytes, type, safeName)).getUrl());
    });
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  let row;
  try {
    const sh = ss.getSheetByName('요청');
    const now = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm');
    sh.appendRow(["'" + now, user, text, '대기', '', '', saved.join('\n')]);
    row = sh.getLastRow();
  } finally {
    lock.releaseLock();
  }
  return { ok: true, row: row, fired: fireRoutine("시트 '요청' 탭 " + row + "행에 새 요청이 들어왔어요 (" + user + ")."), files: saved.length };
}

function fireRoutine(text) {
  const props = PropertiesService.getScriptProperties();
  const url = props.getProperty('ROUTINE_FIRE_URL');
  const token = props.getProperty('ROUTINE_TOKEN');
  if (!url || !token) return 'not-configured';
  const headers = { Authorization: 'Bearer ' + token };
  try { Object.assign(headers, JSON.parse(props.getProperty('ROUTINE_HEADERS') || '{}')); } catch (err) {}
  try {
    return UrlFetchApp.fetch(url, {
      method: 'post', contentType: 'application/json', headers: headers,
      payload: JSON.stringify({ text: text }), muteHttpExceptions: true
    }).getResponseCode();
  } catch (err) {
    return 'error';
  }
}

/** 설정 확인용: 편집기에서 한 번 실행하면 권한 승인과 루틴 연결을 테스트할 수 있다. 로그에 200이 나오면 성공. */
function testFire() {
  Logger.log(fireRoutine('연결 테스트입니다. 처리할 요청이 없으면 그대로 종료하세요.'));
}
