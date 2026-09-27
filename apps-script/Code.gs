/**
 * 후쿠오카 여행앱 요청 접수 스크립트
 * 앱에서 보낸 요청을 시트 '요청' 탭에 한 줄 추가하고, Claude 요청 처리 루틴을 바로 깨운다.
 *
 * 스크립트 속성(프로젝트 설정 → 스크립트 속성)
 *   APP_PIN           가족끼리 공유하는 요청 비밀번호 (필수)
 *   ROUTINE_FIRE_URL  Claude 루틴 API 트리거 URL (없으면 루틴을 깨우지 않고 요청만 저장)
 *   ROUTINE_TOKEN     루틴 API 트리거 토큰
 *   ROUTINE_HEADERS   (선택) 추가 헤더 JSON. 예: {"anthropic-beta":"...","anthropic-version":"2023-06-01"}
 */
const SHEET_NAME = '요청';
const MAX_LEN = 500;

function doPost(e) {
  const props = PropertiesService.getScriptProperties();
  let body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return json({ ok: false, error: '잘못된 요청 형식' }); }

  const pin = String(body.pin || '');
  const name = String(body.name || '').trim().slice(0, 30) || '익명';
  const text = String(body.text || '').trim().slice(0, MAX_LEN);
  if (!props.getProperty('APP_PIN') || pin !== props.getProperty('APP_PIN')) return json({ ok: false, error: '비밀번호가 맞지 않아요' });
  if (!text) return json({ ok: false, error: '요청 내용이 비어 있어요' });

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  let row;
  try {
    const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_NAME);
    const now = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm');
    sh.appendRow(["'" + now, name, text, '대기', '', '']);
    row = sh.getLastRow();
  } finally {
    lock.releaseLock();
  }

  const fired = fireRoutine(props, `시트 '요청' 탭 ${row}행에 새 요청이 들어왔어요 (${name}).`);
  return json({ ok: true, row: row, fired: fired });
}

function doGet() {
  return json({ ok: true, service: 'fukuoka-trip-requests' });
}

function fireRoutine(props, text) {
  const url = props.getProperty('ROUTINE_FIRE_URL');
  const token = props.getProperty('ROUTINE_TOKEN');
  if (!url || !token) return 'not-configured';
  let headers = { Authorization: 'Bearer ' + token };
  try { Object.assign(headers, JSON.parse(props.getProperty('ROUTINE_HEADERS') || '{}')); } catch (err) {}
  try {
    const res = UrlFetchApp.fetch(url, {
      method: 'post', contentType: 'application/json', headers: headers,
      payload: JSON.stringify({ text: text }), muteHttpExceptions: true
    });
    return res.getResponseCode();
  } catch (err) {
    return 'error';
  }
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/** 설정 확인용: 편집기에서 이 함수를 한 번 실행하면 권한 승인과 루틴 연결을 테스트할 수 있다. */
function testFire() {
  Logger.log(fireRoutine(PropertiesService.getScriptProperties(), '연결 테스트입니다. 처리할 요청이 없으면 그대로 종료하세요.'));
}
