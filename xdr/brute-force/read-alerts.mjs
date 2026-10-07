// 제작 1 · 경보 읽기 — xdr/fixtures/brute-force.json 에서 필요한 필드만 뽑습니다.
// 원본 경보는 고치지 않고, 비밀값처럼 보이는 값은 담지 않습니다.
import { readFile } from 'node:fs/promises';

export async function readAlerts(root = new URL('../../', import.meta.url)) {
  const path = new URL('xdr/fixtures/brute-force.json', root);
  const fixture = JSON.parse(await readFile(path, 'utf8'));
  return (fixture.alerts ?? []).map((a) => ({
    id: a.id,
    at: a.timestamp,
    srcip: a.data?.srcip ?? '',
    account: a.data?.srcuser ?? '',
    level: a.rule?.level ?? 0,
    description: a.rule?.description ?? '',
  }));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  readAlerts().then((rows) => {
    for (const r of rows) console.log(`${r.id}\t레벨${r.level}\t${r.srcip}\t${r.account}\t${r.description}`);
    console.error(`경보 ${rows.length}건 / 뽑은 줄 ${rows.length}줄`);
  });
}
