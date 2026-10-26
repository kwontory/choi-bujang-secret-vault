# 케셰브 릴리스·재현 기록 (학생 작성, 22단계)

## 1. 버전과 상태

| 항목 | 값 |
|---|---|
| 앱 | 케셰브 (on-client 시작 틀 0.2.11 기반) |
| 학생 버전 | **0.9.0 — 검증 중(release candidate)**. v1.0 이 아닙니다. 실제 SDP·XDR·AI·조치 집행 연결이 확인되지 않아 운영 인증 버전으로 표시하지 않습니다. |
| 저장소 | https://github.com/kwontory/choi-bujang-secret-vault (브랜치 `main`) |
| 재현한 코드 커밋 | `358c68cc7b9dd1e28e8b503e0782e646381e8167` (21단계 제출 커밋) |
| 이 기록을 담은 최종 커밋 | 위 커밋 다음의 22단계 커밋. 실행 코드(`on-client/src`·`public`·`student`·`tools`·`package.json`)는 위 커밋과 같고, 바뀐 것은 이 문서·`docs/STUDENT_RUNBOOK.md` 의 설명·`on-client/.env.example` 추가·`.gitignore` 예외 한 줄입니다(아래 5장). |

ALEPH 공식 판정(13~21단계 통과)은 서버의 AI 가 각 제출 커밋의 **원문을 읽고 내린 판정**입니다. 서버가 코드를 실행했다는 뜻이 아니며, 이 문서의 실행 결과를 대신하지도 않습니다. 단계별 통과 결과는 서로 다른 커밋에서 나왔으므로, 그것을 합쳐 "최종 버전 전체 성공"으로 표시하지 않습니다.

## 2. 증거 구분

| 표기 | 뜻 |
|---|---|
| 실행 확인 | 이 기록 작성 중 새 폴더의 코드를 실제로 실행해 응답·화면을 관찰함 |
| 예제(demo) | `--demo` 예제 엔진의 가짜 자료로 확인함. 실제 시스템 연결이 아님 |
| 모의 확인 | 가짜 DOM 에 상태별 입력을 넣어 학생 함수만 그려 봄 |
| 원문 확인 | 코드를 읽고 대조만 함(실행 안 함) |
| 학생 진술 | 학생이 직접 했다고 적는 내용(서버 검증 아님) |
| 미확인 | 실행하지 않았거나 운영 측 준비가 없어 확인 불가 |

## 3. 재현 환경과 절차 (2026-10-26, UTC)

원래 작업 폴더(`C:\Users\victo\work\choi-bujang-secret-vault`)는 건드리지 않고 그대로 두었습니다. 기존 폴더의 `.env`·인증·설정 파일은 복사하지 않았습니다.

| 환경 | 내용 |
|---|---|
| A. 사용자 PC 의 Linux 작업 환경 | 새 빈 폴더 `~/repro-22` 에 GitHub 에서 clone, Node v22.23.4, npm 10.9.9 |
| B. 별도 클라우드 Linux 작업 환경 | 새 빈 폴더에 GitHub 에서 clone, Node v22.23.4, 헤드리스 Chromium(Playwright)으로 화면 확인 |
| C. Windows PowerShell (수업 기준 환경) | **미확인** — 이 기록 작성 중 Windows 창에서 실행하지 않음(6장에 직접 확인 절차) |

| 순서 | 명령(on-client 폴더) | 관찰 결과 | 시각(UTC) | 증거 |
|---|---|---|---|---|
| 1 | `git clone https://github.com/kwontory/choi-bujang-secret-vault.git app` → `git checkout 358c68cc…` | 커밋 `358c68cc…` 확인 | 11:13:01 | 실행 확인(A) |
| 2 | 런타임 확인 `node --version` | v22.23.4 (실행 도구 허용 범위 22~24, 수업 기준 24.19.0 과 다름) | 11:13 | 실행 확인(A·B) |
| 3 | 설치 | 외부 npm 의존성이 없어 `npm install` 불필요(`on-client/package.json` 에 dependencies 없음) | — | 원문 확인 |
| 4 | `npm run check` | 출력 없이 종료 코드 0 | 11:13:24 | 실행 확인(A) |
| 5 | `node src/server.mjs` (= `npm start`) | 시작 신호 `케셰브 연결 확인: http://127.0.0.1:5189` | 11:13:25 | 실행 확인(A) |
| 6 | 기본 모드 응답 | `/`·`/student/extension.mjs` 200, `/api/me`·`apps`·`events`·`devices`·`sessions` 503 `ENGINE_NOT_CONNECTED`, `/api/diagnostics` 200, `/api/vulnerabilities` 200 `not_configured` | 11:13:25 | 실행 확인(A) |
| 7 | 종료 | 프로세스 종료 뒤 `/` 연결 안 됨(응답 없음) | 11:13:34 | 실행 확인(A) |
| 8 | 재실행 `node src/server.mjs --demo` (= `npm run demo`) | 시작 신호 `케셰브 예제: http://127.0.0.1:5189`, `/api/me`·`/api/events` 200 예제 자료 | 11:13:34 | 예제(A) |
| 9 | 브라우저 화면(예제) | 학생 칸 8개가 모두 그려지고 페이지 오류 0건(아래 4장) | 11:14:41 | 예제(B) |
| 10 | 학생 함수 상태별 표시 | 17단계 21건, 18단계 10건, 19단계 12건, 20단계 6건 모의 입력 모두 의도대로 | 11:14 | 모의 확인(A) |

Node 22 에서는 `ExperimentalWarning: SQLite is an experimental feature` 경고가 한 번 나옵니다. 실행 실패가 아닙니다(실행 확인).

## 4. 13~21단계 기능별 결과 (재현 커밋 `358c68cc…` 기준)

| 단계 | 기능(학생 함수) | 새 폴더 재현 결과 | 근거 | 실제 시스템 연결 | 미확인 원인 |
|---|---|---|---|---|---|
| 13 | 로그인·기기·세션 (`renderIdentity`) | 기본 모드: 연결 실패 안내 / 예제: 사용자·기기(주의: 확인 불가)·세션(활성) 표시 | 실행 확인(A), 예제(B) | 미확인 | 개인 SDP 설정(`-SdpHostConfig`) 없음 |
| 14 | 업무 앱 판정 (`renderDecision`) | 예제: 「학습 자료실 접속 요청」→ 접근 허용(allow)·이유·시각 | 예제(B) | 미확인 | 위와 같음 |
| 15 | 접속 기록·XDR 목록·필터·상세 (`renderEvents`) | 예제: 1건 최신순, 필터 3개, 상세(`data-student-event-detail`) 열림 | 예제(B) | 미확인 | 위와 같음 |
| 16 | 알림·기기·세션·도움정보 (`renderStatus`) | 예제: 알림 2건(기기 unknown, 접속 기록) 표시 | 예제(B) | 미확인 | 위와 같음 |
| 17 | AI 연결 점검 (`renderAiConnection`) | 점검 전 상태 표시(예제), 기본 모드 `/api/ai/check` = `ENGINE_NOT_CONNECTED`, 오류 코드 12종 모의 확인 | 실행 확인(A), 모의 확인 | 미확인 | 운영 측 계정·앱 권한 준비 필요, 유료 요청 시험하지 않음 |
| 18 | 근거 연결 AI 설명 (`renderExplanation`) | 기록 미선택 안내 표시(예제), 근거 불일치·실행 주장 거부 등 모의 확인 | 예제(B), 모의 확인 | 미확인 | 위와 같음 |
| 19 | 조치 상태 (`renderAction`) | idle 표시(예제), 11개 상태·ACK/효과 분리 모의 확인 | 예제(B), 모의 확인 | 미확인 | 지원 조치 없음(`supportedActions` 빈 배열), 실집행 연결 미준비 |
| 20 | 설치 패키지 OSV (`renderVulnerabilities`) | 「설치 패키지 조회」→ 조회 준비 미완료(`not_configured`) 표시 | 실행 확인(A), 예제(B) | 미확인 | 조회 대상 프로젝트·승인 패키지 목록 미설정 |
| 21 | 실행 설명서·구성도 (`docs/STUDENT_RUNBOOK.md`) | 설명서의 명령·주소·시작 신호가 재현 결과와 일치 | 실행 확인(A) | 해당 없음 | Windows 실행 도구 절차는 미확인 |

## 5. 재현 중 발견한 문제와 수정

| 문제 | 영향 | 수정 |
|---|---|---|
| 루트 `.gitignore` 의 `.env.*` 규칙 때문에 `on-client/.env.example` 이 저장소에 없음 | 새 폴더에 설정 예시가 없어 21단계 설명서의 `.env.example` 안내와 맞지 않음 | `.gitignore` 에 `!.env.example` 예외를 추가하고 비밀 없는 `on-client/.env.example` 을 커밋. 실제 `.env` 는 계속 제외 |
| 설명서가 `.env` 를 자동으로 읽는 것처럼 읽힐 수 있음 | 서버는 `.env` 파일을 읽지 않고 프로세스 환경변수(`process.env`)만 읽음(원문 확인) | `docs/STUDENT_RUNBOOK.md` 에 PowerShell 환경변수로 지정하는 방법을 적음 |

실행 코드에는 수정이 없어, 3·4장의 실행 결과는 최종 커밋의 실행 코드와 같은 코드에서 나온 것입니다.

## 6. 이동 가능한 구성과 Windows 직접 확인 절차

필요한 것: Git, Node.js 22~24(수업 기준 24.19.0). 로컬 절대경로나 비밀값에 의존하지 않습니다. 설정은 모두 선택 사항이며 기본값으로 실행됩니다(`ON_PORT` 기본 5189).

```powershell
# 원래 폴더와 다른 새 빈 폴더에서 (예: 바탕 화면)
git clone https://github.com/kwontory/choi-bujang-secret-vault.git keshev-repro
cd keshev-repro
git checkout <최종 커밋 40자리>
cd on-client
node --version
npm run check
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\start-alekov.ps1
# 브라우저: http://127.0.0.1:5189/  →  종료: Ctrl+C  →  같은 명령으로 재실행
```

이 절차를 Windows 에서 실행한 결과는 **미확인**입니다. 실행하면 위 3장 표에 「환경 C」 행으로 결과·시각을 학생 진술로 덧붙입니다.

## 7. 데이터 보존 계획

| 데이터 | 위치 | 보존·백업 | 복원 | 제한 |
|---|---|---|---|---|
| 학생 코드·문서 | Git 저장소(`on-client/student/`, `on-client/docs/`, `README.md`) | 단계마다 커밋하고 GitHub `origin` 에 push. 원래 작업 폴더는 지우지 않음 | `git clone` 후 해당 커밋 `checkout`. 되돌릴 때는 `git revert` 나 특정 파일만 `git checkout <커밋> -- <파일>`, `git reset --hard` 는 쓰지 않음 | push 하지 않은 커밋은 PC 에만 있음 |
| 1~12단계 기록·이전 성취 | 같은 저장소 루트와 이전 브랜치(`step2-storage` 등) | 지우거나 덮어쓰지 않음 | 브랜치·커밋으로 확인 | — |
| 실행 설정 | 프로세스 환경변수(`ON_PORT` 등), 예시는 `on-client/.env.example` | 비밀이 없는 예시만 커밋 | 예시를 보고 다시 지정 | 실제 `.env`·`bundle-notes.json`·`artifacts/` 는 커밋하지 않음(`.gitignore`) |
| 조치 기록 DB | 담당자가 지정한 SDP 호스트 설정의 `databasePath`(프로젝트 밖) | 학생 저장소에 넣지 않음 | 담당자 절차 | 기본 실행에서는 만들어지지 않음(지원 조치 없음) |
| AI 앱 열쇠 보관함 | 신뢰된 호스트가 구성하는 Windows 경로(프로젝트 밖) | 학생이 복사·커밋하지 않음 | 계정 연결·AI 승인을 다시 진행 | 화면·도움정보·Git 에 나오지 않음 |
| 브라우저 화면 상태(필터·선택) | 브라우저 메모리 | 보존하지 않음(새로고침 시 초기화) | 다시 선택 | 의도된 동작 |

## 8. 지원 범위와 미해결 사항

- 지원: Windows PowerShell + Node 22~24 에서 로컬 `127.0.0.1` 실행, 기본(연결 없음)·예제(demo) 모드, 학생 표시 함수 8개.
- 지원하지 않음: 다른 PC·휴대폰 접속, 외부 공개 배포, 주소·열쇠 직접 입력.
- 미해결·미확인:
  1. 실제 SDP 접근 제어·XDR 연결(사용자·기기·판정·기록) — 개인 SDP 설정 필요
  2. 실제 AI 연결 점검과 AI 사건 설명 — 운영 측 계정·앱 권한 준비 필요
  3. 실제 조치 집행과 효과 관측(19단계 실집행) — 연결 미준비
  4. 실제 OSV 조회 — 조회 대상·승인 패키지 미설정
  5. Windows PowerShell 실행 도구로 새 폴더 재현 — 6장 절차로 학생이 직접 확인 필요
  6. 수업 기준 Node 24.19.0 에서의 실행 — 재현은 v22.23.4 로만 함
