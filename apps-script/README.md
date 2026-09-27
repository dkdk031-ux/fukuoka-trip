# 로그인 · 데이터 서버 (Apps Script)

화면은 GitHub Pages 앱(https://dkdk031-ux.github.io/fukuoka-trip/)이 그리고,
이 스크립트는 **구글 로그인 확인**과 **시트 데이터 전달**, **Claude 요청 접수**만 합니다.
☆후쿠오카 폴더(또는 시트)를 공유받은 계정만 데이터를 받을 수 있어요.

## 1. OAuth 클라이언트 ID 만들기 (처음 한 번)
1. https://console.cloud.google.com/ → 위쪽 프로젝트 선택 → **새 프로젝트** (이름: fukuoka-trip)
2. **API 및 서비스 → OAuth 동의 화면**: 외부(External) → 앱 이름·지원 이메일 입력 → 저장 → **앱 게시(프로덕션)**
3. **API 및 서비스 → 사용자 인증 정보 → 사용자 인증 정보 만들기 → OAuth 클라이언트 ID**
   - 유형: **웹 애플리케이션**
   - 승인된 JavaScript 원본: `https://dkdk031-ux.github.io`
4. 만들어진 **클라이언트 ID**(`....apps.googleusercontent.com`)를 복사

## 2. Apps Script
1. 시트 → 확장 프로그램 → Apps Script → `Code.gs`를 이 폴더의 `Code.gs`로 교체 (raw 주소에서 전체 복사)
   `index` HTML 파일은 더 이상 필요 없어요(지워도 됨).
2. (클라이언트 ID는 Code.gs의 `CLIENT_ID`에 들어 있음. 바꿀 때만 스크립트 속성 `GOOGLE_CLIENT_ID` 사용)
3. 편집기에서 `setupCheck` 실행 → 권한 허용 → 로그에 허용 계정 목록이 나오면 OK
4. **배포 → 배포 관리 → 편집(연필)** → 버전: **새 버전**, 실행: **나**, 액세스: **모든 사용자** → 배포 (주소는 그대로)

## 가족 초대
구글 드라이브 **☆후쿠오카 폴더 → 공유**에 이메일 추가(뷰어 이상). 추가하면 바로 로그인 가능(1분 안), 빼면 10분 안에 차단돼요.
로그인은 30일 동안 유지돼요.

## Claude 루틴 연결 (선택)
스크립트 속성 `ROUTINE_FIRE_URL`, `ROUTINE_TOKEN` (필요하면 `ROUTINE_HEADERS`)
