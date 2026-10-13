# 설치형 앱(접속 앱) 서명 규약 · 11단계

배포 주소 `/`는 설치형 웹앱입니다(`/manifest.webmanifest`, 앱 이름 「BYTE BACK 접속 앱」, 아이콘 192·512 PNG, 오프라인 안내 `/offline.html`, 서비스 워커 `/sw.js`). 설치 여부는 기기 확인에 쓰지 않습니다. 11단계부터 **보호 요청(`/api/notes`, `/api/notes/:id`)은 서버가 승인한 기기의 앱 서명이 있어야** 합니다.

## 1. 기기 키

- 기기마다 P-256 ECDSA 키 쌍을 **메모리에서만** 만듭니다(개인키는 내보낼 수 없음). 브라우저 저장소·파일·Git·제출물에 넣지 않습니다.
- 기기 ID = `sha256("P-256." + x + "." + y)`의 앞 16자리 소문자 16진수(`x`, `y`는 공개 키 JWK 값).

## 2. 승인 요청과 상태 확인 (승인은 서버와 판정기가 정함)

모두 `Authorization: Bearer <로그인 토큰>`과 JSON 본문 `{ publicKey: {kty, crv, x, y}, timestamp, signature }`를 보냅니다.
`signature` = 기기 개인키로 `aleph-device-v1|<action>|<deviceId>|<timestamp>`를 ECDSA P-256/SHA-256 서명한 값(IEEE P1363, base64url). `timestamp`는 밀리초, 서버 시각과 2분 이내.

| 경로 | action | 서버가 하는 일 | 응답 |
|---|---|---|---|
| `POST /api/device/register` | `register` | 로그인 검증 → 서명 증명 확인 → 회수 기록 확인 → `decide()`에 `deviceRegistered: true`로 물어 `allow`일 때만 승인 | `200 { approved: true, grant, deviceId }` / `401 login_required`·`device_proof_invalid` / `403 device_revoked` |
| `POST /api/device/status` | `status` | 위 확인 + 본문의 `grant`가 이 사용자·기기·공개 키의 것인지 | `200 { approved, status, decision, reasonCode }` |

브라우저가 보낸 `approved`·`status`·`deviceRegistered`·`grant`(등록 요청 시)·`role`은 `400`으로 거부합니다. `grant`는 서버 비밀 키로 서명한 12시간짜리 승인 증표이며 메모리에만 둡니다.

## 3. 보호 요청 서명

머리글 네 개를 붙입니다.

```
X-Aleph-Device:    <deviceId>
X-Aleph-Timestamp: <밀리초>
X-Aleph-Grant:     <register 응답의 grant>
X-Aleph-Signature: base64url(ECDSA-P256-SHA256(개인키,
                   "aleph-request-v1|<METHOD>|<경로>|<sha256hex(본문 JSON 문자열, 없으면 빈 문자열)>|<timestamp>|<deviceId>"))
```

`<경로>`는 쿼리 없는 실제 경로입니다(예: `/api/notes`, `/api/notes/<id>`).

| 요청 | 결과 |
|---|---|
| 승인된 기기의 올바른 서명 요청 | 기존과 같은 정상 결과(`200`·`201`, 다른 소유자 ID 는 `404`) |
| 설치형 앱 서명 없이 보호 요청 | `403 device_signature_required` |
| 서명 뒤 요청 경로 변경 | `401 device_signature_invalid` |
| 서명 뒤 수정 본문 변경 | `401 device_signature_invalid` |
| 위조·다른 사용자·만료 증표, 승인 안 된 기기 | `401 device_not_registered` |
| 회수된 기기 | `401 device_revoked` |
| 토큰 없음 | `401 login_required` |

## 4. 그대로 따라 해 보는 명령

```
APP_TOKEN=<로그인 토큰> node scripts/app-client.mjs check
```

`scripts/app-client.mjs`는 위 규약대로 메모리 기기 키를 만들어 승인받고, 정상 요청과 세 가지 공격(서명 없음·서명 뒤 경로 변경·서명 뒤 본문 변경), 위조 증표를 차례로 보내 기대·실제 결과를 한 줄씩 출력합니다. 토큰·키·메모 본문은 출력하지 않습니다. 배포 주소는 `APP_URL`로 바꿀 수 있고, 없으면 `aleph.config.json`의 `publicAppUrl`을 씁니다. 로컬 연습(인터넷 불필요)은 `npm run device:test`입니다.
