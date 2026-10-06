# BYTE BACK 방어전 · 2단계 저장점

정적 파일과 최신 GitHub 버전에서 가상 메모를 제거하고, Vercel 서버 함수가 학습용 Supabase 테이블을 읽도록 바꿨습니다. 실제 학생 자료, 토큰, 비밀키는 저장소나 응답에 넣지 않습니다.

## 현재 작동하는 기능

- `/`는 `/api/notes`를 호출해 학습용 가상 메모 카드를 표시합니다.
- `/data.json`은 `notes: []`만 반환해 정적 메모를 노출하지 않습니다.
- `/api/notes`는 `SUPABASE_URL`과 서버 전용 `SUPABASE_SECRET_KEY`만 환경변수에서 읽습니다.
- `public/aleph.json`은 배포 빌드에서 계속 자동 생성됩니다.
- 모든 응답에 `X-Content-Type-Options: nosniff` 헤더를 붙입니다.

현재 `/api/notes`는 인증 전 단계라 주소를 아는 누구나 호출할 수 있습니다. 3단계에서 로그인을 붙이기 전까지는 가상 자료만 유지합니다.

## 다시 실행하기

1. Supabase SQL Editor에서 `supabase/step2.sql`을 실행합니다.
2. 테이블에 가상 메모 네 건을 넣되 실제 개인정보나 비밀값은 넣지 않습니다.
3. Vercel 프로젝트 환경변수에 `SUPABASE_URL`, `SUPABASE_SECRET_KEY`를 입력하고 재배포합니다.
4. 로컬 검증은 `npm run build -- --local && npm run test:step2`로 실행합니다.

## 공개 이력의 한계

현재 정적 파일과 최신 커밋에서 메모를 제거해도 1단계의 공개 커밋과 과거 배포 이력은 남습니다. 과거 노출이 해소됐다고 보지 않으며, 이후 단계에서도 실제 자료나 비밀값을 넣지 않습니다.

## 확인 절차

- `npm run build -- --local` 후 `public/data.json`이 빈 배열인지 확인합니다.
- `npm run test:step2`로 정적 메모 제거, 서버 API 경로, 배포 식별 정보, 보안 헤더를 확인합니다.
- 배포 뒤 `/`, `/data.json`, `/aleph.json`, `/api/notes`를 확인합니다.
- 저장소에서 과거 가상 메모 문장을 검색해 최신 파일에 남지 않았는지 확인합니다.

`src/attack-check.mjs`의 결과는 학생의 자기 점검일 뿐 운영 심판 판정이 아닙니다. 배포 후 정적 메모 차단과 2단계 공개 API의 남은 약점을 각각 기록합니다.
