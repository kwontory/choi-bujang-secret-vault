# BYTE BACK 방어전 · 10단계 저장점

Supabase Auth 로그인과 서버 토큰 검증을 유지하면서, 로그인·메모 CRUD를 Vercel 서버 함수로 통일했습니다. 비밀번호, JWT, 서버 전용 키는 저장소·응답·로그에 넣지 않습니다.

## 현재 작동하는 기능

- `/`에서 `/api/auth`를 통한 이메일·비밀번호 로그인과 로그아웃을 할 수 있으며 공개 Supabase 키를 브라우저에 넣지 않습니다.
- 토큰 없는 `/api/notes` 요청은 `401`과 JSON 오류로 거부됩니다.
- 로그인 사용자는 자기 가상 메모만 목록·한 건 조회·추가·수정·삭제할 수 있습니다. 다른 소유자의 ID로 요청하면 `404`를 반환합니다.
- 서버는 브라우저가 보낸 소유자 ID를 거부하고, 검증된 토큰의 사용자 ID를 새 메모의 `owner_id`로 저장합니다. 수정과 삭제는 ID와 검증된 소유자를 함께 조건으로 사용합니다.
- 6단계: `src/decider.mjs`의 `device_registered` 규칙은 `docs/DECIDER_REQUEST.md` 계약의 `deviceRegistered`가 정확히 `true`이고 `deviceId`가 16자리 소문자 16진수일 때만 내 자료실 읽기(`GET`)를 `allow`·`approved`로 허용합니다. 미등록이거나 값이 없으면 `deny`·`device_not_registered`로 거부하고, 그 밖의 요청은 시작 기본값 `starter.deny`(`starter_not_ready`)로 거부합니다.
- 7단계: `step_up_required` 규칙은 엔진이 검증한 접속 정보(`signals.source`가 `judge_fixture`)에서 지역이 `local`이 아니거나, 네트워크가 `usual`이 아니거나, 시각이 06~22시 밖이거나, 최근 10분 사건(`recentEvents`)에 `risk_signal` 또는 합계 10건 이상의 대량 행동이 있으면 `step_up`·`step_up_required`로 다시 로그인을 요구합니다. 접속 정보가 없거나 출처가 불명확하면(알 수 없는 `source`, `none`인데 지역·네트워크 값이 있는 경우) 정상값으로 채우지 않고 추가 확인으로 보냅니다. 지역 하나만으로 영구 차단(`deny`)하지 않습니다. 엔진이 검증한 `stepUp.verified`가 `true`이고 `authAgeSeconds`가 300초 이내일 때만 다시 판정해 읽기를 허용합니다.
- 8단계 구역 나누기: 메모 응답에는 `note:<id>`, 반 공지 응답에는 `announcement:<id>` 자원 ID가 붙습니다. 판정기 구역표는 세 구역을 따로 둡니다.
  - 메모(`notes`, `zone_notes_item_only`): `GET·PUT·DELETE /notes/:id`(자료 ID 하나)만 허용, 전체 목록·ID 없는 경로는 `note_list_denied`, `/notes/:id/export` 같은 표에 없는 모양·쿼리 요청은 `route_not_allowed`.
  - 반 공지(`announcements`, `zone_announcements_read_only`): `GET /announcements`, `GET /announcements/:id`만 허용, POST·PUT·PATCH·DELETE는 누구에게나 `announcement_write_denied`.
  - 강사 자료(`materials`, `zone_instructor_materials_closed`): 모든 요청을 `instructor_material_denied`로 거부.
  - 구역표에 없는 서비스는 `starter.deny`(`starter_not_ready`). 메모 주인 비교는 판정기가 아니라 `api/notes.js`가 검증된 사용자 ID와 저장된 `owner_id`로 합니다. 자료 ID 형식은 판정기에서 좁히지 않습니다.
- 반 공지 API(`/api/announcements`, `/api/announcements/:id`)는 로그인한 사용자의 GET만 받고 쓰기는 `403 announcement_write_denied`입니다. 공지 수정은 강사 관리 경로 `PUT /api/admin/announcements/:id`에서만 하며, 서버에 저장된 강사 권한표(`class_instructors`)에 있는 학생 로그인 사용자만 통과하고 그 밖에는 `403 instructor_only`입니다. 강사 자료 API(`/api/materials/:id`)는 로그인 없으면 `401`, 있어도 `403 instructor_material_denied`입니다. 화면 메뉴나 요청 본문의 `role` 값은 믿지 않으며, 메모 본문에 `role`을 넣으면 `400`으로 거부합니다.
- 9단계 탐지: `src/detect.mjs`의 `detect(events)`는 가상 사건에서 가명 사용자(`identity.sub`)·기기(`deviceId`)·요청 종류(`method`)·판정(`decision`)·시각·네트워크만 읽고, 메모 본문·토큰·실명은 읽거나 돌려주지 않습니다. 같은 사용자의 `GET`이 어느 10분 구간에서든 120건을 넘고, 네트워크 정보가 있으면 그 구간에 평소와 다른 네트워크 조회가 있을 때만 `{ action: 'propose_revocation', reasonCode: 'burst_read', subject, deviceId }`를 돌려줍니다. 평소 네트워크(`usual`) 조회는 다량 조회 수에 넣지 않고, 지역 값은 판단에 쓰지 않습니다. 대상 기기는 의심 구간에서 가장 많이 나온 확인된 가상 기기 한 개입니다. 그 밖에는 `{ action: 'observe' }`입니다. 이 결과는 판정기 응답과 별개이며, 판정기의 허용·거부 응답 형식은 바꾸지 않았습니다. 회수 API는 만들지 않았고 실제 회수와 경과 시간은 반 엔진과 심판이 확인합니다.
- 10단계 복구: 메모를 만들 때, 그리고 사본이 없는 메모를 처음 고치거나 지우기 직전에 침해 전 사본(`note_backups`)을 남기고, 생성·수정·삭제·복구마다 감사 기록(`note_audit`, 본문 없이 해시만)을 덧붙입니다. 복구 경로 `POST /api/restore/notes/:id`는 사본을 다시 읽어 ID·소유자·내용 해시를 검증한 뒤 그 한 건만 되살립니다. 안전 정책 사본(`policy/safe-policy.json`)과 시험 정책(`policy/test-policy.json`)은 `npm run policy:diff`·`policy:restore`로 대조·복원합니다.
- `/data.json`은 빈 메모 배열이고 `/aleph.json`과 `X-Content-Type-Options: nosniff`를 유지합니다. 원본 자료 API 주소는 `aleph.config.json`에 기록합니다.

`supabase/step4-policy.sql`은 anon 권한을 회수하고 authenticated에 필요한 네 작업만 부여하는 제안 SQL입니다. 소유자별 RLS도 포함합니다. Supabase에는 검토·실행 후에야 적용됩니다.

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

1. `npm run policy:diff`: 침해 전에 검증한 사본(`policy/safe-policy.json`, 버전 `stage9-985f492`)을 다시 읽어 해시를 검증하고, 시험 정책과 다른 규칙만 보여 줍니다. 사본이 없거나 검증 실패면 멈춥니다. 운영 판정기 규칙 이름은 읽기만 하고 비교 결과만 적습니다.
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

실제 실행 결과는 날짜와 함께 이 표의 결과 칸에 적습니다. 로컬 연습 명령의 통과는 배포 복구나 심판 판정이 아닙니다.

## 9단계 탐지 확인 순서

1. `npm run detect:test`를 실행해 여섯 줄이 모두 `통과`인지 봅니다(정상 30건·정확히 120건·다른 사용자 각 100건·10분 밖으로 흩어진 200건은 `observe`, 10분 안 121건·200건은 `propose_revocation`).
2. `npm run decider:test`로 6·7단계 판정기 규칙이 그대로인지 봅니다.
3. 정상 결과: 평소 네트워크의 다량 조회, 지역만 다른 조회, 낯선 네트워크의 적은 조회는 `observe`이고 정상 기기는 그대로 허용됩니다.
4. 회수 제안이 나와야 할 결과: 낯선 네트워크와 10분 안 121건 이상 조회가 겹친 사용자 → `propose_revocation`·`burst_read`·대상 기기 한 개.

`npm run detect:test` 통과는 로컬 연습일 뿐이며, 운영 반 엔진의 사건 전달·접속 회수가 연결됐다는 뜻이 아닙니다.

## 8단계 구역 확인 순서

1. Supabase SQL Editor에서 `supabase/step8-zones.sql`을 검토하고 실행합니다. 마지막 결과에 `anon`·`authenticated` 권한이 비어 있어야 합니다. 실행 전에는 공지 API가 `502 announcements_unavailable`, 강사 관리 경로가 `403 instructor_only`로 닫혀 있습니다.
2. `npm run decider:test`로 6·7단계 규칙이 그대로 통과하는지 봅니다.
3. 정상 결과: 로그인한 내 메모 한 건 읽기(`GET /api/notes/:id`)는 `200`, 판정기에서는 `allow`·`zone_notes_item_only`.
4. 거부되어야 할 결과: 판정기에서 `GET /notes`(전체 목록)는 `deny`·`note_list_denied`, 공지 쓰기는 `deny`·`announcement_write_denied`, 강사 자료는 `deny`·`instructor_material_denied`, 표에 없는 서비스는 `deny`·`starter_not_ready`. API에서 다른 사람 메모 조회·수정은 `404 note_not_found`, 로그인 없는 공지·강사 자료 읽기는 `401`, 학생 계정의 공지 수정은 `403 announcement_write_denied` 또는 `403 instructor_only`.

`aleph.config.json`의 `allowedRoutes`에는 판정기가 허용하는 경로만 적습니다. 화면이 쓰는 내 메모 목록(`GET /api/notes`)과 추가(`POST /api/notes`)는 서버 API에 그대로 남아 있고, 검증된 사용자 자신의 메모만 다룹니다.

## 6단계 판정기 확인 순서

이번 단계에는 따로 설치할 접속 프로그램이 없습니다. 인증서·CA·기기 개인키를 만들거나 저장소에 넣지 않습니다. 실제 미등록 기기 공격은 심판이 맡습니다.

1. 저장소 폴더에서 `npm install`을 실행합니다.
2. `npm run decider:test`를 실행합니다.
3. 출력에 `통과 · 등록 기기의 정상 요청`(등록 기기 → `allow`)이 보이는지 확인합니다.
4. 출력에 `통과 · 미등록 기기의 가상 요청`(미등록 기기 → `deny`·`device_not_registered`)이 보이는지 확인합니다.
5. 둘 중 하나라도 `확인 필요`로 나오면 `src/decider.mjs`의 `RULE_IDS`와 `device_registered` 조건을 다시 봅니다.

`npm run decider:test`는 가상 요청 연습이며 심판 판정이 아닙니다. 

## 7단계 판정기 확인 순서

1. `npm run decider:test`를 실행해 네 줄이 모두 `통과`인지 봅니다: 등록 기기의 정상 요청(`allow`), 미등록 기기의 가상 요청(`deny`), 복합 이상 접속(`step_up`·`step_up_required`), 다시 확인한 복합 이상 접속(`allow`).
2. `npm run fixture:7`을 실행해 `정상 사건: allow`, `복합 이상 사건: step_up`이 나오는지 봅니다.
3. 거부·추가 확인되어야 할 결과: 낯선 지역·시각·네트워크 하나라도 있거나 출처가 불명확한 접속 정보는 `step_up`, 미등록 기기는 `deny`·`device_not_registered`.

재로그인 시각 계약은 `docs/DECIDER_REQUEST.md`의 `stepUp`(`verified`, `authAgeSeconds`)입니다. 판정기는 이 값으로 다시 판정만 하며, 실제 재로그인 전 자료 차단과 새 로그인 뒤 허용은 제공 엔진이 새 로그인 시각을 검증하는 환경에서만 실측할 수 있어 아직 미실행입니다. 토큰 원문은 기록하지 않습니다.

`xdr/` 폴더는 보너스 XDR 작전(무차별 로그인·웹 주입) 판정 모듈이며 `npm run xdr:run`으로 실행합니다. 판정기 규칙(`src/decider.mjs`)과는 별개입니다.

`src/attack-check.mjs`의 결과는 학생의 자기 점검일 뿐 운영 심판 판정이 아닙니다. 옛 공개 커밋·배포 이력은 남아 있으며 과거 노출이 해소됐다고 보지 않습니다.
