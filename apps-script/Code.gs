/**
 * 후쿠오카 여행앱 요청 접수 스크립트
 * 앱에서 보낸 요청을 시트 '요청' 탭에 한 줄 추가하고, Claude 요청 처리 루틴을 바로 깨운다.
 *
 * 스크립트 속성(프로젝트 설정 → 스크립트 속성)
 *   APP_PIN           가족끼리 공유하는 요청 비밀번호 (필수)
 *   ROUTINE_FIRE_URL  Claude 루틴 API 트리거 URL (없으면 루틴을 깨우지 않고 요청만 저장)
 *   ROUTINE_TOKEN     루틴 API 트리거 토큰
 *   ROUTINE_HEADERS   (선택) 추가 헤더 JSON. 예: {"anthropic-beta":"...","anthropic-version":"2023-06-01"}
 *   ATTACH_FOLDER_ID  (선택) 첨부 저장 폴더 ID. 없으면 시트가 있는 폴더 안에 '요청 첨부' 폴더를 만들어 쓴다.
 */
const SHEET_NAME = '요청';
const MAX_LEN = 500;
const MAX_FILES = 3;
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const ALLOWED_TYPES = /^(image\/(jpeg|png|webp|heic|heif|gif)|application\/pdf)$/;

function doPost(e) {
  const props = PropertiesService.getScriptProperties();
  let body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return json({ ok: false, error: '잘못된 요청 형식' }); }

  const pin = String(body.pin || '');
  const name = String(body.name || '').trim().slice(0, 30) || '익명';
  const text = String(body.text || '').trim().slice(0, MAX_LEN);
  if (!props.getProperty('APP_PIN') || pin !== props.getProperty('APP_PIN')) return json({ ok: false, error: '비밀번호가 맞지 않아요' });
  if (!text) return json({ ok: false, error: '요청 내용이 비어 있어요' });

  const files = Array.isArray(body.files) ? body.files.slice(0, MAX_FILES) : [];
  const saved = [];
  if (files.length) {
    const folder = attachFolder(props);
    const stamp = Utilities.formatDate(new Date(), 'Asia/Seoul', 'MMdd-HHmm');
    for (const f of files) {
      const type = String(f.type || '');
      if (!ALLOWED_TYPES.test(type)) return json({ ok: false, error: '사진이나 PDF만 올릴 수 있어요' });
      const bytes = Utilities.base64Decode(String(f.data || ''));
      if (!bytes.length || bytes.length > MAX_FILE_BYTES) return json({ ok: false, error: '파일은 8MB까지 올릴 수 있어요' });
      const safeName = (stamp + ' ' + name + ' ' + String(f.name || 'file')).replace(/[\\/:*?"<>|]/g, '_').slice(0, 120);
      const file = folder.createFile(Utilities.newBlob(bytes, type, safeName));
      saved.push(safeName + ' | ' + file.getUrl());
    }
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  let row;
  try {
    const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_NAME);
    const now = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm');
    sh.appendRow(["'" + now, name, text, '대기', '', '', saved.join('\n')]);
    row = sh.getLastRow();
  } finally {
    lock.releaseLock();
  }

  const fired = fireRoutine(props, `시트 '요청' 탭 ${row}행에 새 요청이 들어왔어요 (${name}).`);
  return json({ ok: true, row: row, fired: fired, files: saved.length });
}

function attachFolder(props) {
  const id = props.getProperty('ATTACH_FOLDER_ID');
  if (id) return DriveApp.getFolderById(id);
  const parent = DriveApp.getFileById(SpreadsheetApp.getActive().getId()).getParents().next();
  const it = parent.getFoldersByName('요청 첨부');
  const folder = it.hasNext() ? it.next() : parent.createFolder('요청 첨부');
  props.setProperty('ATTACH_FOLDER_ID', folder.getId());
  return folder;
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
