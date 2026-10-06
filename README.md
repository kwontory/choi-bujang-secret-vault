# BYTE BACK 방어전 · 3단계 저장점

Supabase Auth 이메일·비밀번호 로그인과 로그아웃을 붙이고, 서버가 제공된 `src/verify-login.mjs`로 토큰을 확인한 뒤에만 가상 메모 API를 사용하도록 바꿨습니다. 비밀번호, JWT, 서버 전용 키는 저장소·응답·로그에 넣지 않습니다.

## 현재 작동하는 기능

- `/`에서 이메일·비밀번호로 로그인하고 로그아웃할 수 있으며 실패 이유를 화면에 표시합니다.
- 토큰 없는 `/api/notes` 요청은 `401`과 JSON 오류로 거부됩니다.
- 로그인 사용자는 가상 메모 목록을 보고 추가·수정·삭제할 수 있습니다.
- 서버는 브라우저가 보낸 사용자 ID나 역할을 믿지 않고, 검증된 토큰의 사용자 ID를 새 메모의 `owner_id`로 저장합니다.
- `/data.json`은 빈 메모 배열이고 `/aleph.json`과 `X-Content-Type-Options: nosniff`를 유지합니다.

3단계는 로그인 여부만 확인합니다. 한 건 조회·수정·삭제에는 아직 소유자 조건을 적용하지 않았으므로 다른 로그인 사용자의 메모 접근 가능성은 4단계에서 막습니다.

## 다시 실행하기

1. Supabase SQL Editor에서 `supabase/step3.sql`을 실행해 메모 ID를 UUID로 바꿉니다.
2. Supabase Authentication에서 이메일·비밀번호 로그인을 사용하고 실습용 계정을 준비합니다.
3. Vercel 환경변수 `SUPABASE_URL`, `SUPABASE_SECRET_KEY`를 유지한 채 재배포합니다.
4. 로컬 검증은 `npm run build -- --local && npm run test:step3`로 실행합니다.

## 확인 절차

- 로그아웃 상태에서 `/api/notes`가 `401` JSON 오류를 반환하는지 확인합니다.
- 실습용 A 계정으로 로그인해 가상 메모를 추가·수정·삭제하고 로그아웃 뒤 화면이 잠기는지 확인합니다.
- 브라우저 파일과 응답에 `SUPABASE_SECRET_KEY` 또는 서버 비밀키가 없는지 확인합니다.
- `npm run test:step3`으로 발급자 정보, 실제 CRUD 경로, 공식 로그인 흐름, 서버 토큰 검증기 사용을 확인합니다.

`src/attack-check.mjs`의 결과는 학생의 자기 점검일 뿐 운영 심판 판정이 아닙니다. 옛 공개 커밋·배포 이력은 남아 있으며 과거 노출이 해소됐다고 보지 않습니다.
