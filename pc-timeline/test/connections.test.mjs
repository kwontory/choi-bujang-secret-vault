// 3일차: 네트워크·방화벽·Windows 기록·SDP 상태가 읽기만 하고, 못 읽으면 확인 불가로 남는지 확인합니다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readNetwork, classifyIPv4 } from '../probe/network.mjs';
import { toFirewallItem, toEventItem, runReadScript, READ_SCRIPT } from '../probe/windows.mjs';
import { readSdp } from '../probe/sdp.mjs';

const T = '2026-10-27T05:00:00.000Z';
const now = () => new Date(T);

test('IPv4 분류', () => {
  assert.equal(classifyIPv4('192.168.0.5'), 'private');
  assert.equal(classifyIPv4('172.20.1.1'), 'private');
  assert.equal(classifyIPv4('169.254.3.4'), 'link-local');
  assert.equal(classifyIPv4('8.8.8.8'), 'public');
  assert.equal(classifyIPv4('999.1.1.1'), 'invalid');
});

test('네트워크: 주소는 내보내지 않고 연결 상태만', () => {
  const r = readNetwork({ now, networkInterfaces: () => ({ 'Wi-Fi': [{ family: 'IPv4', address: '192.168.0.5', internal: false }], Loopback: [{ family: 'IPv4', address: '127.0.0.1', internal: true }] }) });
  assert.deepEqual([r.status, r.level, r.display], ['measured', 'ok', '어댑터 1개']);
  assert.doesNotMatch(JSON.stringify(r), /192\.168\.0\.5/);
});

test('네트워크: 자동 할당 주소뿐이면 주의', () => {
  const r = readNetwork({ now, networkInterfaces: () => ({ 이더넷: [{ family: 'IPv4', address: '169.254.1.2', internal: false }] }) });
  assert.equal(r.level, 'warn');
});

test('네트워크: 읽다가 오류면 확인 불가', () => {
  const r = readNetwork({ now, networkInterfaces: () => { throw Object.assign(new Error('x'), { code: 'EPERM' }); } });
  assert.equal(r.status, 'unavailable');
});

const run = data => ({ ok: true, data });

test('방화벽: 모두 켜짐', () => {
  const r = toFirewallItem(run({ firewall: [{ name: 'Domain', enabled: 'True' }, { name: 'Private', enabled: 'True' }, { name: 'Public', enabled: 'True' }] }), T);
  assert.deepEqual([r.status, r.level, r.display], ['measured', 'ok', '켜짐 3/3']);
});

test('방화벽: 하나라도 꺼짐이면 주의, 한 개 프로필도 배열로 처리', () => {
  assert.equal(toFirewallItem(run({ firewall: [{ name: 'Public', enabled: 'False' }, { name: 'Private', enabled: 'True' }] }), T).level, 'warn');
  assert.equal(toFirewallItem(run({ firewall: { name: 'Public', enabled: 'True' } }), T).display, '켜짐 1/1');
});

test('방화벽: 권한 오류나 실행 실패는 확인 불가', () => {
  assert.equal(toFirewallItem(run({ firewallError: 'CimException,Get-NetFirewallProfile' }), T).status, 'unavailable');
  assert.equal(toFirewallItem({ ok: false, code: 'TIMEOUT', message: '15초 안에 결과를 받지 못했습니다.' }, T).status, 'unavailable');
});

test('이벤트: 건수는 참고이며 침해 판정이 아니라고 적는다', () => {
  const r = toEventItem(run({ events: { System: { ok: true, error: 2, warning: 5 } } }), 'System', T);
  assert.deepEqual([r.status, r.level, r.display], ['measured', 'info', '오류 2 · 경고 5']);
  assert.match(r.note, /침해나 공격 탐지 결과가 아닙니다/);
});

test('이벤트: 못 읽으면 0건으로 꾸미지 않는다', () => {
  const r = toEventItem(run({ events: { Application: { ok: false, code: 'UnauthorizedAccess,x' } } }), 'Application', T);
  assert.equal(r.status, 'unavailable');
  assert.equal(r.display, undefined);
});

test('읽기 스크립트에 설정 변경 명령이 없다', () => {
  assert.doesNotMatch(READ_SCRIPT, /\b(Set|New|Remove|Enable|Disable|Clear|Stop|Start)-\w+/);
  assert.match(READ_SCRIPT, /Get-NetFirewallProfile/);
});

test('Windows가 아니면 실행하지 않는다', async () => {
  const r = await runReadScript({ platform: 'linux' });
  assert.deepEqual([r.ok, r.code], [false, 'NOT_WINDOWS']);
});

test('PowerShell은 셸 없이 고정 인자로 실행하고, 시간이 넘으면 중단한다', async () => {
  let seen;
  const child = Object.assign(new EventEmitter(), { stdout: new EventEmitter(), stderr: new EventEmitter(), killed: false, kill() { this.killed = true; } });
  const r = await runReadScript({ platform: 'win32', timeoutMs: 20, spawnFn: (cmd, args, opts) => { seen = { cmd, args, opts }; return child; } });
  assert.equal(seen.opts.shell, false);
  assert.ok(seen.args.includes('-EncodedCommand'));
  assert.equal(r.code, 'TIMEOUT');
  assert.equal(child.killed, true);
});

test('SDP: 케셰브가 연결 없음이면 SDP 미연결', async () => {
  const r = await readSdp({ now, fetchFn: async () => ({ json: async () => ({ ok: false, error: { code: 'ENGINE_NOT_CONNECTED' }, meta: { mode: 'disconnected' } }) }) });
  assert.deepEqual([r.status, r.display], ['measured', 'SDP 미연결']);
});

test('SDP: 연결됨과 예제 모드를 구분', async () => {
  const c = await readSdp({ now, fetchFn: async () => ({ json: async () => ({ ok: true, meta: { mode: 'connected' } }) }) });
  const d = await readSdp({ now, fetchFn: async () => ({ json: async () => ({ ok: true, meta: { mode: 'demo' } }) }) });
  assert.equal(c.display, 'SDP 연결됨');
  assert.equal(d.display, '예제 모드');
});

test('SDP: 케셰브가 꺼져 있으면 미연결로 단정하지 않고 확인 불가', async () => {
  const r = await readSdp({ now, fetchFn: async () => { throw new TypeError('fetch failed'); } });
  assert.equal(r.status, 'unavailable');
  assert.match(r.reason, /확인하지 못했습니다/);
});

test('SDP: 케셰브가 아닌 응답이면 형식 문제로 확인 불가', async () => {
  const r = await readSdp({ now, fetchFn: async () => ({ status: 200, json: async () => { throw new SyntaxError('x'); } }) });
  assert.equal(r.status, 'unavailable');
  assert.match(r.reason, /JSON/);
});
