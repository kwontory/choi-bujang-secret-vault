// 제작 1 · 경보 읽기 — xdr/fixtures/web-injection.json 에서 필요한 필드만 뽑습니다.
import { readFile } from 'node:fs/promises';

export async function readAlerts(root = new URL('../../', import.meta.url)) {
  const path = new URL('xdr/fixtures/web-injection.json', root);
  const fixture = JSON.parse(await readFile(path, 'utf8'));
  return (fixture.alerts ?? []).map((a) => ({
    id: a.id,
    at: a.timestamp,
    srcip: a.data?.srcip ?? '',
    url: a.data?.url ?? '',
    level: a.rule?.level ?? 0,
    description: a.rule?.description ?? '',
  }));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  readAlerts().then((rows) => {
    for (const r of rows) console.log(`${r.id}\t레벨${r.level}\t${r.srcip}\t${r.url}\t${r.description}`);
    console.error(`경보 ${rows.length}건 / 뽑은 줄 ${rows.length}줄`);
  });
}
