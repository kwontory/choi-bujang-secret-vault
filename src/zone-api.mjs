// 8단계 구역 API 공통 부품입니다. 반 공지(announcements)·강사 자료(materials)와 강사 관리 경로가 함께 씁니다.
// 화면 메뉴, 요청 본문·쿼리·헤더의 역할 값은 믿지 않습니다. 강사 권한은 서버에 저장된 표로만 확인합니다.
import { createClient } from '@supabase/supabase-js';
import config from '../aleph.config.json' with { type: 'json' };
import { createLoginVerifier } from './verify-login.mjs';

export const NOTICE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

// 자원 ID: 같은 계정이라도 서버가 구역을 구별할 수 있게 구역 이름을 앞에 붙입니다.
export const noteResourceId = id => `note:${id}`;
export const noticeResourceId = id => `announcement:${id}`;

let runtime;

export const json = (response, status, body) => {
  response.status(status);
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(body));
};

export const serverRuntime = () => {
  if (runtime) return runtime;
  const url = process.env.SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) return null;
  const supabase = createClient(url, secret, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  runtime = { supabase, verifyLogin: createLoginVerifier({ config, supabaseClient: supabase }) };
  return runtime;
};

export const requestBody = request => {
  if (request.body && typeof request.body === 'object') return request.body;
  if (typeof request.body !== 'string' || request.body.length > 20_000) return null;
  try { return JSON.parse(request.body); } catch { return null; }
};

// 저장된 강사 권한표(class_instructors)에서 검증된 학생 로그인 사용자만 찾습니다.
// 심판 토큰, 조회 실패, 표 없음은 모두 강사가 아닌 것으로 봅니다(실패 시 닫힘).
export async function isStoredInstructor(supabase, identity) {
  if (!identity || identity.kind !== 'student' || typeof identity.userId !== 'string') return false;
  try {
    const { data, error } = await supabase.from('class_instructors')
      .select('user_id').eq('user_id', identity.userId).maybeSingle();
    return !error && data?.user_id === identity.userId;
  } catch {
    return false;
  }
}

export const publicNotice = row => ({
  id: row.id, resourceId: noticeResourceId(row.id), title: row.title, body: row.content,
  updatedAt: row.updated_at,
});
