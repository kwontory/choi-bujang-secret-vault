# 단계별 기능 상세 (1~11단계)

README 의 요약을 자세히 적은 문서입니다.

## 현재 작동하는 기능(상세)

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
- 11단계 접속 앱: `/`는 설치형 웹앱 설정(`/manifest.webmanifest`, 앱 이름 「BYTE BACK 접속 앱」, 텍스트 SVG 아이콘 `/icon.svg`)과 오프라인 안내(`/offline.html`, 서비스 워커 `/sw.js`는 안내 화면만 보관하고 API 응답·토큰·키는 저장하지 않음)를 갖췄습니다. 첫 화면부터 「이 기기 승인」 상태(`미승인`)와 승인 안내가 보이고, 로그인 뒤 서버가 이 기기를 승인된 기기로 확인하고 판정기가 `allow`할 때만 메모 자료실을 열고 메모를 불러옵니다. 승인 전에는 메모 요청 자체를 보내지 않습니다.
- 기기 키는 화면 메모리에서만 만드는 내보낼 수 없는 P-256 키이며, 로그인 토큰·서버 승인 증표와 함께 브라우저 저장소(localStorage·sessionStorage·IndexedDB)·코드·Git·제출물에 넣지 않습니다. 새로고침하면 새 기기 키로 다시 승인받습니다.
- 승인 흐름(승인 여부는 서버와 판정기가 정함): 로그인하면 화면이 `POST /api/device/register`로 승인을 요청합니다(「기기 승인 요청」 버튼도 같은 요청만 보냄). 서버는 ① 검증된 로그인 사용자 ② 그 기기의 개인키 서명 증명 ③ 회수 기록 없음을 확인해 등록 기기로 정하고, `src/decider.mjs`의 `decide()`에 `deviceRegistered: true`로 물어 `allow`일 때만 승인 증표(서버 비밀 키로 서명, 12시간)를 내줍니다. 화면은 `POST /api/device/status`로 다시 확인해 `approved: true`·`decision: allow`일 때만 기존 자료실을 엽니다. 설치 표시(`display-mode`)는 참고로만 보여 주고 판단에 쓰지 않으며, 브라우저가 보낸 `status`·`approved`·`deviceRegistered`·`grant`·`role`은 `400`으로 거부합니다. 회수는 `PUT /api/admin/devices/:id`(저장된 강사 권한표의 사용자만) 또는 Supabase(`supabase/step11-devices.sql`)로 합니다.
- 접속 앱의 보호 요청에는 기기 서명 머리글(`X-Aleph-Device`, `X-Aleph-Timestamp`, `X-Aleph-Grant`, `X-Aleph-Signature`)이 붙고, 서명 문장에 메서드·경로·본문 해시·시각이 들어갑니다. `api/notes.js`는 접속 앱(브라우저)에서 온 서명 없는 보호 요청을 `403 device_signature_required`로, 서명 뒤 경로·본문을 바꾼 요청·위조 증표·승인 안 된 기기·회수된 기기를 `401`로 거부합니다. 판정기에는 `request_integrity` 규칙을 더해 메서드·경로 모양·실제 경로가 서로 맞지 않는 요청을 `deny`·`request_tampered`로 거부합니다(`/api/notes/:id` 모양도 같은 자원으로 읽음).
- `/data.json`은 빈 메모 배열이고 `/aleph.json`과 `X-Content-Type-Options: nosniff`를 유지합니다. 원본 자료 API 주소는 `aleph.config.json`에 기록합니다.

`supabase/step4-policy.sql`은 anon 권한을 회수하고 authenticated에 필요한 네 작업만 부여하는 제안 SQL입니다. 소유자별 RLS도 포함합니다. Supabase에는 검토·실행 후에야 적용됩니다.

