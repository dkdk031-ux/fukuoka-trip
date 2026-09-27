/**
 * 후쿠오카 여행앱 API (Apps Script 웹 앱)
 * 화면은 GitHub Pages 앱이 그리고, 이 스크립트는 로그인 확인과 시트 데이터 전달만 한다.
 *
 * 배포: 배포 → 배포 관리 → 편집(연필) → 버전: 새 버전
 *   - 다음 사용자 인증 정보로 실행: 나
 *   - 액세스 권한이 있는 사용자: 모든 사용자
 *
 * 접속 허용: ☆후쿠오카 폴더(또는 시트)를 공유받은 계정 + 소유자. 공유에서 빼면 10분 안에 차단된다.
 *
 * 스크립트 속성
 *   GOOGLE_CLIENT_ID  (선택) OAuth 클라이언트 ID. 비우면 아래 CLIENT_ID 사용
 *   ROUTINE_FIRE_URL, ROUTINE_TOKEN, ROUTINE_HEADERS(JSON)  요청이 들어오면 Claude 루틴을 깨운다 (선택)
 *   SESSION_SECRET    로그인 유지용 서명 키. 비워두면 처음 실행 때 자동 생성
 */
const SHEET_ID = '1la5_IUEKxlXuIySWkCRexx_n-4QUPi80eRuLv0BW27Y';
const FOLDER_ID = '1mIYQG3k0QQxruvwEk0dHv-1LMhM0gtRx';        // ☆후쿠오카
const ATTACH_FOLDER_ID = '1u2wL6asQIthUxrB_H34sQgSGiSMBHyRI'; // ☆후쿠오카/요청 첨부
const TABS = ['일정', '예약정보', '비용', '쇼핑', '체크리스트', '일자정보', '앱설정', '요청'];
const CLIENT_ID = '96798192149-km1bfg6dm5lhnq3og56c4mto875nms0f.apps.googleusercontent.com'; // 공개돼도 되는 값
const SESSION_DAYS = 30;
const MAX_LEN = 500;
const MAX_FILES = 3;
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const ALLOWED_TYPES = /^(image\/(jpeg|png|webp|heic|heif|gif)|application\/pdf)$/;

function doGet() {
  return json({ ok: true, service: 'fukuoka-trip-api' });
}

function doPost(e) {
  let body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return json({ ok: false, error: '잘못된 요청 형식' }); }
  try {
    if (body.action === 'login') return json(login(body.idToken));
    const email = checkSession(body.session);
    if (!email) return json({ ok: false, auth: false, error: '다시 로그인해 주세요' });
    if (!isAllowed(email)) return json({ ok: false, auth: false, denied: true, error: '초대받지 않은 계정이에요: ' + email });
    if (body.action === 'data') return json(getData(email));
    if (body.action === 'request') return json(submitRequest(email, body));
    return json({ ok: false, error: '알 수 없는 요청' });
  } catch (err) {
    return json({ ok: false, error: String(err && err.message || err) });
  }
}

/* ───────── 로그인 ───────── */
function login(idToken) {
  const clientId = clientIdOf();
  const res = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken || ''), { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) return { ok: false, auth: false, error: '구글 로그인 확인에 실패했어요' };
  const info = JSON.parse(res.getContentText());
  if (info.aud !== clientId || String(info.email_verified) !== 'true' || Number(info.exp) * 1000 < Date.now()) {
    return { ok: false, auth: false, error: '구글 로그인 정보가 올바르지 않아요' };
  }
  const email = String(info.email).toLowerCase();
  if (!isAllowed(email)) return { ok: false, auth: false, denied: true, error: '초대받지 않은 계정이에요: ' + email };
  return { ok: true, email: email, name: info.name || '', session: makeSession(email) };
}

function clientIdOf() {
  return (PropertiesService.getScriptProperties().getProperty('GOOGLE_CLIENT_ID') || CLIENT_ID).trim();
}

function secret() {
  const props = PropertiesService.getScriptProperties();
  let s = props.getProperty('SESSION_SECRET');
  if (!s) { s = Utilities.getUuid() + Utilities.getUuid(); props.setProperty('SESSION_SECRET', s); }
  return s;
}
function sign(payload) {
  return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(payload, secret()));
}
function makeSession(email) {
  const payload = Utilities.base64EncodeWebSafe(JSON.stringify({ e: email, x: Date.now() + SESSION_DAYS * 864e5 }));
  return payload + '.' + sign(payload);
}
function checkSession(session) {
  const parts = String(session || '').split('.');
  if (parts.length !== 2 || sign(parts[0]) !== parts[1]) return '';
  try {
    const p = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0])).getDataAsString());
    return p.x > Date.now() ? p.e : '';
  } catch (err) { return ''; }
}

/** 폴더·시트를 공유받은 계정과 소유자만 허용 (10분 캐시, 목록에 없으면 1분에 한 번 새로 확인) */
function isAllowed(email) {
  email = String(email).toLowerCase();
  const cache = CacheService.getScriptCache();
  let list = cache.get('allowed');
  if (!list || (list.split(',').indexOf(email) < 0 && !cache.get('recheck'))) {
    if (list) cache.put('recheck', '1', 60);
    list = loadAllowed();
    cache.put('allowed', list, 600);
  }
  return list.split(',').indexOf(email) > -1;
}
function loadAllowed() {
  const set = {};
  const add = function (users) { users.forEach(function (u) { const m = u.getEmail(); if (m) set[m.toLowerCase()] = 1; }); };
  [DriveApp.getFolderById(FOLDER_ID), DriveApp.getFileById(SHEET_ID)].forEach(function (x) {
    add(x.getEditors()); add(x.getViewers()); set[x.getOwner().getEmail().toLowerCase()] = 1;
  });
  return Object.keys(set).join(',');
}

/* ───────── 데이터 ───────── */
function getData(email) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const tabs = {};
  TABS.forEach(function (name) {
    const sh = ss.getSheetByName(name);
    if (!sh) return;
    const rows = sh.getDataRange().getDisplayValues();
    while (rows.length > 1 && rows[rows.length - 1].every(function (v) { return v === ''; })) rows.pop();
    tabs[name] = rows;
  });
  return { ok: true, tabs: tabs, user: email };
}

/* ───────── Claude에게 요청 ───────── */
function submitRequest(email, req) {
  const text = String(req.text || '').trim().slice(0, MAX_LEN);
  if (!text) return { ok: false, error: '요청 내용이 비어 있어요' };
  const files = Array.isArray(req.files) ? req.files.slice(0, MAX_FILES) : [];
  const saved = [];
  if (files.length) {
    const folder = DriveApp.getFolderById(ATTACH_FOLDER_ID);
    const stamp = Utilities.formatDate(new Date(), 'Asia/Seoul', 'MMdd-HHmm');
    for (let i = 0; i < files.length; i++) {
      const f = files[i], type = String(f.type || '');
      if (!ALLOWED_TYPES.test(type)) return { ok: false, error: '사진이나 PDF만 올릴 수 있어요' };
      const bytes = Utilities.base64Decode(String(f.data || ''));
      if (!bytes.length || bytes.length > MAX_FILE_BYTES) return { ok: false, error: '파일은 8MB까지 올릴 수 있어요' };
      const safeName = (stamp + ' ' + email.split('@')[0] + ' ' + String(f.name || 'file')).replace(/[\\/:*?"<>|]/g, '_').slice(0, 120);
      saved.push(safeName + ' | ' + folder.createFile(Utilities.newBlob(bytes, type, safeName)).getUrl());
    }
  }
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  let row;
  try {
    const sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName('요청');
    const now = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm');
    sh.appendRow(["'" + now, email, text, '대기', '', '', saved.join('\n')]);
    row = sh.getLastRow();
  } finally {
    lock.releaseLock();
  }
  return { ok: true, row: row, fired: fireRoutine("시트 '요청' 탭 " + row + "행에 새 요청이 들어왔어요 (" + email + ")."), files: saved.length };
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

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/** 편집기에서 한 번 실행: 권한 승인 + 허용 계정 목록 확인 + 루틴 연결 테스트 */
function setupCheck() {
  secret();
  CacheService.getScriptCache().put('allowed', loadAllowed(), 600);
  Logger.log('허용 계정: ' + CacheService.getScriptCache().get('allowed'));
  Logger.log('클라이언트 ID: ' + clientIdOf());
  Logger.log('루틴 연결: ' + fireRoutine('연결 테스트입니다. 처리할 요청이 없으면 그대로 종료하세요.'));
}
