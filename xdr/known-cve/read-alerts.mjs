// 제작 1 · 경보 읽기 — xdr/fixtures/known-cve.json 에서 시각·출발 주소·계정·규칙 수준·설명만 뽑습니다.
// 확인용 모듈입니다. decide.mjs 는 이 파일을 불러오지 않습니다. 원본 경보는 고치지 않습니다.
// 머리글(useragent)·주소(url)에 든 원격 조회 구문은 뽑지 않습니다(문서용 표기를 다른 곳에 퍼뜨리지 않음).
import { readFile } from 'node:fs/promises';

// 비밀값처럼 보이는 값(토큰·키·비밀번호 표기, 긴 무작위 문자열)은 가립니다.
const SECRET_LIKE = /(token|secret|passw(or)?d|api[_-]?key|bearer|authorization)\s*[:=]\s*\S+|[A-Za-z0-9+/_-]{32,}/gi;
function safe(value) {
  return String(value ?? '').replace(SECRET_LIKE, '[가림]');
}

export async function readAlerts(root = new URL('../../', import.meta.url)) {
  const path = new URL('xdr/fixtures/known-cve.json', root);
  const fixture = JSON.parse(await readFile(path, 'utf8'));
  return (fixture.alerts ?? []).map((a) => ({
    id: safe(a.id),
    at: safe(a.timestamp),
    srcip: safe(a.data?.srcip),
    user: safe(a.data?.srcuser ?? a.data?.dstuser ?? '-'),
    level: Number(a.rule?.level ?? 0),
    description: safe(a.rule?.description),
  }));
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('read-alerts.mjs')) {
  readAlerts().then((rows) => {
    for (const r of rows) console.log(`${r.id}\t${r.at}\t${r.srcip}\t${r.user}\t레벨${r.level}\t${r.description}`);
    console.error(`경보 ${rows.length}건 / 뽑은 줄 ${rows.length}줄`);
  });
}
