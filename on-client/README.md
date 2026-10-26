# 내 보안 Agent 시작 틀 0.2.11

이 보안 Agent는 회사 직원이 자기 로그인 상태, 업무 앱 접속 결과, 최근 접속 기록과 보안 경보를 보는 보안 앱입니다. 13단계부터 22단계까지 이 프로젝트 하나로 화면을 채워 가며 완성합니다. 처음이라면 docs/GETTING_STARTED_STUDENT.md부터 읽습니다. 무엇을 왜 만드는지와 단계별 순서가 그 문서에 있습니다.

이 시작 틀을 받은 것만으로 단계를 통과하지 않습니다. 단계마다 docs/STUDENT_PROMPTS.md의 안내를 수업용 AI에 붙여 넣어 student/extension.mjs를 고치고, 화면에서 확인하고, 커밋한 뒤 ALEPH에 제출합니다. 제출하면 서버가 그 커밋의 코드를 받아 AI가 단계 과제 기준으로 읽고 판정합니다. 코드를 실행해서 판정하지 않습니다.

## 켜기

검수 환경은 Node.js 24.19.0이며 외부 npm 의존성이 없습니다. 이 폴더의 PowerShell에서 아래를 실행하고 PC 브라우저로 http://127.0.0.1:5189 를 엽니다. 자세한 켜기·끄기·다시 켜기는 docs/STUDENT_LAUNCH_GUIDE.md에 있습니다.

    powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\start-alekov.ps1

npm start도 같은 서버를 켭니다. 기본 실행은 실제 회사 시스템(기존 엔진)에 연결되지 않은 상태입니다. npm run demo는 예제 자료로 화면을 보여 줄 뿐이며 실제 연결이나 성취가 아닙니다. npm run check는 student/extension.mjs의 문법만 확인합니다.

## 지킬 것

- 기존 1~3차 프로젝트와 학생 파일은 지우거나 덮어쓰지 않습니다. 새 폴더에서 시작하거나, 이미 하던 프로젝트를 이어 씁니다.
- AI 열쇠·비밀번호·토큰을 코드, 커밋, 캡처, 도움정보에 넣지 않습니다. 주소나 열쇠를 직접 입력하는 칸도 만들지 않습니다.
- .env.example에는 비밀 없는 설정만 있습니다.

## 더 읽을 곳

- 단계별 안내와 AI에 붙여 넣을 문장: docs/STUDENT_PROMPTS.md
- 단계별 확인 항목: docs/CURRICULUM.json, docs/IMPLEMENTATION_CONTRACT.md
- 오류 코드별 해결: docs/CONNECTION_TROUBLESHOOT.md
- 시작 틀 업데이트(내 파일 보존): docs/STARTER_UPDATE.md
- 실제 회사 시스템(SDP)·앱 안 AI 연결은 담당자가 따로 안내할 때만 씁니다: docs/SDP_HOST_CONNECTION.md, docs/AI_SETUP_GUIDE.md. 이 연결은 앱을 처음 켜고 13~16단계 화면을 만들거나 공식 AI 코드 판정을 받기 위한 전제 조건은 아닙니다. 다만 17단계 이후의 실제 연결과 새 환경 재현은 해당 단계의 기준에 따라 따로 확인합니다.

## 학생 작성 부분 (케셰브 · 13~21단계)

이 아래는 학생이 작성했습니다. 위의 제공 안내는 그대로 두었습니다.

- **목적**: 직원이 자기 로그인·기기·세션, 업무 앱 접근 판정, 본인 접속 기록과 XDR 경보, AI 사건 설명, 조치 처리 상태, 설치 패키지의 알려진 취약점을 한 화면에서 구분해 보는 보안 앱입니다.
- **기능**: 13 로그인·기기·세션 / 14 업무 앱 판정 / 15 접속 기록·XDR 경보 목록·필터·상세 / 16 알림·빈 화면·실패·도움정보 복사 / 17 AI 연결 점검 / 18 근거에 연결된 AI 사건 설명 / 19 조치 제안·사람 확인·ACK·효과 관측 구분 / 20 정확한 설치 버전의 OSV 조회 결과.
- **구성**: 브라우저(`public/`, 학생 표시 함수 `student/extension.mjs`) → 로컬 앱 서버(`src/server.mjs`, `127.0.0.1:5189`) → 연결 어댑터(`src/engine.mjs`)를 거쳐 SDP 접근 제어·XDR / AI 게이트웨이(`src/ai/`) / 조치 서비스(`src/actions/`) / OSV(`src/vulnerabilities/`).
- **지원 환경과 버전**: Windows PowerShell, Node.js 24.19.0 기준(실행 도구는 22~24 허용), 외부 npm 의존성 없음, 시작 틀 0.2.11.
- **학생이 고친 파일**: `student/extension.mjs`(표시 함수 8개), `docs/STUDENT_RUNBOOK.md`, 이 절. 제공 서버·화면·도구는 고치지 않았습니다.

실행·종료·재실행 순서, Mermaid 구성도와 같은 내용의 글 설명, 제공/학생 경계, 확인함·미확인 목록, 오류별 확인 순서는 [docs/STUDENT_RUNBOOK.md](docs/STUDENT_RUNBOOK.md)에 있습니다.
