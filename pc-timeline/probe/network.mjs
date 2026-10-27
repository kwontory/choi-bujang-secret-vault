// 네트워크 어댑터의 연결 상태를 읽기만 합니다. IP 주소 자체는 화면과 기록에 내보내지 않습니다.
import os from 'node:os';

const SOURCE = 'Node.js os.networkInterfaces()';
const LABEL = '네트워크 연결';

export function classifyIPv4(address) {
  const p = String(address).split('.').map(Number);
  if (p.length !== 4 || p.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return 'invalid';
  if (p[0] === 10 || (p[0] === 172 && p[1] >= 16 && p[1] <= 31) || (p[0] === 192 && p[1] === 168)) return 'private';
  if (p[0] === 169 && p[1] === 254) return 'link-local';
  if (p[0] === 100 && p[1] >= 64 && p[1] <= 127) return 'shared';
  return 'public';
}
const KIND_TEXT = { private: '사설 주소', 'link-local': '자동 할당 주소(169.254)', shared: '공유 주소 대역(100.64/10 · VPN이나 통신사 장비)', public: '공인 주소', invalid: '형식 확인 불가', none: 'IPv4 없음' };

export function readNetwork({ networkInterfaces = os.networkInterfaces, now = () => new Date() } = {}) {
  const measuredAt = now().toISOString();
  try {
    const all = networkInterfaces();
    if (!all || typeof all !== 'object') return { key: 'network', label: LABEL, status: 'unavailable', level: 'unknown', reason: '네트워크 정보를 읽지 못했습니다.', measuredAt, source: SOURCE };
    const adapters = [];
    for (const [name, list] of Object.entries(all)) {
      const external = (Array.isArray(list) ? list : []).filter(a => a && !a.internal);
      if (external.length === 0) continue;
      const v4 = external.find(a => a.family === 'IPv4' || a.family === 4);
      adapters.push({ name, kind: v4 ? classifyIPv4(v4.address) : 'none' });
    }
    const usable = adapters.filter(a => a.kind === 'private' || a.kind === 'public' || a.kind === 'shared');
    const level = usable.length > 0 ? 'ok' : 'warn';
    const detail = adapters.length === 0
      ? '주소가 있는 네트워크 어댑터가 없습니다(연결 끊김 가능).'
      : adapters.map(a => `${a.name}: ${KIND_TEXT[a.kind]}`).join(' · ');
    return {
      key: 'network', label: LABEL, status: 'measured', level,
      display: adapters.length === 0 ? '연결 없음' : `어댑터 ${adapters.length}개`,
      detail, measuredAt, source: SOURCE,
      note: level === 'warn' ? '정상 주소를 받은 어댑터가 없습니다. 케이블·Wi-Fi 연결을 확인하세요.' : undefined,
    };
  } catch (error) {
    return { key: 'network', label: LABEL, status: 'unavailable', level: 'unknown', reason: `네트워크 정보를 읽지 못했습니다(${error?.code ?? '알 수 없는 오류'}).`, measuredAt, source: SOURCE };
  }
}
