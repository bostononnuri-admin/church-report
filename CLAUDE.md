# 보스턴 온누리교회 예배 출석 보고 시스템 (church-report)

교역자들이 매주 예배 출석 인원을 제출하고, 관리자가 확인·수정하며, 운영위원회 인원 보고서와 OMA 월간보고서(xlsx)를 생성하는 시스템. 교회 전체가 실제로 쓰고 있는 서비스다. UI·문서·대화는 모두 한국어.
사용자는 이 시스템의 관리자이자 개발자이며 IT 전공자가 아니다. 기술 용어는 쉬운 말로 풀어 설명한다.

## 파일 구조
- `index.html` — GitHub Pages 프론트엔드 (단일 파일, 약 2000줄). 저장소 루트에 있어야 함.
- `logo.jpg` — 파비콘 / 아이폰 홈화면 아이콘 (루트).
- `backend/` — Google Apps Script 백엔드 소스. clasp으로 Apps Script 편집기와 동기화된다 (코드 파일은 편집기의 이름 그대로, 보통 `Code.js`; `appsscript.json`은 설정 파일). 배포는 `./deploy-backend.sh` (아래 배포 절차). **온라인 편집기에서 직접 고치지 않는다** — 다음 `clasp push`가 덮어쓴다.
- `docs/project_knowledge.md` — 아키텍처·예배 구분 규칙·보안 메모·날짜별 변경이력. 자동으로 읽히지 않으므로 **작업 전 관련 섹션을 직접 읽고, 작업 후 변경이력을 추가**한다.
- `docs/보스턴온누리교회_디자인가이드.html` — 색·타이포 규칙 (navy `#1c3254` / gold `#b8892e` / ivory `#f0ede5`, 시스템 폰트 스택).
- `docs/사용자가이드.html` — 교역자용 사용 안내. 화면·예배 이름이 바뀌면 같이 갱신.
- `CLAUDE.local.md` — 비밀번호 등 비밀 값 (git 제외). 비밀 값이 필요하면 여기를 본다.

## 설정값 (비밀 아님)
- Apps Script 웹앱 URL: `https://script.google.com/macros/s/AKfycbzztaNejz8nkgug16NWI3lZtBlMSSTUHpTh0j4odURkmlWrqa67t0s8mvbaa70fGFS6_Q/exec`
- Google Sheet ID: `1VNkF5t-MJWc5abCvFXdA-JlT0YEf-Y00cN1kPkF3lLI` (시트명 `출석보고`, CSV 공개 읽기 가능 — 아래 검증 방법)
- 운영위원회 보고서 폴더: `1rsZdo4qlV3BPSoZ_YFIOMArEx7fwUbuX` / 헌금내역 폴더: `1eNZOXg6B99xUa-NWDQ_eK6dFlLyvebKa`
- OMA 템플릿: `1_lrGmsT2pbjMFAzwESfHD1pzSKYNkmJI` / OMA 저장 폴더: `1vnJDELG4Zwh-4thJ4VBp9ZeEpjVSK1WK`
- GitHub: `bostononnuri-admin/church-report` (main, Public) → https://bostononnuri-admin.github.io/church-report/
- 관리자 비밀번호·수정모드 비밀번호: `CLAUDE.local.md` 참조 (백엔드는 Script Properties `ADMIN_PW`에서 읽음)

## 절대 규칙
1. **배포 전 사용자 승인.** 코드를 고친 뒤 무엇이 어떻게 바뀌는지 먼저 설명하고, 사용자가 확인한 뒤에만 `git push` 한다. push = 즉시 실서비스 반영.
2. **접속 링크 불변.** Apps Script "새 배포"로 URL을 바꾸지 않는다. 항상 기존 배포를 새 버전으로 갱신(배포 관리 → 편집 → 새 버전).
3. **배포 순서: Apps Script 먼저 → index.html push.** 운영위 보고서는 `SERVICE_ORDER`에 있는 이름만 표에 그리므로, 프론트가 먼저 나가면 새 이름 제출이 옛 백엔드 보고서에서 누락된다.
4. **시트 과거 데이터는 마이그레이션하지 않는다.** 예배 개명·신설·폐지는 코드의 별칭(`SVC_ALIAS`)과 운영 기간(`SVC_PERIOD`)으로 처리한다.
5. **비밀번호·비밀 값은 git에 올리지 않는다.** `CLAUDE.local.md`에만 둔다.
6. **비판적 분석 먼저, 실행은 승인 후.** 수정 요청을 받으면 실현 가능성·부작용·놓치기 쉬운 지점을 먼저 설명하고 계획을 보여준 뒤 진행한다.
7. 큰 파일은 전체 재작성 대신 해당 부분만 정확히 수정한다. 수정 후 줄 수 비교·문법 검사로 확인한다.
8. 문서보다 실제 파일 내용을 믿는다. 변경이력이 배포 코드와 어긋난 적이 있다.

## 날짜 처리 (버그의 단골 원인 — 반드시 준수)
- `new Date("YYYY-MM-DD")` 금지. UTC로 해석되어 보스턴에서 하루 밀린다. 반드시 `parseDateStr()` / `parseLocalDate()` 사용: `new Date(y, m-1, d)`.
- `toISOString()` 금지. 출력은 `fmtKey()`처럼 수동 포맷: `y + "-" + String(m).padStart(2,"0") + "-" + String(d).padStart(2,"0")`.
- 보스턴 오늘 날짜: `new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date())`.
- 주차 계산: 첫 번째 일요일 + 6일 = 1주차 마지막 날(그 이전 날짜도 1주차). 이후 일~토 단위로 2주, 3주….

## 코딩 규칙
- `index.html`: async 함수 호출은 스크립트 맨 끝에서만 (모든 함수 정의가 끝난 뒤).
- innerHTML에 사용자 입력(서명)이나 시트에서 읽어온 문자열을 넣을 땐 반드시 `escHtml()`.
- onclick 속성에 넣는 JSON은 `encodeURIComponent(JSON.stringify(...)).replace(/'/g, "%27")`.
- 프론트와 백엔드에 **같은 값이 두 벌** 있는 상수가 있다. 한쪽만 고치면 집계가 틀어진다:
  - 예배명 별칭 `SVC_ALIAS` (index.html ↔ gs)
  - 예배 운영 기간 `SVC_PERIOD` (index.html ↔ gs)
  - 인원 필드 분류 `SERVICE_2/3/4` (index.html, `SVC2/3/4`는 이를 참조) ↔ `SVC2/SVC3` (gs `handleReport`)
  - 예배 표시 순서 `SERVICES_ALL` (index.html) ↔ `SERVICE_ORDER` (gs `handleReport`)
  - OMA 카테고리 `CAT_ADULT/CAT_DAEC/CAT_NG` (gs `handleMonthlyReport` 한 곳)
- 예배 항목을 추가·개명·폐지할 때의 7단계 체크리스트는 `docs/project_knowledge.md`의 "예배 구분" 섹션에 있다. 반드시 그 순서대로 전부 확인한다.
- UI: 비밀번호 모달은 `center-modal`(정중앙, 취소/확인), 수정·삭제·덮어쓰기 모달은 하단 슬라이드업 시트. 관리자 모드 진입 시 `pubCalView` 숨김, 로그아웃 시 복원. 보고서 섹션(`.rpt-box`, `.mr-box`)은 수정모드에서만 표시.

## 검증 방법 (배포 전에 반드시)
- 문법 검사: `node --check backend/*.js` (`.gs` 확장자면 `/tmp/check.js`로 복사해서 검사)
  프론트는 `<script>` 블록을 추출해서: `awk '/^<script>$/{f=1;next}/^<\/script>$/{f=0}f' index.html > /tmp/inline.js && node --check /tmp/inline.js`
- 실데이터 모의 집계: 시트는 공개 읽기 가능 —
  `curl -sL "https://docs.google.com/spreadsheets/d/1VNkF5t-MJWc5abCvFXdA-JlT0YEf-Y00cN1kPkF3lLI/gviz/tq?tqx=out:csv&sheet=%EC%B6%9C%EC%84%9D%EB%B3%B4%EA%B3%A0" -o /tmp/sheet.csv`
  백엔드 상단의 함수들(`canonSvc`, `svcActiveIn`, `fmtKey` 등)을 Node에서 그대로 불러 집계·달력 로직을 재현하고, 결과 표를 사용자에게 보여준다. 집계 로직을 건드렸을 때는 필수.
- 배포본 확인: `curl -s https://bostononnuri-admin.github.io/church-report/index.html | diff - index.html` (파일 끝 줄바꿈 차이만 나오면 정상).

## 배포 절차
**프론트 (`index.html`, `docs/`)**: 사용자 승인 → `git add` → `git commit -m "..."` → `git push` → 1~2분 뒤 GitHub Pages 반영. 캐시 때문에 안 보이면 시크릿 창으로 확인.
**백엔드 (`backend/`)**: 사용자 승인 후 `./deploy-backend.sh "변경 설명"` 실행 (= `clasp push` + 기존 배포 ID로 새 버전 갱신, URL 유지). `clasp create-deployment`/`clasp deploy`를 **배포 ID 없이 직접 치지 않는다** — 새 URL이 생겨 교회 전체 서비스가 끊긴다. 배포 ID: `AKfycbzztaNejz8nkgug16NWI3lZtBlMSSTUHpTh0j4odURkmlWrqa67t0s8mvbaa70fGFS6_Q`. 배포 후 `curl -sL "<Apps Script URL>?action=ping"`의 `version`으로 갱신 여부를 확인한다 — 백엔드 코드를 바꿀 때마다 그 version 문자열도 한 단계 올린다(v5 → v6 …).
둘 다 바뀌면 **백엔드 먼저**.

## 작업 완료 시 반드시
1. 바뀐 파일·바뀐 내용·검증 결과를 요약해서 사용자에게 보여주고 승인을 기다린다.
2. `docs/project_knowledge.md` 변경이력에 날짜·배경·수정 내용·검증 결과·미적용 사항을 추가하고, 예배 구분·설정값·인원 필드 표도 현행에 맞게 갱신한다.
3. 백엔드가 바뀌었으면 ping version 문자열을 올리고, 승인 후 `./deploy-backend.sh`로 배포한 뒤 ping으로 확인한다.
4. 예배 이름·화면이 바뀌었으면 `docs/사용자가이드.html`도 갱신한다.

## 주요 기능 (상세는 docs/project_knowledge.md)
제출 폼(일반 사용자) / 제출 내역 달력(공개, 읽기 전용) / 관리자 모드(🔐 FAB, 세션 토큰 1시간, 수정·삭제) / 수정모드(비밀 버튼 800ms 내 3번 클릭, 보고서 섹션 노출) / 운영위원회 인원 보고서(xlsx, 기간 지정) / OMA 월간보고서(xlsx, 단일 월, 수정모드에서만)

예배 13종 (2026-11-01 개편): 주일 1부 예배, 주일 2부 예배, 주일 3부 EM예배, 예꿈 영아부, 예꿈 유치부, 꿈땅, PW 중등부, PW 고등부, 이음, 위윈, 새벽예배, 수요예배, 금요여성예배. 레거시: 위윈EM (~2026-05-31, 과거 기록용).
