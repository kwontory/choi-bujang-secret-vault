# 6~9단계 확인 순서

README 의 10·11단계 확인 순서와 재시험 표에서 이어지는 단계별 확인 방법입니다.

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

## 7단계 판정기 확인 순서

1. `npm run decider:test`를 실행해 네 줄이 모두 `통과`인지 봅니다: 등록 기기의 정상 요청(`allow`), 미등록 기기의 가상 요청(`deny`), 복합 이상 접속(`step_up`·`step_up_required`), 다시 확인한 복합 이상 접속(`allow`).
2. `npm run fixture:7`을 실행해 `정상 사건: allow`, `복합 이상 사건: step_up`이 나오는지 봅니다.
3. 거부·추가 확인되어야 할 결과: 낯선 지역·시각·네트워크 하나라도 있거나 출처가 불명확한 접속 정보는 `step_up`, 미등록 기기는 `deny`·`device_not_registered`.

재로그인 시각 계약은 `docs/DECIDER_REQUEST.md`의 `stepUp`(`verified`, `authAgeSeconds`)입니다. 판정기는 이 값으로 다시 판정만 하며, 실제 재로그인 전 자료 차단과 새 로그인 뒤 허용은 제공 엔진이 새 로그인 시각을 검증하는 환경에서만 실측할 수 있어 아직 미실행입니다. 토큰 원문은 기록하지 않습니다.

`xdr/` 폴더는 보너스 XDR 작전(무차별 로그인·웹 주입) 판정 모듈이며 `npm run xdr:run`으로 실행합니다. 판정기 규칙(`src/decider.mjs`)과는 별개입니다.

`src/attack-check.mjs`의 결과는 학생의 자기 점검일 뿐 운영 심판 판정이 아닙니다. 옛 공개 커밋·배포 이력은 남아 있으며 과거 노출이 해소됐다고 보지 않습니다.
## 6단계 판정기 확인 순서

이번 단계에는 따로 설치할 접속 프로그램이 없습니다. 인증서·CA·기기 개인키를 만들거나 저장소에 넣지 않습니다. 실제 미등록 기기 공격은 심판이 맡습니다.

1. 저장소 폴더에서 `npm install`을 실행합니다.
2. `npm run decider:test`를 실행합니다.
3. 출력에 `통과 · 등록 기기의 정상 요청`(등록 기기 → `allow`)이 보이는지 확인합니다.
4. 출력에 `통과 · 미등록 기기의 가상 요청`(미등록 기기 → `deny`·`device_not_registered`)이 보이는지 확인합니다.
5. 둘 중 하나라도 `확인 필요`로 나오면 `src/decider.mjs`의 `RULE_IDS`와 `device_registered` 조건을 다시 봅니다.

`npm run decider:test`는 가상 요청 연습이며 심판 판정이 아닙니다. 

