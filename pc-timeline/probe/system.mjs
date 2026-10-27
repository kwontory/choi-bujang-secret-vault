// 내 PC의 CPU·메모리·디스크를 일반 권한으로 읽기만 합니다.
// 읽지 못한 값은 0이나 예시 값으로 채우지 않고 status:'unavailable'과 이유를 돌려줍니다.
import os from 'node:os';
import { statfs as fsStatfs } from 'node:fs/promises';

export const THRESHOLDS = Object.freeze({ cpuPercent: 90, memoryPercent: 90, diskFreePercent: 10 });

const SOURCE = Object.freeze({
  cpu: 'Node.js os.cpus() 두 번 측정한 시간 차이',
  memory: 'Node.js os.totalmem() · os.freemem()',
  disk: 'Node.js fs.statfs()',
});
const LABEL = Object.freeze({ cpu: 'CPU 사용률', memory: '메모리 사용량', disk: '디스크 남은 공간' });
const GB = 1024 ** 3;
const round1 = n => Math.round(n * 10) / 10;
const iso = now => now().toISOString();
// 오류 메시지에는 경로·사용자 이름이 섞일 수 있으므로 코드만 남깁니다.
const errorCode = error => (error && typeof error.code === 'string' ? error.code : '알 수 없는 오류');

function unavailable(key, reason, measuredAt, extra = {}) {
  return { key, label: LABEL[key], status: 'unavailable', level: 'unknown', reason, measuredAt, source: SOURCE[key], ...extra };
}

function sumTimes(cpus) {
  let idle = 0;
  let total = 0;
  for (const cpu of cpus) {
    const t = cpu?.times;
    if (!t) return null;
    const parts = [t.user, t.nice, t.sys, t.idle, t.irq];
    if (parts.some(v => !Number.isFinite(v))) return null;
    idle += t.idle;
    total += parts.reduce((a, b) => a + b, 0);
  }
  return { idle, total };
}

export async function readCpu({ cpus = os.cpus, wait = ms => new Promise(r => setTimeout(r, ms)), intervalMs = 500, now = () => new Date() } = {}) {
  try {
    const first = cpus();
    if (!Array.isArray(first) || first.length === 0) return unavailable('cpu', 'CPU 정보를 읽지 못했습니다(빈 목록).', iso(now));
    await wait(intervalMs);
    const second = cpus();
    const measuredAt = iso(now);
    if (!Array.isArray(second) || second.length !== first.length) return unavailable('cpu', '측정하는 동안 CPU 정보가 달라져 계산하지 않았습니다.', measuredAt);
    const a = sumTimes(first);
    const b = sumTimes(second);
    if (!a || !b) return unavailable('cpu', 'CPU 시간 값이 올바르지 않아 계산하지 않았습니다.', measuredAt);
    const totalDelta = b.total - a.total;
    const idleDelta = b.idle - a.idle;
    if (!(totalDelta > 0) || idleDelta < 0 || idleDelta > totalDelta) return unavailable('cpu', '측정 간격 동안 CPU 시간 변화가 없어 계산할 수 없습니다.', measuredAt);
    const value = round1((1 - idleDelta / totalDelta) * 100);
    return {
      key: 'cpu', label: LABEL.cpu, status: 'measured', value, unit: '%',
      level: value >= THRESHOLDS.cpuPercent ? 'warn' : 'ok',
      detail: `${second.length}개 논리 프로세서 · ${intervalMs}ms 간격 평균`,
      measuredAt, source: SOURCE.cpu,
    };
  } catch (error) {
    return unavailable('cpu', `CPU 정보를 읽지 못했습니다(${errorCode(error)}).`, iso(now));
  }
}

export async function readMemory({ totalmem = os.totalmem, freemem = os.freemem, now = () => new Date() } = {}) {
  try {
    const total = totalmem();
    const free = freemem();
    const measuredAt = iso(now);
    if (!Number.isFinite(total) || !Number.isFinite(free) || total <= 0 || free < 0 || free > total) {
      return unavailable('memory', '메모리 값이 올바르지 않아 계산하지 않았습니다.', measuredAt);
    }
    const used = total - free;
    const value = round1((used / total) * 100);
    return {
      key: 'memory', label: LABEL.memory, status: 'measured', value, unit: '%',
      level: value >= THRESHOLDS.memoryPercent ? 'warn' : 'ok',
      detail: `${round1(used / GB)} GB 사용 / 전체 ${round1(total / GB)} GB`,
      measuredAt, source: SOURCE.memory,
    };
  } catch (error) {
    return unavailable('memory', `메모리 정보를 읽지 못했습니다(${errorCode(error)}).`, iso(now));
  }
}

export function defaultDiskPath(platform = process.platform, env = process.env) {
  if (platform !== 'win32') return '/';
  const drive = typeof env.SystemDrive === 'string' && /^[A-Za-z]:$/.test(env.SystemDrive) ? env.SystemDrive : 'C:';
  return `${drive}\\`;
}

export async function readDisk({ statfs = fsStatfs, path = defaultDiskPath(), now = () => new Date() } = {}) {
  const target = path.replace(/\\$/, '') || path;
  try {
    const s = await statfs(path);
    const measuredAt = iso(now);
    const total = Number(s?.blocks) * Number(s?.bsize);
    const free = Number(s?.bavail) * Number(s?.bsize);
    if (!Number.isFinite(total) || !Number.isFinite(free) || total <= 0 || free < 0 || free > total) {
      return unavailable('disk', `${target} 디스크 값이 올바르지 않아 계산하지 않았습니다.`, measuredAt, { target });
    }
    const value = round1((free / total) * 100);
    return {
      key: 'disk', label: LABEL.disk, status: 'measured', value, unit: '%',
      level: value < THRESHOLDS.diskFreePercent ? 'warn' : 'ok',
      detail: `${target} · ${round1(free / GB)} GB 남음 / 전체 ${round1(total / GB)} GB`,
      measuredAt, source: SOURCE.disk, target,
    };
  } catch (error) {
    return unavailable('disk', `${target} 디스크 정보를 읽지 못했습니다(${errorCode(error)}).`, iso(now), { target });
  }
}

export async function readSystem(options = {}) {
  const [cpu, memory, disk] = await Promise.all([readCpu(options.cpu), readMemory(options.memory), readDisk(options.disk)]);
  return { kind: 'system', items: [cpu, memory, disk], thresholds: THRESHOLDS, checkedAt: new Date().toISOString() };
}
