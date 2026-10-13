# 검문소·탐지 규칙

실제로 구현한 규칙만 아래 표에 추가하세요. 규칙 이름, 단계, 어떤 요청을 막는지, 확인한 방법을 함께 적으세요.

| 규칙 | 단계 | 막는 공격 | 확인 방법 |
|---|---|---|---|
| `device_registered` | 6 | 미등록 기기·기기 ID 형식이 틀린 요청의 자료실 읽기 (`deny`·`device_not_registered`) | `npm run decider:test` 등록 기기 통과·미등록 기기 거부 |
| `step_up_required` | 7 | 평소와 다른 지역·시각·네트워크·대량 행동, 출처가 불명확한 접속 정보 (`step_up`·`step_up_required`) | `npm run decider:test` 복합 이상 접속 추가 확인·다시 확인 뒤 허용, `npm run fixture:7` |
| `starter.deny` | 시작 | 위 규칙으로 허용되지 않은 나머지 요청 (`deny`·`starter_not_ready`) | 쓰기 요청 가상 입력 |

브라우저에서 버튼을 숨기는 것만으로 서버 접근이 차단됐다고 적지 마세요.
