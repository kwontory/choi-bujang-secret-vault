// Windows 방화벽 설정과 최근 24시간 Windows 기록(System·Application)의 경고·오류 건수를 읽기만 합니다.
// 고정된 PowerShell 명령만 셸 없이 실행하며, 설정을 바꾸는 명령은 쓰지 않습니다.
// 경고·오류 건수는 침해나 공격 탐지 결과가 아닙니다.
import { spawn } from 'node:child_process';

const FIREWALL_SOURCE = 'PowerShell Get-NetFirewallProfile (읽기만)';
const EVENT_SOURCE = 'PowerShell Get-WinEvent, 최근 24시간 Level 2(오류)·3(경고) 건수';
const TIMEOUT_MS = 15000;

// 학생이 고정한 읽기 전용 스크립트입니다. 입력값을 끼워 넣지 않습니다.
export const READ_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$result = [ordered]@{ firewall = $null; firewallError = $null; events = [ordered]@{} }
try {
  $result.firewall = @(Get-NetFirewallProfile | ForEach-Object { [ordered]@{ name = [string]$_.Name; enabled = [string]$_.Enabled } })
} catch { $result.firewallError = [string]$_.FullyQualifiedErrorId }
$since = (Get-Date).AddHours(-24)
foreach ($log in @('System','Application')) {
  try {
    $items = @(Get-WinEvent -FilterHashtable @{ LogName = $log; Level = 2,3; StartTime = $since } -ErrorAction Stop)
    $result.events[$log] = [ordered]@{ ok = $true; error = @($items | Where-Object Level -eq 2).Count; warning = @($items | Where-Object Level -eq 3).Count }
  } catch {
    if ([string]$_.FullyQualifiedErrorId -match 'NoMatchingEventsFound') { $result.events[$log] = [ordered]@{ ok = $true; error = 0; warning = 0 } }
    else { $result.events[$log] = [ordered]@{ ok = $false; code = [string]$_.FullyQualifiedErrorId } }
  }
}
$result | ConvertTo-Json -Depth 4 -Compress
`;

export function powershellPath(env = process.env) {
  const root = typeof env.SystemRoot === 'string' && /^[A-Za-z]:\\[^"<>|?*]+$/.test(env.SystemRoot) ? env.SystemRoot : 'C:\\Windows';
  return `${root}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`;
}

export function runReadScript({ platform = process.platform, spawnFn = spawn, timeoutMs = TIMEOUT_MS } = {}) {
  if (platform !== 'win32') return Promise.resolve({ ok: false, code: 'NOT_WINDOWS', message: 'Windows가 아니어서 읽지 않았습니다.' });
  return new Promise(resolve => {
    let out = '';
    let done = false;
    const finish = value => { if (!done) { done = true; clearTimeout(timer); resolve(value); } };
    let child;
    try {
      const encoded = Buffer.from(READ_SCRIPT, 'utf16le').toString('base64');
      child = spawnFn(powershellPath(), ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], { shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (error) {
      return finish({ ok: false, code: 'START_FAILED', message: `PowerShell을 실행하지 못했습니다(${error?.code ?? '알 수 없는 오류'}).` });
    }
    const timer = setTimeout(() => { try { child.kill(); } catch {} finish({ ok: false, code: 'TIMEOUT', message: `${timeoutMs / 1000}초 안에 결과를 받지 못했습니다.` }); }, timeoutMs);
    child.stdout.on('data', chunk => { if (out.length < 200000) out += chunk; });
    child.stderr.on('data', () => {});
    child.on('error', error => finish({ ok: false, code: 'START_FAILED', message: `PowerShell을 실행하지 못했습니다(${error?.code ?? '알 수 없는 오류'}).` }));
    child.on('close', code => {
      try {
        const text = out.replace(/^\uFEFF/, '').trim();
        const data = JSON.parse(text.slice(text.indexOf('{')));
        finish({ ok: true, data });
      } catch {
        finish({ ok: false, code: 'BAD_OUTPUT', message: `PowerShell 결과를 읽지 못했습니다(종료 코드 ${code}).` });
      }
    });
  });
}

const ENABLED_TEXT = { True: '켜짐', False: '꺼짐', NotConfigured: '설정 안 됨' };
const asArray = v => (Array.isArray(v) ? v : v && typeof v === 'object' ? [v] : []);

export function toFirewallItem(run, measuredAt) {
  const base = { key: 'firewall', label: '방화벽 설정', measuredAt, source: FIREWALL_SOURCE };
  if (!run.ok) return { ...base, status: 'unavailable', level: 'unknown', reason: `방화벽 설정을 읽지 못했습니다: ${run.message}` };
  if (run.data.firewallError) return { ...base, status: 'unavailable', level: 'unknown', reason: `방화벽 설정을 읽지 못했습니다(${String(run.data.firewallError).split(',')[0]}). 권한이 필요한 경우 바꾸지 않고 확인 불가로 둡니다.` };
  const profiles = asArray(run.data.firewall).filter(p => typeof p?.name === 'string');
  if (profiles.length === 0) return { ...base, status: 'unavailable', level: 'unknown', reason: '방화벽 프로필 목록이 비어 있습니다.' };
  const on = profiles.filter(p => p.enabled === 'True').length;
  const off = profiles.filter(p => p.enabled === 'False').length;
  return {
    ...base, status: 'measured',
    level: off > 0 ? 'warn' : on === profiles.length ? 'ok' : 'unknown',
    display: `켜짐 ${on}/${profiles.length}`,
    detail: profiles.map(p => `${p.name} ${ENABLED_TEXT[p.enabled] ?? '확인 불가'}`).join(' · '),
    note: '읽기만 했으며 설정은 바꾸지 않았습니다.',
  };
}

export function toEventItem(run, log, measuredAt) {
  const label = log === 'System' ? 'Windows 기록 · System' : 'Windows 기록 · Application';
  const base = { key: `events-${log.toLowerCase()}`, label, measuredAt, source: EVENT_SOURCE };
  if (!run.ok) return { ...base, status: 'unavailable', level: 'unknown', reason: `${log} 기록을 읽지 못했습니다: ${run.message}` };
  const e = run.data.events?.[log];
  if (!e) return { ...base, status: 'unavailable', level: 'unknown', reason: `${log} 기록 결과가 없습니다.` };
  if (e.ok !== true || !Number.isInteger(e.error) || !Number.isInteger(e.warning)) {
    return { ...base, status: 'unavailable', level: 'unknown', reason: `${log} 기록을 읽지 못했습니다(${String(e.code ?? '형식 오류').split(',')[0]}).` };
  }
  return {
    ...base, status: 'measured', level: 'info',
    display: `오류 ${e.error} · 경고 ${e.warning}`,
    detail: '최근 24시간',
    note: '건수일 뿐 침해나 공격 탐지 결과가 아닙니다.',
  };
}

export async function readWindows(options = {}) {
  const run = await runReadScript(options);
  const measuredAt = new Date().toISOString();
  return [toFirewallItem(run, measuredAt), toEventItem(run, 'System', measuredAt), toEventItem(run, 'Application', measuredAt)];
}
