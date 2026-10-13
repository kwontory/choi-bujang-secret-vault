# BYTE BACK 방어전 · 12단계 저장점

Supabase Auth 로그인과 서버 토큰 검증을 유지하면서, 로그인·메모 CRUD를 Vercel 서버 함수로 통일했습니다. 비밀번호, JWT, 서버 전용 키는 저장소·응답·로그에 넣지 않습니다.

## 무엇을 누가 만들었나 (출처)

| 출처 | 들어 있는 것 |
|---|---|
| 학생이 만든 것 | 판정기 `src/decider.mjs`, 탐지 규칙 `src/detect.mjs`, 접속 앱 화면 `public/`(자료실 `index.html`·탈환 작전실 `ops.html`), 자료실 서버 함수 `api/`·`src/`, 복구 `src/note-backup.mjs`·`src/policy-restore.mjs`, 점검 `src/attack-check.mjs`·`scripts/ops-table.mjs`, XDR 판정 `xdr/*/decide.mjs` |
| 제공 엔진 | **ALEPH SDP 엔진**. 운영 반의 로그인 세션 확인, 기기 등록, 판정기 호출과 집행, 사건 전달, 감사 기록 보관은 엔진이 맡습니다. 이 저장소에는 엔진 코드가 없고, 판정기는 `docs/DECIDER_REQUEST.md` 계약의 요청만 받습니다. |
| 외부 서비스 | Supabase Auth·DB(로그인·메모 저장), Vercel(배포). 비밀값은 Vercel 환경변수에만 두고 저장소에 포장하지 않습니다. |

## 설치·실행·중지·복구 (검사한 커밋 기준)

검사한 커밋은 `npm run bundle`이 만든 `artifacts/submission.json`의 `commit` 값이며, 배포의 `/aleph.json` `commit` 과 같아야 합니다.

1. **설치:** `git clone https://github.com/kwontory/choi-bujang-secret-vault && cd choi-bujang-secret-vault && git checkout <검사한 커밋>` → `npm install`. Node.js 22 이상.
2. **DB 준비(한 번):** Supabase SQL Editor 에서 `supabase/step2.sql` → `step3.sql` → `step4-policy.sql`(·`step4-seed.sql`) → `step8-zones.sql` → `step10-backup.sql` → `step11-devices.sql` 순서로 검토 후 실행합니다.
3. **실행:** Vercel 프로젝트에 이 저장소를 연결하고 환경변수 `SUPABASE_URL`, `SUPABASE_SECRET_KEY` 를 공식 입력란에만 넣은 뒤 배포합니다(빌드 `npm run build`, 화면 `public/`, 서버 함수 `api/`). 로컬 확인은 `npm test`(판정기·탐지·복구 연습, 인터넷 불필요).
4. **점검:** 탈환 작전실 `/ops.html` 에서 서버 요약과 실측 표를 봅니다. 로그인 요청까지 실측하려면 시험 계정으로 `OPS_A_EMAIL=… OPS_A_PASSWORD=… [OPS_B_EMAIL=… OPS_B_PASSWORD=…] npm run ops:table`(비밀번호는 출력·저장하지 않음). 제출 묶음은 `npm run bundle`.
5. **중지:** Vercel 에서 배포를 내리거나(Instant Rollback·프로젝트 일시 중지) 엔진 쪽 경로 허용을 끕니다. 특정 기기만 막을 때는 강사 계정으로 `PUT /api/admin/devices/:id` `{"status":"revoked"}`.
6. **복구:** 검사한 커밋으로 되돌려 다시 배포합니다(`git checkout <검사한 커밋>` → 재배포). 메모 한 건은 `POST /api/restore/notes/:id`, 판정 규칙은 `npm run policy:diff` → `npm run policy:restore`. 복구 뒤에는 아래 「복구 뒤 1~9단계 재시험 순서」와 `npm run ops:table` 을 다시 실행합니다.

## 12단계 탈환 작전실

- `/ops.html`: 판정기 규칙(RULE_IDS 와 고정 가상 판정 결과), 탐지 규칙(조회 폭주 가상 사건), 기기 회수 상태(서버 저장소의 승인·대기·회수 건수), 복구 버전(안전 정책 사본 버전·메모 사본 수·마지막 복원)을 `GET /api/checks?view=ops`(내부 `src/ops-summary.mjs`) 실제 응답으로만 보여 줍니다. 조회하지 못한 항목은 「미실행」입니다. 메모 본문·사용자 ID·기기 ID·토큰은 표시하지 않습니다.
- 같은 화면의 1~11단계 실측 표는 이 브라우저에서 로그인 없이 보낼 수 있는 정상·금지 요청(`public/ops-cases.js`)을 실제로 보내 기대 결과·실제 HTTP 결과·요청 ID(`x-vercel-id`)·확인 시각을 적습니다. 로그인·승인 기기가 필요한 시험과 심판 총공세 41종은 「미실행」으로 남기며 통과로 바꾸지 않습니다.
- `npm run ops:table` 은 같은 표를 명령줄에서 만들고, 시험 계정을 넣으면 승인 기기의 정상 요청(목록·추가·조회·삭제·공지 읽기)과 금지 요청(전체 목록·공지 쓰기·강사 자료·서명 없음·서명 뒤 경로/본문 변경·위조 증표·다른 계정 메모)까지 실측해 `artifacts/ops-table.json`(커밋하지 않음)에 씁니다.

## 현재 작동하는 기능

자세한 설명은 `docs/FEATURES.md`, 6~9단계 확인 방법은 `docs/STAGE_CHECKS.md`에 있습니다.

- 1~5단계: `/api/auth` 로그인, 서버 토큰 검증, 자기 가상 메모만 CRUD(다른 소유자 ID 는 `404`), 토큰 없는 `/api/notes` 는 `401`, `/data.json` 은 빈 배열, 원본 API 주소는 `aleph.config.json` 에 기록.
- 6단계 `device_registered`: `deviceRegistered === true` 이고 기기 ID 가 16자리 소문자 16진수일 때만 통과, 아니면 `deny`·`device_not_registered`.
- 7단계 `step_up_required`: 엔진이 검증한 접속 정보(`judge_fixture`)에서 낯선 지역·시각·네트워크·대량 행동이면 `step_up`, 출처 불명 정보는 정상값으로 채우지 않음, 5분 이내 재로그인(`stepUp`)만 다시 허용.
- 8단계 구역: 메모(`zone_notes_item_only`)는 ID 하나 경로만, 반 공지(`zone_announcements_read_only`)는 GET 만, 강사 자료(`zone_instructor_materials_closed`)는 모두 거부. API 도 소유자·저장된 강사 권한표로 다시 확인.
- 9단계 탐지 `src/detect.mjs`: 같은 사용자의 10분 안 121건 이상 조회 + 낯선 네트워크일 때만 `propose_revocation`·`burst_read`·대상 기기 한 개.
- 10단계 복구: 침해 전 사본·감사 기록, `POST /api/restore/notes/:id` 로 검증한 한 건만 복원, 안전 정책 사본 대조·복원(`npm run policy:diff`·`policy:restore`).
- 전역 접근 통제: 모든 보호 API 가 앱 서명·서버 승인 기기를 확인한 뒤 같은 판정기에 물어 허용된 경로만 처리합니다. 선언된 경로(`allowedRoutes`) = 판정기 허용 = API 구현이며 `npm run routes:test`로 대조합니다. 내 메모 목록은 `GET /api/my/notes`(전체 목록 `GET /api/notes`와 구분, 거부), 새 메모는 `PUT /api/notes/<새 UUID>`.
- 12단계 탈환 작전실: `/ops.html` 과 `npm run ops:table`(아래 「12단계 탈환 작전실」).
- 11단계 설치형 웹앱(접속 앱): manifest(앱 이름·192/512 아이콘)·서비스 워커·오프라인 안내·기기 승인 화면. **서명 규약과 시험 명령은 `docs/APP_SIGNING.md`**. 승인은 서버(로그인·기기 개인키 증명·회수 여부)와 판정기 `decide()` 가 정하고, 승인된 기기에서만 자료실이 열림. 기기 키·토큰·승인 증표는 메모리에만 둠. 설치형 앱 서명 없는 보호 요청은 `403`, 서명 뒤 경로·본문 변경은 `401`, 판정기 `request_integrity` 는 경로·메서드 불일치를 거부.

## 다시 실행하기

1. Supabase Authentication에서 A/B 실습용 계정을 준비합니다. 비밀번호는 공식 입력 화면에만 넣습니다.
2. `supabase/step4-seed.sql`의 A/B 이메일 자리표시자를 SQL Editor에서 채우고, 대상 세 메모를 확인한 뒤 실행합니다.
3. `supabase/step4-policy.sql`을 검토하고 실행한 다음, 출력된 전후 권한을 비교합니다.
4. Vercel 환경변수 `SUPABASE_URL`, `SUPABASE_SECRET_KEY`를 유지한 채 재배포합니다.
5. 로컬 검증은 `npm run build -- --local && npm run test:step3`로 실행합니다.

## 확인 절차

- 로그아웃 상태에서 `/api/notes`가 `401` JSON 오류를 반환하는지 확인합니다.
- 실습용 A/B 계정으로 각각 로그인해 자기 메모 CRUD가 되고 상대 메모 ID로 조회·수정·삭제가 `404`인지 확인합니다.
- `anon`에 메모 테이블 권한이 없고 `authenticated`에는 SELECT·INSERT·UPDATE·DELETE만 있는지 SQL 출력으로 확인합니다.
- 브라우저 파일과 응답에 `SUPABASE_SECRET_KEY` 또는 서버 비밀키가 없는지 확인합니다.
- `npm run test:step3`으로 발급자 정보, 실제 CRUD 경로, 공식 로그인 흐름, 서버 토큰 검증기 사용을 확인합니다.

## 새로 받아 실행하기(로컬·격리 환경)

- `npm install` → `npm test`(판정기·탐지·7단계 사건·정책 복원·메모 복구 로컬 연습, 인터넷 불필요) → `npm run build`(Vercel 밖에서는 `public/aleph.json`만 건너뜀).
- `src/decider.mjs`, `src/detect.mjs`는 `import` 없는 한 파일이라 다른 파일·패키지·네트워크 없이 불러와 바로 답합니다.
- `npm run bundle`의 자기 점검(`src/attack-check.mjs`)은 공식 표본과 같은 형식입니다. 배포 주소(`publicAppUrl`)만 받아 실제 배포에 읽기 요청(GET)을 보내고, 응답 상태로 `observed`를 만듭니다. 점검마다 `attackId·stage·expected·observed·result`를 적고, 요청을 보내지 못하면 `result: "not_run"`으로 남깁니다.
- 6~9단계 규칙 점검은 배포된 `/api/checks?case=...`(vercel.json 이 `api/threat-intel.js`로 연결, 내부는 `src/rule-check.mjs`)가 고정된 가상 입력으로 판정기·탐지 규칙을 실행한 응답을 받습니다. 응답의 `ready`는 그 가상 조건을 충족했는지만 뜻하며 실제 기기 승인 상태가 아닙니다.
- runner가 응답을 독립 관측할 수 있도록 요청마다 `alephEvidence`에 사례 ID(`caseId` = `attackId`)와 요청 ID를 연결합니다. 이 메타데이터는 요청 헤더나 URL에 넣지 않습니다.

## 11단계 접속 앱 확인 순서

서명 규약 전체는 `docs/APP_SIGNING.md`에 있습니다.

1. `npm run device:test`(인터넷 불필요): 서버 승인 흐름·서명 확인 13가지가 모두 `통과`.
2. `APP_TOKEN=<로그인 토큰> node scripts/app-client.mjs check`(배포 주소 대상): 승인 전 미승인 → 서버·판정기 승인 → 서명한 `GET /api/my/notes` `200`, 전체 목록 `GET /api/notes` `403 note_list_denied`, 서명 없는 보호 요청 `403 device_signature_required`, 서명 뒤 경로 변경·본문 변경 `401 device_signature_invalid`, 위조 증표 `401`.
3. 배포 주소 `/`: 로그인 전에도 「이 기기 승인: 미승인」과 승인 안내가 보이고 자료실은 숨겨져 있습니다. 로그인하면 `승인 요청 중` → `승인됨`이 된 뒤에만 기존 메모 목록·추가·수정·삭제가 열리며, 승인 전에는 보호 요청이 나가지 않습니다. 화면에는 내 메모와 반 공지(읽기 전용)가 보입니다.
4. 브라우저 메뉴의 「앱 설치」로 설치해도 승인 흐름은 같습니다(설치 상태는 참고 표시). 오프라인이면 안내만 보이고 자료는 보이지 않습니다.
5. (선택) 기기 회수를 쓰려면 `supabase/step11-devices.sql`을 실행하고 `PUT /api/admin/devices/:id`(저장된 강사 권한표의 사용자만)로 `revoked`를 지정합니다.

## 10단계 백업에서 되살리기

### 준비(한 번)

1. Supabase SQL Editor에서 `supabase/step10-backup.sql`을 검토하고 실행합니다. 사본 표 `note_backups`, 감사 표 `note_audit`가 생기고, 지금 소유자가 있는 메모마다 첫 사본이 만들어집니다. 마지막 결과의 `backups`와 `verified` 수가 같아야 합니다. 감사 표는 서버 키로도 수정·삭제할 수 없습니다.
2. 실행 전에는 복구 경로가 사본을 읽지 못해 `503 backup_unavailable`로 멈춥니다. 메모 화면은 그대로 동작합니다.

### 메모 한 건 복구 (서비스 `notes`, 경로 `POST /api/restore/notes/:id`)

- `aleph.config.json`의 `restoreRoute`에 같은 경로를 적었습니다. 시험 계정 B의 메모로만 확인합니다.
- 순서: 로그인 확인(없으면 `401`) → 사본을 다시 읽어 ID·소유자·내용 해시 검증(사본 없음 `404 backup_not_found`, 검증 실패 `409 backup_unverified`, 이때는 복원하지 않음) → 바뀔 항목 계산 → 감사 기록 먼저 남김(실패하면 `503 audit_unavailable`로 멈춤) → 그 한 건만 복원(삭제된 메모는 같은 ID·소유자로 다시 만듦) → 다시 읽어 사본과 대조(다르면 `500 restore_mismatch`).
- 본문에 `{ "dryRun": true }`를 보내면 복원하지 않고 사본 버전·바뀔 항목만 돌려줍니다.
- 다른 사람 메모의 ID는 `404`, 같은 ID가 다른 사용자 것이면 `409 owner_conflict`, 본문의 `owner_id`·`role`은 `400`입니다. 다른 메모와 감사 기록은 바꾸지 않고, 응답에 메모 본문을 넣지 않습니다.
- 정상 결과: B가 자기 메모를 변조하거나 삭제한 뒤 호출 → `200`, `restored: true`, `restoredSha256`이 `backupSha256`과 같음. 이어서 `GET /api/notes/:id`로 원래 제목·본문이 보입니다.
- 로컬 연습: `npm run restore:test`(메모리 안 가짜 저장소, 배포 확인 아님).

### 안전 정책 사본 대조·복원

1. `npm run policy:diff`: 침해 전에 검증한 사본(`policy/safe-policy.json`, 버전 `stage11-device-approval`)을 다시 읽어 해시를 검증하고, 시험 정책과 다른 규칙만 보여 줍니다. 사본이 없거나 검증 실패면 멈춥니다. 운영 판정기 규칙 이름은 읽기만 하고 비교 결과만 적습니다.
2. `npm run policy:restore`: 복원할 버전과 바뀔 항목만 보여 주고 멈춥니다.
3. `npm run policy:restore -- --yes`: 확인한 뒤 시험 정책의 규칙 표만 사본으로 되돌립니다. 다른 서비스 규칙(`otherServices`)과 감사 이력(`audit`)은 보존하고 복원 기록을 한 줄 덧붙입니다. `src/decider.mjs`, `aleph.config.json`, Supabase 권한(실제 운영 정책)은 바꾸지 않습니다.
4. 로컬 연습: `npm run policy:test`(임시 폴더 사본으로 변조→대조→확인→복원, 저장소 파일은 바꾸지 않음).

### 복구 뒤 1~9단계 재시험 순서

복구한 뒤 아래 순서로 다시 실행합니다. 결과 칸은 실제로 실행한 것만 적고, 실행하지 않은 시험은 `미실행`으로 둡니다.

| 순서 | 단계 | 정상 요청 (통과해야 함) | 금지 요청 (거부되어야 함) | 방법 | 결과 |
|---|---|---|---|---|---|
| 1 | 1·2 | `/` 첫 화면 `200` | `/data.json`에 메모 본문 없음(`notes: []`) | 브라우저·`npm run bundle` | 미실행 |
| 2 | 3 | 로그인 뒤 `GET /api/notes` `200` | 토큰 없는 `GET /api/notes`·`/api/notes/:id` → `401` | 시크릿 창·`npm run bundle` | 미실행 |
| 3 | 4·5 | A 로그인으로 자기 메모 CRUD | A·B가 상대 메모 ID로 조회·수정·삭제·복구 → `404` | A/B 실습 계정 | 미실행 |
| 4 | 6 | 등록 기기 요청 `allow` | 미등록 기기 `deny`·`device_not_registered` | `npm run decider:test` | 미실행 |
| 5 | 7 | 정상 접속 `allow`, 다시 확인한 접속 `allow` | 복합 이상 접속 `step_up`·`step_up_required` | `npm run decider:test`, `npm run fixture:7` | 미실행 |
| 6 | 8 | 자기 메모 한 건 `allow`, 공지 읽기 `allow` | 메모 전체 목록·공지 쓰기·강사 자료 `deny`, 비로그인 `/api/announcements`·`/api/materials` → `401` | 판정기 가상 요청, 시크릿 창 | 미실행 |
| 7 | 9 | 평소 네트워크 조회 `observe` | 낯선 네트워크 다량 조회 `propose_revocation` | `npm run detect:test` | 미실행 |
| 8 | 10 | B 메모 복구 `200`·해시 일치, 정책 대조 차이 없음 | 사본 없음·검증 실패 시 복원 멈춤, 비로그인 복구 `401` | `npm run restore:test`, `npm run policy:diff`, 시험 계정 B | 미실행 |
| 9 | 11 | 승인된 기기에서 기존 자료실 화면 정상 | 승인 전 자료 없음, 비로그인 기기 상태 `401`, 판정기 `request_tampered` | 접속 앱 화면, 판정기 가상 요청 | 미실행 |

실제 실행 결과는 날짜와 함께 이 표의 결과 칸에 적습니다. 로컬 연습 명령의 통과는 배포 복구나 심판 판정이 아닙니다.

`xdr/` 폴더는 보너스 XDR 작전 판정 모듈이며 `npm run xdr:run`으로 실행합니다. `src/attack-check.mjs`의 결과는 학생의 자기 점검일 뿐 운영 심판 판정이 아니며, 옛 공개 커밋·배포 이력의 과거 노출이 해소됐다고 보지 않습니다.
