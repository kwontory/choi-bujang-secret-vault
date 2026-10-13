# 검문소·탐지 규칙

실제로 구현한 규칙만 아래 표에 추가하세요. 규칙 이름, 단계, 어떤 요청을 막는지, 확인한 방법을 함께 적으세요.

| 규칙 | 단계 | 막는 공격 | 확인 방법 |
|---|---|---|---|
| `device_registered` | 6 | 미등록 기기·기기 ID 형식이 틀린 요청의 자료실 읽기 (`deny`·`device_not_registered`) | `npm run decider:test` 등록 기기 통과·미등록 기기 거부 |
| `step_up_required` | 7 | 평소와 다른 지역·시각·네트워크·대량 행동, 출처가 불명확한 접속 정보 (`step_up`·`step_up_required`) | `npm run decider:test` 복합 이상 접속 추가 확인·다시 확인 뒤 허용, `npm run fixture:7` |
| `zone_notes_item_only` | 8 | 메모 전체 목록·ID 없는 메모 경로(`note_list_denied`), 표에 없는 메모 기능 경로·쿼리 요청(`route_not_allowed`) | 판정기 가상 요청 `GET /notes` 거부, `GET /notes/:id` 허용 |
| `zone_announcements_read_only` | 8 | 반 공지 쓰기 POST·PUT·PATCH·DELETE (`deny`·`announcement_write_denied`), API에서도 `403 announcement_write_denied` | 판정기 가상 요청 `PUT /announcements/:id` 거부, 비로그인 `/api/announcements` `401` |
| `zone_instructor_materials_closed` | 8 | 강사 자료 구역의 모든 동작 (`deny`·`instructor_material_denied`), API에서도 `403` | 판정기 가상 요청 `materials` 서비스 거부 |
| `detect.burst_read` (탐지 규칙, `src/detect.mjs`) | 9 | 낯선 네트워크 + 10분 안 121건 이상 조회한 가상 도플갱어 → `propose_revocation`·`burst_read`·대상 기기 한 개 (판정기 응답과 별개) | `npm run detect:test` 여섯 사례, 평소 네트워크 다량 조회는 `observe` |
| `api.restore.verified_backup_only` (`api/restore.js`) | 10 | 사본이 없거나 검증 실패한 복구(`404`·`409`), 다른 사람 메모 복구(`404`), 감사 기록 없이 하는 복구(`503`) | `npm run restore:test` 아홉 사례 |
| `policy.safe_copy_restore` (`scripts/policy.mjs`) | 10 | 검증 안 된 사본으로 정책 되돌리기, 확인 없는 복원 | `npm run policy:test` 여섯 사례 |
| `request_integrity` | 11 | 메서드·경로 모양·실제 경로가 서로 맞지 않는 요청(서명 뒤 경로·메서드 변경) (`deny`·`request_tampered`) | 판정기 가상 요청 경로·메서드 변경 사례 |
| `api.device_signature` (`api/notes.js`, `api/device/*`) | 11 | 설치형 앱 서명 없는 보호 요청(`403`), 서명 뒤 경로·본문 변경·위조 증표·승인 안 된·회수된 기기(`401`), 브라우저가 보낸 승인 값(`400`) | `npm run device:test` 12가지 |
| `zone_my_notes_owner_list` | 11 | 내 메모 목록 외 목록 요청(전체 목록 `GET /api/notes`와 구분), 주인 비교는 API | `npm run routes:test` |
| `zone_restore_verified_backup` | 11 | 복구 경로 밖의 복구 요청 | `npm run routes:test` |
| `zone_device_approval` | 11 | 승인 요청·상태 확인 밖의 기기 경로 | `npm run routes:test` |
| `api.global_guard` (`src/api-guard.mjs`) | 11 | 모든 보호 API: 앱 서명·서버 승인 기기 확인 후 판정기 결정을 그대로 따름(선언 밖 경로 `403`) | `npm run routes:test`, `npm run device:test` |
| `starter.deny` | 시작 | 구역표에 없는 서비스·경로 (`deny`·`starter_not_ready`) | 판정기 가상 요청 알 수 없는 서비스 거부 |

서버 API 확인: `api/notes.js`는 검증된 사용자 ID와 저장된 `owner_id`를 함께 조건으로 쓰고(다른 사람 메모는 `404`), `api/admin/announcements.js`는 저장된 강사 권한표(`class_instructors`)만 보고 공지 수정을 허용합니다(그 밖은 `403 instructor_only`).

브라우저에서 버튼을 숨기는 것만으로 서버 접근이 차단됐다고 적지 마세요.
