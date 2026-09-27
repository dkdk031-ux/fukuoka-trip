# 요청 접수 스크립트 설정

앱의 "Claude에게 요청"은 이 스크립트로 시트 `요청` 탭에 요청을 쌓고, Claude 루틴을 바로 깨웁니다.

1. 구글 시트(후쿠오카 여행 마스터 2026) → **확장 프로그램 → Apps Script**
2. 기본 `Code.gs` 내용을 지우고 이 폴더의 `Code.gs`를 붙여넣고 저장
3. **프로젝트 설정(톱니) → 스크립트 속성**에 추가
   - `APP_PIN`: 가족끼리 쓸 요청 비밀번호
   - `ATTACH_FOLDER_ID` (선택): 첨부 저장 폴더 ID. 비워두면 시트가 있는 폴더에 `요청 첨부` 폴더를 자동으로 만듦
   - `ROUTINE_FIRE_URL`, `ROUTINE_TOKEN`: claude.ai 루틴 화면에서 "후쿠오카 요청 처리" 루틴에 API 트리거를 추가하면 나오는 URL과 토큰
   - `ROUTINE_HEADERS` (선택): 루틴 화면 예시 요청에 `anthropic-beta` 같은 헤더가 있으면 JSON으로. 예) `{"anthropic-beta":"...","anthropic-version":"2023-06-01"}`
4. 편집기에서 `testFire` 함수를 한 번 실행해 권한 승인 (시트·드라이브·외부 요청 권한을 모두 허용) (로그에 200이 나오면 루틴 연결 성공)
5. **배포 → 새 배포 → 유형: 웹 앱**, 실행 계정: 나, 액세스 권한: **모든 사용자** → 배포
6. 나온 웹 앱 URL을 `index.html`의 `APPS_SCRIPT_URL`에 넣기
