import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { deploymentIdentity } from './deployment-identity.mjs';
import { iconPng } from './app-icons.mjs';

const root = resolve(import.meta.dirname, '..');
const output = resolve(root, 'public', 'data.json');
const config = JSON.parse(await readFile(resolve(root, 'aleph.config.json'), 'utf8'));
if (!Number.isInteger(config.step) || config.step < 5 || config.step > 12) throw new Error('5단계 이상 12단계 이하 설정을 확인하세요.');
await mkdir(resolve(root, 'public'), { recursive: true });
await writeFile(output, '{\n  "notes": []\n}\n', 'utf8');
console.log('공개 data.json에서 가상 메모를 제거했습니다.');
for (const size of [192, 512]) await writeFile(resolve(root, 'public', `icon-${size}.png`), iconPng(size));
console.log('설치형 웹앱 아이콘(icon-192.png, icon-512.png)을 만들었습니다.');
// Vercel 빌드(VERCEL=1)에서만 배포 식별 정보를 씁니다. 저장소를 새로 받아 로컬·격리 환경에서
// npm run build 를 실행하면 Vercel 정보가 없으므로 aleph.json 쓰기만 건너뛰고 빌드는 끝냅니다.
if (!process.argv.includes('--local') && process.env.VERCEL !== '1') {
  console.log('Vercel 빌드 환경이 아니어서 public/aleph.json 은 만들지 않았습니다.');
} else if (!process.argv.includes('--local')) {
  const identity = deploymentIdentity(process.env, config);
  await writeFile(resolve(root, 'public', 'aleph.json'),
    `${JSON.stringify(identity, null, 2)}\n`, 'utf8');
  console.log('배포 저장소·커밋·주소를 public/aleph.json에 기록했습니다.');
}
