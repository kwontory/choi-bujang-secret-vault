# BYTE BACK 방어전 · 4단계 저장점

Supabase Auth 로그인과 서버 토큰 검증을 유지하면서, 메모 API의 모든 읽기·추가·수정·삭제를 검증된 소유자에게만 허용합니다. 비밀번호, JWT, 서버 전용 키는 저장소·응답·로그에 넣지 않습니다.

## 현재 작동하는 기능

- `/`에서 이메일·비밀번호로 로그인하고 로그아웃할 수 있으며 실패 이유를 화면에 표시합니다.
- 토큰 없는 `/api/notes` 요청은 `401`과 JSON 오류로 거부됩니다.
- 로그인 사용자는 자기 가상 메모만 목록·한 건 조회·추가·수정·삭제할 수 있습니다. 다른 소유자의 ID로 요청하면 `404`를 반환합니다.
- 서버는 브라우저가 보낸 소유자 ID를 거부하고, 검증된 토큰의 사용자 ID를 새 메모의 `owner_id`로 저장합니다. 수정과 삭제는 ID와 검증된 소유자를 함께 조건으로 사용합니다.
- `/data.json`은 빈 메모 배열이고 `/aleph.json`과 `X-Content-Type-Options: nosniff`를 유지합니다.

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

`src/attack-check.mjs`의 결과는 학생의 자기 점검일 뿐 운영 심판 판정이 아닙니다. 옛 공개 커밋·배포 이력은 남아 있으며 과거 노출이 해소됐다고 보지 않습니다.
