# 보스턴 온누리교회 예배 출석 보고 시스템 — 프로젝트 지식 문서

## 핵심 설정값

| 항목 | 값 |
|------|-----|
| Apps Script URL | `https://script.google.com/macros/s/AKfycbzztaNejz8nkgug16NWI3lZtBlMSSTUHpTh0j4odURkmlWrqa67t0s8mvbaa70fGFS6_Q/exec` |
| Google Sheet ID | `1VNkF5t-MJWc5abCvFXdA-JlT0YEf-Y00cN1kPkF3lLI` |
| 관리자 비밀번호 | 문서에 기록하지 않음 — Claude Code 환경에서는 `CLAUDE.local.md`(git 제외), 백엔드는 Script Properties `ADMIN_PW` |
| 운영위원회 보고서 폴더 | `1rsZdo4qlV3BPSoZ_YFIOMArEx7fwUbuX` |
| 헌금내역 폴더 | `1eNZOXg6B99xUa-NWDQ_eK6dFlLyvebKa` |
| OMA 템플릿 ID | `1_lrGmsT2pbjMFAzwESfHD1pzSKYNkmJI` |
| OMA 저장 폴더 | `1vnJDELG4Zwh-4thJ4VBp9ZeEpjVSK1WK` |
| GitHub | `bostononnuri-admin/church-report` (main 브랜치) |
| 배포 URL | `https://bostononnuri-admin.github.io/church-report/` |

---

## 작업 파일

| 파일 | 역할 |
|------|------|
| `index.html` | GitHub Pages 프론트엔드 (단일 파일, 약 1924줄) |
| `apps_script_new.gs` | Google Apps Script 백엔드 |
| `logo.jpg` | 파비콘 / 홈화면 아이콘 (GitHub 루트에 위치) |
| `project_knowledge.md` | 프로젝트 전체 맥락 문서 |

---

## 시스템 아키텍처

- `index.html` → GitHub Pages로 호스팅 (정적 HTML 단일 파일)
- `apps_script_new.gs` → Google Apps Script Web App 백엔드
- Google Sheets → 데이터베이스 (시트명: `출석보고`, `수정이력`)
- Google Drive → 보고서 파일 저장

---

## 코드 수정 원칙

- 파일이 크므로 전체 출력 대신 **`str_replace`로 해당 부분만** 정확히 수정
- 중간 확인 시 `view_range` 또는 bash `sed` 사용
- 수정 후 반드시 전체 파일을 `/mnt/user-data/outputs/`에 저장하여 다운로드 제공

---

## 핵심 기술 원칙

### 날짜 파싱 (절대 준수)
```javascript
// ❌ 절대 금지 — UTC 파싱으로 보스턴에서 하루 밀림
new Date("YYYY-MM-DD")

// ✅ 반드시 사용
function parseDateStr(str) {
  const p = str.split('-');
  return new Date(parseInt(p[0]), parseInt(p[1]) - 1, parseInt(p[2]));
}

// ✅ 보스턴 현재 날짜
new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date())

// ✅ 날짜 출력 (toISOString() 금지, 수동 포맷)
y + "-" + String(m).padStart(2,"0") + "-" + String(d).padStart(2,"0")
```

### 초기화 순서
- async 함수 호출은 스크립트 맨 끝에서만 (모든 함수 정의 완료 후)

---

## 주요 기능

1. **예배 출석 제출 폼** (일반 사용자)
2. **제출 내역 확인 달력** (공개, 읽기 전용) — 제출하기 버튼 아래, 관리자 모드 시 숨김
3. **관리자 모드** (🔐 FAB 버튼) — 전체 달력 + 수정/삭제
4. **수정 모드** — 비밀 버튼 800ms 이내 3번 클릭으로 진입
5. **운영위원회 인원 보고서 생성** (xlsx)
6. **OMA 월간보고서 생성** (xlsx) — 수정모드에서만 표시

---

## 예배 구분 (현행 13종 + 레거시 1종) — 2026-11-01 개편 기준

**현행 (입력 가능, 드롭다운·달력·보고서 표시 순서)**
주일 1부 예배 / 주일 2부 예배 / 주일 3부 EM예배 / **예꿈 영아부** / **예꿈 유치부** / 꿈땅 / **PW 중등부** / **PW 고등부** / 이음 / 위윈 / 새벽예배 / 수요예배 / 금요여성예배

**레거시 (폐지, 입력 불가 — 과거 기록 표시·합산용으로만 코드에 잔존)**
~~위윈EM~~ (2026-05-31까지)

### 핵심 원리: "예배명 글자"가 곧 키
시트 D열에는 예배명이 글자 그대로 저장되고(코드값 없음), 달력 매칭·중복 판정·운영위 평균·OMA 합산이 전부 **문자열 완전 일치**로 동작한다. 따라서 이름이 바뀌면 과거 기록과 연결하는 장치(별칭)가 반드시 필요하고, 순서는 표시 전용이라 데이터에 영향이 없다.

### 세 가지 이력 관리 장치 (프론트·백엔드에 각각 동일 정의 — 둘을 반드시 같이 수정)

**① 별칭 사전 `SVC_ALIAS` + `canonSvc()` — 개명 연결**
```
"예꿈" → "예꿈 유치부",  "중등부" → "PW 중등부",  "고등부" → "PW 고등부"
```
- 시트 과거 데이터는 **마이그레이션하지 않음**. 대신 시트에서 예배명을 **읽는 모든 지점**에서 `canonSvc()`로 현행 이름으로 통일한 뒤 계산.
- 적용 지점(빠뜨리면 그 기능에서만 구 이름이 별개 항목으로 갈라짐):
  - 백엔드: `handleSubmit` 중복 판정(양쪽 변환) / `handleSubmit` 저장 시 예배명 / `handleReport` 집계 키 / `handleMonthlyReport` `attByWeek` 키 / 검증시트 `rsvc`
  - 프론트: 제출 전 중복 확인 / `renderPubDateSummary` map 키 / `renderDateSummary` map 키
- 효과: 과거 "예꿈" 행이 달력·보고서에서 "예꿈 유치부" 줄에 합쳐짐. 관리자가 과거 "예꿈" 행을 수정하면 백엔드가 별칭으로 같은 행을 찾아 덮어쓰며, 그 행은 새 이름으로 바뀜(점진적 정리). 과거 기간 보고서를 재생성하면 새 이름으로 표시됨(의도).
- 검증시트(예배인원 확인 탭)는 시트 원문이 구 이름이면 `예꿈 유치부 (구 예꿈)`처럼 병기.
- 별칭표의 구 이름은 시트 원문과 글자 단위로 일치해야 함(2026-10-31 시트 점검: 13종, 공백·오타 변형 없음 확인).

**② 운영 기간표 `SVC_PERIOD` — 신설·폐지 예배의 날짜별 노출 제어**
```
"위윈EM":          { end:   "2026-05-31" }   // 폐지(대청)
"주일 3부 EM예배": { start: "2026-06-01" }   // 신설(성인)
"예꿈 영아부":     { start: "2026-11-01" }   // 신설(차세대)
```
- 프론트 `servicesForDate(dk)`: `SERVICES_ALL`(전체 14종, 표시 순서)에서 그 날짜에 운영 중인 예배만 필터. 기존 `SVC_CUTOFF`/`SERVICES_LEGACY`/`SERVICES_CURRENT`는 이 구조로 **대체됨**.
- 백엔드 `svcActiveIn(svc, sKey, eKey)`: 운영위 보고서에서 보고 기간 동안 운영되지 않은 예배는 데이터가 없으면 줄 생략, 운영 중인데 없으면 "미제출". 기존 `TRANSITIONAL` 목록은 **삭제됨** → 6월 당시 트레이드오프(3부 EM 누락 시 경고 안 뜸)가 해소되어 이제 정상적으로 "미제출" 경고가 뜸.
- 백엔드 OMA는 날짜 분기 불필요(이름이 시대를 가름). 차세대 합산 목록에 "예꿈 영아부"가 들어 있어도 데이터 없는 달엔 자연히 0.

**③ "목록 외" 안전장치**
- 달력 상세 2곳: 그 날짜 목록에 없는 예배명인데 데이터가 있으면(기준일 이전 제출, 구버전 앱 제출, 오타 등) 끝에 `목록 외` 뱃지로 표시(관리자는 수정·삭제 가능). 이름은 시트 유래이므로 `escHtml` 적용.
- 운영위 보고서: `SERVICE_ORDER`에 없는 예배명에 데이터가 있으면 표 끝에 `(목록 외)`로 추가. 이전엔 조용히 누락됐음.

### 카테고리 (OMA 월간보고서 — 백엔드 `CAT_ADULT`/`CAT_DAEC`/`CAT_NG` 한 곳에 정의, 본문·검증시트 공통 사용)
| 카테고리 | 구성 |
|---|---|
| 성인 | 주일 1부 + 주일 2부 + 주일 3부 EM예배 |
| 대청 | 위윈 + 위윈EM(폐지, 과거 합산용) + 이음 |
| 차세대 | 예꿈 영아부 + 예꿈 유치부 + 꿈땅 + PW 중등부 + PW 고등부 |
- 위윈EM(대청) → 주일 3부 EM예배(성인)는 단순 개명이 아닌 **그룹 이동**이라 별칭이 아닌 별개 예배로 유지.

### 새 예배를 추가/개명/폐지할 때 체크리스트
1. 드롭다운 `<option>` (index.html)
2. `SERVICES_ALL` 순서 (index.html) / `SERVICE_ORDER` 순서 (gs `handleReport`)
3. 인원 필드 유형: `SERVICE_2/3/4` (index.html, `SVC2/3/4`는 이를 참조) / `SVC2`·`SVC3` (gs `handleReport`)
4. 카테고리: `CAT_ADULT/DAEC/NG` (gs `handleMonthlyReport` — 검증시트 색·라벨 자동 생성)
5. 개명이면 `SVC_ALIAS` 양쪽 / 신설·폐지면 `SVC_PERIOD` 양쪽
6. 배포는 **Apps Script 먼저** → GitHub Pages. (운영위 보고서는 `SERVICE_ORDER`에 있는 이름만 그리므로, 프론트가 먼저 나가면 새 이름 제출이 옛 백엔드 보고서에서 "(목록 외)"로만 보임)
7. 프로젝트 커스텀 인스트럭션의 "예배 구분" 줄과 사용자 가이드 HTML도 갱신

---

## 인원수 필드 구성

| 예배 종류 | 필드 구성 |
|----------|----------|
| 새벽예배, 금요여성예배 | 현장 + 온라인 → 합계 자동계산 |
| 예꿈 영아부, 예꿈 유치부, 꿈땅, PW 중등부, PW 고등부 | 학생 + 교역자+교사 + 그외 → 합계 자동계산 |
| 나머지 (주일 1·2·3부, 이음, 위윈, 수요예배) | 총 인원 (단일 필드) |

※ 구 이름(예꿈/중등부/고등부) 행도 `canonSvc()`를 거쳐 새 이름으로 분류되므로 달력·수정 모달에서 3칸 구성이 그대로 유지됨.

---

## 주차 계산 기준

첫 번째 일요일 + 6일 = 1주차 마지막 날. 그 이전 날짜도 1주차 포함. 이후 일~토 단위로 2주, 3주...

---

## UI 원칙

- **비밀번호 모달** (관리자/수정모드): `center-modal` 클래스 → 화면 정중앙, 취소/확인 버튼
- **수정/삭제/덮어쓰기 모달**: 하단 슬라이드업 시트 스타일
- **관리자 모드 진입 시**: `pubCalView` 숨김, 로그아웃 시 복원
- **보고서 섹션** (`.rpt-box`, `.mr-box`): 수정모드에서만 표시

---

## 디자인 시스템 (보스턴 온누리교회 통합 가이드 준수)

### 색상 팔레트 (`:root` 변수)

| 변수 | 값 | 용도 |
|------|----|------|
| `--navy` | `#1c3254` | 헤더 배경, 주요 버튼, 기본 텍스트 |
| `--navy-mid` | `#3b5a8c` | 포커스 테두리, 호버 |
| `--gold` | `#b8892e` | 헤더 하단 바, 제출/확인 버튼 왼쪽 포인트 |
| `--pale` | `#f0ede5` | (내부 참조용, 실제 bg는 --bg 사용) |
| `--border` | `#d6d1c3` | 카드·입력창 테두리 (따뜻한 베이지) |
| `--ink` | `#1c3254` | 기본 텍스트 |
| `--ink-s` | `#6e6a61` | 보조 텍스트, 레이블 |
| `--bg` | `#f8f7f4` | 전체 페이지 배경 (밝은 아이보리) |
| `--white` | `#ffffff` | 카드 배경 |
| `--red` | `#A32D2D` | 삭제·경고 버튼 |

### 폰트
```css
font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans KR', sans-serif;
```
- Pretendard CDN 제거됨 — 시스템 폰트 사용
- `color-scheme: light` 전역 적용 (다크모드 방지)

### 헤더 구조
```html
<div class="hdr">
  <div class="hdr-bar"></div>   <!-- 골드 세로 포인트 바 -->
  <div class="hdr-t">
    <h1>예배 출석 보고</h1>
    <p>BOSTON ONNURI CHURCH</p>
  </div>
</div>
```
- 로고 이미지(`<img>`) 제거됨 (2026-04-21) — 텍스트만 유지
- `.hdr::after` → 하단 골드 3px 바 (`#b8892e`)
- `.hdr-bar` → 좌측 골드 세로 4px 바

### 버튼 스타일
| 버튼 | 스타일 |
|------|--------|
| `.btn-sub` (제출) | 네이비 배경 + `border-left: 5px solid #b8892e` (골드) |
| `.btn-conf` (확인) | 네이비 배경 + `border-left: 5px solid #b8892e` (골드) |
| 취소 버튼 (인라인) | 아이보리 배경 + 베이지 테두리 (골드 없음) |
| `.btn-del` | `#A32D2D` 빨간 배경 |
| `.btn-out` (로그아웃) | 흰색 텍스트 + `rgba(255,255,255,.5)` 테두리 |

### 카드 컴포넌트
```css
.step, .adm-card, .sum-card 등 {
  background: white;
  border-radius: 14px;
  border: 1px solid #d6d1c3;
  box-shadow: 0 1px 4px rgba(28,50,84,.08);
}
```

### 요약 카드 헤더
```css
.sum-card-hdr {
  background: #d4dff0;   /* 연한 네이비 */
  color: #1c3254;
}
```

### 달력 제출 태그
```css
.cal-cnt-tag {
  background: #1c3254;   /* 네이비 */
  color: #FAEEDA;        /* 크림 */
}
```

### OMA 박스 색상
```css
.mr-box  { border-color: #B2DFDB; }  /* 청록 테두리 */
.mr-title { color: #0d9488; }         /* 청록 텍스트 */
.mr-btn  { background: #0d9488; }    /* 청록 버튼 */
```

### 입력 필드 포커스
```css
border-color: #3b5a8c;
box-shadow: 0 0 0 3px #e7ebf2;
```

### 헤더 골드 바 동작 규칙
- **일반 모드**: 메인 헤더(`.hdr::after`) 골드 바 표시
- **관리자/수정 모드** (`body.admin-mode`, `body.edit-mode`): 메인 헤더 골드 바 숨김 + 관리자 뷰 헤더(`.adm-hdr::after`) 골드 바 표시
- 두 헤더가 겹쳐 골드 바가 이중으로 보이는 것을 방지

```css
/* 관리자/수정 모드에서 메인 헤더 골드 바 숨김 */
body.admin-mode .hdr::after,
body.edit-mode .hdr::after { display: none; }

/* 관리자 뷰 헤더 골드 바 */
.adm-hdr { position: relative; }
.adm-hdr::after {
  content: ''; position: absolute;
  bottom: 0; left: 0; right: 0;
  height: 3px; background: var(--gold);
}
```

### 로그아웃 버튼 (`.btn-out`)
```css
/* 이전 스타일 유지 — 테두리 없음, 반투명 배경 */
color: rgba(255,255,255,.8);
background: rgba(255,255,255,.12);
border: none;
```

---

## Google Sheets 컬럼 구조

| 컬럼 | 내용 |
|------|------|
| A | 제출시간 |
| B | 보고날짜 |
| C | 예배날짜 |
| D | 예배명 |
| E | 총인원 |
| F | 현장 |
| G | 온라인 |
| H | 학생 |
| I | 교역자+교사 |
| J | 그외 |
| K | 서명 |

---

## 배포 방법

(2026-10-31부터 로컬 저장소 `/Users/bostononnuri/Claude Code/예배 출석 보고 시스템`에서 Claude Code로 작업. 상세 절차는 `CLAUDE.md` "배포 절차".)

### GitHub Pages (index.html, docs/)
1. 사용자 승인 → `git add` → `git commit` → `git push` (main 브랜치 루트의 `index.html`·`logo.jpg`가 서빙됨)
2. 1~2분 후 자동 반영. 확인: `curl -s https://bostononnuri-admin.github.io/church-report/index.html | diff - index.html`
3. 저장소는 **Public** 이어야 GitHub Pages 무료 사용 가능 → 비밀 값은 `CLAUDE.local.md`(gitignore)에만 둔다

### Apps Script (backend/Code.js, clasp)
1. `backend/Code.js`를 로컬에서 수정 → `node --check backend/Code.js` → ping `version` 문자열 한 단계 올림
2. 사용자 승인 → `./deploy-backend.sh "설명"` (= `clasp push` + `clasp create-deployment --deploymentId <운영 배포 ID>` → 기존 배포를 새 버전으로 갱신, URL 유지)
3. `curl -sL "<Apps Script URL>?action=ping"`의 `version`으로 반영 확인
4. 온라인 편집기에서 직접 고치지 않는다(다음 push가 덮어씀). `clasp create-deployment`를 배포 ID 없이 치면 새 URL이 생긴다.
5. 관리자 비밀번호는 Script Properties `ADMIN_PW`에서 읽는다(코드에 평문 없음). 스크립트 ID는 `.clasp.json`.

---

## 코드 리뷰 이력 (누적)

### 2026-04 초 — 전체 코드 검토
- **수정**: `doDeleteRow()`의 stray `l;` 토큰 제거 (ReferenceError 수정)
- **수정**: `initPubCalendar` IIFE 내 `new Date("YYYY-MM-DD")` 패턴 → `parseDateStr()` 적용
- **확인**: `loadAdminData()` — 미호출 데드코드, 런타임 영향 없음 (유지)
- **확인**: `apps_script_new.gs` — 오류 없음

### 2026-04-14 — 파비콘 추가
- `index.html` `<head>`에 파비콘 링크 2줄 추가
- `logo.jpg` 파일을 GitHub 저장소 루트에 업로드

### 2026-04-14 — GitHub Pages 복구
- 저장소를 Private으로 변경하면서 GitHub Pages가 자동 비활성화됨
- Public으로 재변경 + Settings → Pages → Branch: main / (root) 로 재설정하여 복구

### 2026-04-20 — 디자인 전면 개편 (보스턴 온누리교회 통합 디자인 가이드 적용)
**변경 범위**: `index.html` CSS 전체 + 헤더 HTML 구조 1개 태그 추가. 기능 변경 없음.

| 항목 | 변경 전 | 변경 후 |
|------|---------|---------|
| 배경색 | `#F4F7FC` (차가운 회청) | `#f8f7f4` (밝은 아이보리) |
| 네이비 | `#1A3070` | `#1c3254` |
| 테두리 | `#C2CFE8` (파란) | `#d6d1c3` (따뜻한 베이지) |
| 폰트 | Pretendard (CDN) | 시스템 폰트 |
| 다크모드 방지 | 없음 | `color-scheme: light` 전체 적용 |
| 헤더 | 단순 네이비 | 골드 하단 3px 바 + 골드 좌측 세로 바 |
| 제출/확인 버튼 | 네이비 단색 | 네이비 + 왼쪽 골드 5px 포인트 |
| 로그아웃 버튼 | 불투명 (잘 안 보임) | 흰색 텍스트 + 반투명 흰색 테두리 |
| 달력 태그 | 파란 배경 | 네이비 배경 + 크림(`#FAEEDA`) 텍스트 |
| 요약 카드 헤더 | 진한 네이비 배경 | 연한 네이비(`#d4dff0`) 배경 |
| 뱃지 | 연한 파란 배경 | 연한 네이비 배경 + 테두리 |
| 카드 radius | 16px (혼재) | 14px 통일 |
| OMA 박스 색상 | `#2E7D32` (초록) | `#0d9488` (청록) |
| 삭제 버튼 색 | `#C0392B` / `#FEF2F2` | `#A32D2D` / `#FAEDEC` |

### 2026-04-21 — 메인 헤더 로고 이미지 제거
- `index.html` 헤더(`<div class="hdr">`)에서 base64 로고 `<img>` 태그 제거
- 관련 CSS `.hdr img { ... }` 규칙 삭제
- 헤더에는 텍스트("예배 출석 보고 / BOSTON ONNURI CHURCH")만 유지
- **로그아웃 버튼**: 새 디자인(흰 테두리) → 이전 디자인으로 복원 (`border: none`, `rgba(255,255,255,.12)` 배경)
- **골드 바 이중 노출 수정**: 관리자/수정 모드일 때 메인 헤더 골드 바 숨김 (`body.admin-mode .hdr::after { display: none }`)
- **관리자 뷰 헤더**: 골드 하단 바 추가 (`.adm-hdr::after`) — 관리자 모드에서 골드 바가 관리자 헤더에만 표시됨

### 2026-06-02 — 위윈EM 폐지 → 주일 3부 EM예배 신설 (성인 그룹, 6/1 기준 날짜 분기)
**배경:** 위윈EM 예배 폐지, "주일 3부 EM예배" 신설. 카테고리가 대청→성인으로 이동(단순 개명 아님). 과거 위윈EM 데이터는 시트에 그대로 보존(마이그레이션 안 함).

**index.html**
- 입력 드롭다운: 위윈EM 제거, 주일 3부 EM예배 추가(주일 2부 다음 3번째)
- `ALL_SERVICES` 상수 → 날짜 분기 구조로 교체: `SVC_CUTOFF="2026-06-01"`, `SERVICES_LEGACY`(위윈EM 포함), `SERVICES_CURRENT`(주일 3부 EM예배 포함), `servicesForDate(dk)` 함수 신설
- 달력 상세 렌더링 2곳(`renderPubDateSummary`, `renderDateSummary`)에서 `ALL_SERVICES.forEach` → `servicesForDate(dk).forEach`로 변경
  - dk는 `"YYYY-MM-DD"` 0패딩 문자열 → `dk >= SVC_CUTOFF` 사전식 비교 안전
  - 효과: 6/1 이전 날짜 클릭 시 위윈EM 표시(원래대로), 6/1 이후 클릭 시 주일 3부 EM예배 표시

**apps_script_new.gs**
- `handleReport`(운영위 Doc): `SERVICE_ORDER`에 주일 3부 EM예배 3번째 추가(위윈EM 유지), `TRANSITIONAL=["위윈EM","주일 3부 EM예배"]` 신설 — 이 두 항목은 데이터 없으면 줄 생략(미제출 미표시)
- `handleMonthlyReport`(OMA): 성인 합산에 주일 3부 EM예배 추가 — 본문(adult)·검증시트(sAdult) 2곳. 대청(위윈EM 포함)은 그대로 유지
- `CAT_COLOR`/`CAT_LABEL`: 주일 3부 EM예배 추가(색 `#DDEEFF`, 라벨 "성인"). 위윈EM(대청/녹색) 유지
- **핵심:** 백엔드는 날짜 분기 없음 — 예배명이 과거/미래를 자동 분리하므로 합산 배열만 조정하면 모든 시기 정확

**검증:** 두 파일 `node --check` 문법 통과. gs 867→873줄(+6, 의도된 증가).
**미적용(의도):** 시트 데이터 마이그레이션 없음(과거 위윈EM 보존). 수정이력 시트도 그대로.

### 2026-06-03 — 보안: 서명 필드 저장형 XSS 차단 (escHtml 실제 구현)
**문제:** 관리자 달력(`renderDateSummary`)에서 서명값(`row[10]`)을 escape 없이 innerHTML로 출력(`✍️ ${sig}`). 제출(submit)이 무인증 공개라 누구나 서명란에 스크립트를 심을 수 있고, 관리자가 해당 날짜를 열면 관리자 컨텍스트(_adminToken 보유)에서 실행 → 토큰 탈취·무단 삭제 위험.
- **주의:** `escHtml()`은 문서상 "필수 컨벤션"으로 적혀 있었으나 **실제 코드엔 정의조차 없었음** (문서·실제 불일치 사례 재발).

**수정 (index.html):**
- `escHtml(s)` 함수 신설 (상수 블록 직후). `& < > " '` → HTML 엔티티 치환(& 먼저). null-safe.
- 관리자 달력 서명 출력 `${sig}` → `${escHtml(sig)}`로 변경 (유일한 라이브 취약 지점).
- 정상 이름은 표시 동일, 악성 입력은 "글자"로만 표시되어 실행 안 됨.

**점검 결과 (수정 불필요로 판단):**
- 공개 달력(`renderPubDateSummary`)·달력의 `${svc}`: svc는 `servicesForDate()` 하드코딩 목록 값이라 안전. 공개 달력은 서명 미출력.
- 제출 성공 메시지(`showSuccess`)·토스트(`showToast`): `textContent` 사용 → 안전.
- `loadAdminData()`(1865행~): **호출되지 않는 죽은 코드**. 게다가 템플릿이 `\${sig}`(백슬래시 escape)라 보간조차 안 됨 → 이중 안전. 이번엔 미변경(추후 정리 대상).

**검증:** `node --check` 문법 통과. index.html 1960→1972줄(+12, escHtml 헬퍼).

### 2026-10-31 — 예배 구분 개편 (11/1 시행): 예꿈 영아부 신설, 3개 예배 개명(별칭 연결), 순서 변경
**배경:** 11/1부터 예꿈 영아부 신설, 예꿈→예꿈 유치부·중등부→PW 중등부·고등부→PW 고등부 개명, 새벽·수요예배를 목록 뒤로 이동. 개명 항목은 과거 기록과 같은 항목으로 평균·합산되어야 함. 시트 데이터 마이그레이션 없음(기존 원칙 유지). 10/31 기준 10월 데이터 입력 완료 상태에서 배포.

**사전 분석에서 확인한 사실:**
- 순서 변경은 표시 전용(드롭다운·`SERVICES_*`·`SERVICE_ORDER` 배열 순서)이라 데이터 무영향.
- 개명은 문자열 키 구조상 별칭 없이는 6곳에서 갈라짐: 운영위 보고서 두 줄 분리 / OMA 차세대 누락 / 검증시트 카테고리 "-" / **관리자 수정 시 과거 행을 못 찾아 새 행 추가(가장 위험)** / 달력 과거 날짜 "미제출" / 제출 전 중복 확인 미작동.
- 시트 CSV 직접 점검: 예배명 13종, 공백·오타 변형 0건 → 별칭표 3항목이 원문과 일치.
- `handleReport`는 `SERVICE_ORDER`에 없는 이름을 조용히 버리므로 배포 순서(백엔드 먼저)가 평소보다 중요.

**수정 (apps_script_new.gs):**
- 상단 신설: `fmtKey(d)`(YYYY-MM-DD 수동 포맷), `SVC_ALIAS`+`canonSvc()`, `SVC_PERIOD`+`svcActiveIn()`.
- `handleSubmit`: 저장 예배명 `canonSvc(data.service)`; 중복 판정 양쪽 `canonSvc` 비교 → 과거 "예꿈" 행 수정 시 같은 행 덮어쓰기.
- `handleReport`: `SERVICE_ORDER` 새 순서·새 이름(위윈EM은 위윈 뒤), `SVC3`에 영아부, 집계 키 `canonSvc`, `TRANSITIONAL` 삭제 → `svcActiveIn` 판정, `statRow()` 헬퍼 추출, 표 끝 "(목록 외)" 안전장치.
- `handleMonthlyReport`: `attByWeek` 키 `canonSvc`; `CAT_ADULT/CAT_DAEC/CAT_NG`를 한 곳에 정의하고 본문·검증시트 4곳이 참조; `CAT_COLOR/CAT_LABEL`을 목록에서 자동 생성; 검증시트 `SVC_CHILD = CAT_NG`, 원문이 구 이름이면 `(구 예꿈)` 병기(`rec.disp`).

**수정 (index.html):**
- 드롭다운 13개 항목 새 순서·새 이름.
- `SVC_ALIAS`+`canonSvc()` 신설(인원 필드 상수 직전). `SERVICE_3`에 영아부·새 이름.
- 제출 전 중복 확인: 양쪽 `canonSvc`.
- `SVC_CUTOFF`/`SERVICES_LEGACY`/`SERVICES_CURRENT` → `SERVICES_ALL`+`SVC_PERIOD`+필터형 `servicesForDate()`로 교체. 6/1 이전 날짜도 새 순서로 통일(표시 전용). `SVC2/3/4 = SERVICE_2/3/4` 참조로 중복 상수 해소.
- `renderPubDateSummary`/`renderDateSummary`: map 키 `canonSvc`; `list.concat(extra)` 순회로 "목록 외" 뱃지 표시(시트 유래 이름은 `escHtml`).
- `rowData` 인코딩에 `.replace(/'/g,"%27")` 보강 — `encodeURIComponent`가 `'`를 안 바꿔 서명에 `'`가 있으면 onclick 속성이 깨지던 잠재 버그.

**검증:** `node --check` 양쪽 통과. 실제 시트 CSV로 모의 집계 — 10월 보고서에서 "예꿈" 4건이 "예꿈 유치부" 1줄로 합산, 5~6월 기간엔 위윈EM·3부 EM 모두 표시, 11월엔 영아부 "미제출"·위윈EM 생략. 달력 10/25·5/31·11/1 상세 모의 실행 정상. gs 873→915줄, index.html 1972→2004줄.

**부수 발견:** 시트상 10/25 중등부 미제출(마지막 10/18). 10월 운영위 보고서 생성 전 확인 필요.

**기간 통합 보고서 검증 (10~11월):** 실데이터+가상 11월 데이터 모의 실행 결과, 운영위 보고서(10/01~11/30)에서 예꿈 유치부=예꿈 4건+유치부 5건, PW 중등부=중등부 3건+PW 5건, PW 고등부=고등부 4건+PW 5건으로 각 한 줄 합산·새 이름 표시 확인. OMA는 `year+month` 단일 월 구조라 통합 불가(각 달 따로, 본문엔 카테고리 합계만). **영아부는 11/1 이전에 미집계였던 신설 부서(사용자 확인)** → 10월 "예꿈"과 11월 "예꿈 유치부"는 같은 집단이므로 기간 통합 평균에 의미 왜곡 없음. 각주 불필요.

**미적용(의도):** 시트 데이터·수정이력 시트 마이그레이션 없음. 사용자 가이드 HTML·프로젝트 커스텀 인스트럭션의 예배 목록은 별도 갱신 필요.

### 2026-10-31 — Claude Code 이전 준비 (문서만 변경, 코드 무변경)
- 이 문서가 Public 저장소(`docs/`)에 들어가게 되므로 설정값 표에서 관리자 비밀번호 평문 제거. 비밀 값은 `CLAUDE.local.md`(git 제외)와 Apps Script Script Properties로 이전.
- 저장소 구조 계획: 루트 `index.html`·`logo.jpg`(Pages 배포), `backend/apps_script_new.gs`, `docs/`(이 문서·디자인가이드·사용자가이드), `CLAUDE.md`(프로젝트 규칙), `CLAUDE.local.md`(비밀, gitignore).
- 백엔드 `ADMIN_PW` 평문(gs 8행)은 저장소 업로드 전 `PropertiesService.getScriptProperties().getProperty("ADMIN_PW")`로 교체 예정 — 2026-06-03 보안 메모에서 권장했던 항목.

### 2026-10-31 — Claude Code 이전 완료: 로컬 저장소 + clasp 연결 + ADMIN_PW 스크립트 속성 이전 (백엔드 v5)
**배경:** claude.ai 프로젝트(코드 붙여넣기 방식)에서 Claude Code(로컬 폴더 + git + clasp)로 작업 환경 이전. `docs/이전계획.md` 순서대로 진행.

**환경:** Homebrew·node 26·gh 2.103·clasp 3.4.1 설치. 로컬 폴더 `/Users/bostononnuri/Claude Code/예배 출석 보고 시스템`을 GitHub `bostononnuri-admin/church-report`(main)와 연결(임시 폴더에 clone 후 `.git` 포함 이동).

**저장소 구조:** 루트 `index.html`·`logo.jpg`(Pages, 무변경) / `backend/Code.js`·`backend/appsscript.json`(clasp clone) / `docs/`(이 문서·디자인가이드·이전계획.md) / `CLAUDE.md` / `.clasp.json`(스크립트 ID) / `deploy-backend.sh` / `.gitignore`(CLAUDE.local.md, .clasprc.json 등). `CLAUDE.local.md`(비밀 값)는 git 제외 확인. 사용자가이드.html은 폴더에 없어 미포함.

**clasp 연결:** 교회 계정(boc_admin)으로 로그인. 출석 보고 스크립트는 시트에 붙은(container-bound) 스크립트라 `clasp list-scripts`에 안 보임 → 편집기 프로젝트 설정의 스크립트 ID로 clone. 운영 배포 ID `AKfycbzzta…FGFS6_Q`가 해당 스크립트 배포 목록에 있음을 확인(버전 73). 백엔드 파일명은 편집기 기준 `Code.js`(이전 문서의 `apps_script_new.gs`와 동일 내용).

**수정 (backend/Code.js, 2줄):** 8행 `const ADMIN_PW = "…"` → `PropertiesService.getScriptProperties().getProperty("ADMIN_PW")` (사용자가 Script Properties에 먼저 저장 후 배포). 83행 ping `version: "v4"` → `"v5"`. 914줄 그대로, 코드에 비밀번호 평문 0건.

**배포:** 배포 전 점검 — 배포 ID가 운영 URL·deploy-backend.sh·list-deployments 세 곳에서 글자 단위 일치, clasp 소스에서 `--deploymentId` 지정 시 `deployments.update`(기존 배포 갱신) 호출 확인, appsscript.json(ANYONE_ANONYMOUS / USER_DEPLOYING) 무변경. `./deploy-backend.sh` → 같은 배포 ID가 @73 → @74, 배포 개수 2개 그대로(새 URL 없음).

**검증:** ping `version:"v5"` / 올바른 비밀번호 login `success:true` / 틀린 비밀번호 `success:false`. 2026-06-03 보안 메모의 "관리자 비밀번호 백엔드 소스 평문" 항목 해소.

**미적용:** 수정모드 비밀번호는 index.html의 해시로만 존재해 CLAUDE.local.md에 "모름"으로 기록. 사용자가이드.html 미보유. claude.ai 프로젝트 커스텀 인스트럭션 갱신/보관은 사용자 몫.

### 2026-10-31 — 보안: 서명·이름 입력 규칙, 관리자 로그인 시도 제한, POST 로그인 (백엔드 v6 → v7)
**배경:** 보안 점검 후 사용자 결정. 공개 제출은 의도된 설계로 유지하되 서명란은 한글·영문만 받기로 함. 로그인 강화.

**수정 (backend/Code.js):**
- 상단 신설: `NAME_RE`(/^[가-힣a-zA-Z ]{1,20}$/), `cleanName`(공백 정리), `isValidName`, `safeText`(길이 제한, = + - @ 시작 시 작은따옴표 접두로 수식 실행 방지).
- `handleSubmit`: 서명·수정자 이름 규칙 검사(위반 시 `success:false`), 사유 200자·수식 차단. 규칙 이전의 옛 서명은 시트에 같은 서명이 있을 때만 허용(관리자 수정용, 현재 1건).
- `handleDelete`: 이력에 쓰는 서명·사유·이름도 `safeText`.
- `handleLogin`: CacheService 실패 횟수(`login_fail`, 10분) → 10회면 `login_lock` 15분. 잠긴 동안은 맞는 비번도 거부(`locked:true`). `unlockLogin()` 신설.
- `doPost`에 `action:"login"` 추가. ping v6.

**수정 (index.html):** `NAME_RE`·`cleanName` 신설(백엔드와 동일), 서명·덮어쓰기·수정·삭제 이름 칸 검사와 `maxlength`(이름 20, 사유 200), 서명칸 안내문구. `checkPw`를 POST(text/plain, CORS 사전확인 없음)로 전환, 잠금 안내 토스트.

**검증:** 실제 Code.js를 모의 시트·캐시로 실행한 시험 30/30 통과(잠금·해제·옛 서명 수정·수식 차단 포함). 로컬 브라우저에서 잘못된 서명 4종 차단·네트워크 전송 0건 확인. 배포(@75) 후 실서버: ping v6, POST 로그인 성공/거부, 잘못된 서명·이름 제출 거부, 시트 행 수 변화 없음(565), 토큰 없는 getData 거부. Pages 반영 후 github.io 주소에서 브라우저 POST 로그인 요청·응답 정상.

**v7 (같은 날, @76):** 프론트 POST 전환 확인 후 `doGet`의 `action=login`을 중단("페이지를 새로고침" 안내 반환). 실서버: ping v7, GET 로그인 거부, POST 로그인 성공/거부, 서명 규칙 유지, 공개 달력 시트 HTTP 200.

**미적용:** 삭제 전 행 대조(점검 6번)는 사용자 결정으로 제외. 관리자 비밀번호는 사용자 결정으로 변경하지 않음. 드라이브 폴더 조직 내 공유 전환·GitHub 기록 정리는 사용자 결정 대기.

### 보안 점검 메모 (2026-06-03, 사용자 결정에 따라 현행 유지)
아래는 점검에서 식별됐으나 사용자 판단으로 당장 변경하지 않은 항목:
- **시트 전체 공개 읽기:** 달력이 gviz CSV를 무인증 fetch(`docs.google.com/.../gviz/tq?...&sheet=출석보고`). 시트가 공개 읽기 상태여야 동작. `SHEET_ID`가 공개 index.html(소스 보기)에 노출 → 누구나 전체 CSV(서명/이름 포함, 타 탭 포함) 직접 취득 가능. 공개 달력 UI는 서명 미표시지만, 방문자 브라우저는 전체 CSV를 내려받음(_pubRows). → 추후 "공개엔 숫자만, 이름 분리" 검토.
- **수정모드 비밀번호 클라이언트 검증:** `EDIT_PW_HASH` 공개 노출 + 브라우저 비교. 단 실제 작업은 서버 토큰 필요 → UI 가림막일 뿐, 영향 제한적.
- **관리자 비밀번호 백엔드 소스 평문:** ~~`ADMIN_PW`(gs 8행)~~ → **2026-10-31 해소**: Script Properties `ADMIN_PW`에서 읽음(백엔드 v5). 로그인 비번 URL 쿼리 전송 → **2026-10-31 해소**: v6에서 POST 로그인 추가·프론트 전환, v7에서 GET 로그인 중단.
- **로그인 시도 제한 없음:** → **2026-10-31 해소(v6)**: 틀린 시도 10회 누적 시 15분 잠금(전체 기준). 편집기에서 `unlockLogin` 실행으로 즉시 해제.

**확정된 정상 동작:** 관리자 비번 서버 검증 / 민감 작업(delete·getData·report·monthlyReport) 전부 서버 토큰 검증 / 토큰 UUID+1h TTL / 전 구간 HTTPS.
