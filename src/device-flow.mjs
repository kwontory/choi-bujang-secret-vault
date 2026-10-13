// 11단계 기기 승인 요청·상태 확인 본체. 서버 함수(api/device/*)와 로컬 시험(scripts/device-test.mjs)이 함께 씁니다.
import {
  askDecider, deviceIdOf, isRevoked, issueGrant, proofMessage, publicKeyFrom, readGrant, recordApproval, verifySignature,
} from './device-approval.mjs';

const reply = (status, body) => ({ status, body });

async function provenDevice(body, action) {
  const jwk = publicKeyFrom(body?.publicKey);
  if (!jwk) return { error: reply(400, { error: 'invalid_device_key' }) };
  const deviceId = deviceIdOf(jwk);
  const ok = await verifySignature(jwk, proofMessage(action, deviceId, body.timestamp), body.signature, body.timestamp);
  if (!ok) return { error: reply(401, { error: 'device_proof_invalid' }) };
  return { jwk, deviceId };
}

// 승인 요청: 서버가 로그인 사용자·개인키 증명·회수 여부를 확인하고, 판정기가 allow 할 때만 등록 기기로 승인합니다.
export async function requestApproval({ supabase, identity, body }) {
  if (['status', 'approved', 'role', 'deviceRegistered', 'grant'].some(key => Object.hasOwn(body ?? {}, key))) {
    return reply(400, { error: 'client_approval_rejected' }); // 브라우저가 보낸 승인 값은 받지 않습니다
  }
  const proven = await provenDevice(body, 'register');
  if (proven.error) return proven.error;
  const { jwk, deviceId } = proven;
  if (await isRevoked(supabase, deviceId)) {
    return reply(403, { deviceId, status: 'revoked', approved: false, error: 'device_revoked' });
  }
  const verdict = await askDecider({ userId: identity.userId, deviceId, registered: true, action: 'register' });
  if (verdict.decision !== 'allow') {
    return reply(403, { deviceId, status: 'denied', approved: false, decision: verdict.decision, reasonCode: verdict.reasonCode });
  }
  const issued = issueGrant({ userId: identity.userId, deviceId, jwk });
  if (!issued) return reply(503, { error: 'server_not_configured' });
  await recordApproval(supabase, { deviceId, userId: identity.userId, jwk });
  return reply(200, {
    deviceId, status: 'approved', approved: true, decision: verdict.decision, reasonCode: verdict.reasonCode,
    grant: issued.grant, expiresAt: new Date(issued.expiresAt).toISOString(),
  });
}

// 상태 확인: 서버 증표가 이 사용자·이 기기·이 공개 키의 것인지, 회수되지 않았는지 보고 판정기에 다시 묻습니다.
export async function deviceStatus({ supabase, identity, body }) {
  const proven = await provenDevice(body, 'status');
  if (proven.error) return proven.error;
  const { jwk, deviceId } = proven;
  const granted = readGrant(body?.grant, { userId: identity.userId, deviceId });
  const sameKey = Boolean(granted && granted.x === jwk.x && granted.y === jwk.y);
  const revoked = await isRevoked(supabase, deviceId);
  const registered = sameKey && !revoked;
  const verdict = await askDecider({ userId: identity.userId, deviceId, registered, action: 'status' });
  return reply(200, {
    deviceId, status: revoked ? 'revoked' : registered ? 'approved' : 'not_registered',
    approved: registered && verdict.decision === 'allow', decision: verdict.decision, reasonCode: verdict.reasonCode,
  });
}
