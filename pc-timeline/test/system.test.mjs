// 실측 값 계산과, 읽지 못했을 때 0이나 예시 값 대신 '확인 불가'가 나오는지 확인합니다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readCpu, readMemory, readDisk, defaultDiskPath } from '../probe/system.mjs';

const fixedNow = () => new Date('2026-10-27T05:00:00.000Z');
const noWait = async () => {};
const cpu = (user, idle) => ({ times: { user, nice: 0, sys: 0, idle, irq: 0 } });

test('CPU: 두 번 잰 차이로 사용률을 계산한다', async () => {
  const samples = [[cpu(100, 900)], [cpu(130, 970)]];
  const r = await readCpu({ cpus: () => samples.shift(), wait: noWait, now: fixedNow });
  assert.equal(r.status, 'measured');
  assert.equal(r.value, 30);
  assert.equal(r.unit, '%');
  assert.equal(r.measuredAt, '2026-10-27T05:00:00.000Z');
});

test('CPU: 빈 목록이면 확인 불가이고 값이 없다', async () => {
  const r = await readCpu({ cpus: () => [], wait: noWait, now: fixedNow });
  assert.equal(r.status, 'unavailable');
  assert.equal(r.value, undefined);
  assert.match(r.reason, /읽지 못했습니다/);
});

test('CPU: 시간 변화가 없으면 0%로 꾸미지 않고 확인 불가', async () => {
  const same = [cpu(100, 900)];
  const r = await readCpu({ cpus: () => same, wait: noWait, now: fixedNow });
  assert.equal(r.status, 'unavailable');
  assert.equal(r.value, undefined);
});

test('CPU: 읽는 중 오류가 나면 오류 코드만 남긴다', async () => {
  const r = await readCpu({ cpus: () => { throw Object.assign(new Error('C:\\Users\\secret'), { code: 'EPERM' }); }, wait: noWait, now: fixedNow });
  assert.equal(r.status, 'unavailable');
  assert.match(r.reason, /EPERM/);
  assert.doesNotMatch(r.reason, /secret/);
});

test('메모리: 사용률과 주의 기준', async () => {
  const GB = 1024 ** 3;
  const ok = await readMemory({ totalmem: () => 16 * GB, freemem: () => 8 * GB, now: fixedNow });
  assert.deepEqual([ok.status, ok.value, ok.level], ['measured', 50, 'ok']);
  const warn = await readMemory({ totalmem: () => 10 * GB, freemem: () => 0.5 * GB, now: fixedNow });
  assert.deepEqual([warn.value, warn.level], [95, 'warn']);
});

test('메모리: 값이 이상하면 확인 불가', async () => {
  const r = await readMemory({ totalmem: () => 0, freemem: () => 0, now: fixedNow });
  assert.equal(r.status, 'unavailable');
  assert.equal(r.value, undefined);
});

test('디스크: 남은 공간 비율과 주의 기준', async () => {
  const r = await readDisk({ path: 'C:\\', statfs: async () => ({ blocks: 1000, bavail: 50, bsize: 4096 }), now: fixedNow });
  assert.deepEqual([r.status, r.value, r.level, r.target], ['measured', 5, 'warn', 'C:']);
});

test('디스크: 읽지 못하면 확인 불가와 이유', async () => {
  const r = await readDisk({ path: 'C:\\', statfs: async () => { throw Object.assign(new Error('x'), { code: 'EACCES' }); }, now: fixedNow });
  assert.equal(r.status, 'unavailable');
  assert.equal(r.value, undefined);
  assert.match(r.reason, /EACCES/);
});

test('디스크 경로: Windows 시스템 드라이브를 쓴다', () => {
  assert.equal(defaultDiskPath('win32', { SystemDrive: 'D:' }), 'D:\\');
  assert.equal(defaultDiskPath('win32', { SystemDrive: '../x' }), 'C:\\');
  assert.equal(defaultDiskPath('linux', {}), '/');
});
