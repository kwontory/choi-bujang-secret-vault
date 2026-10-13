const OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/u;
const REPO = /^[A-Za-z0-9._-]{1,100}$/u;
const SHA = /^[a-f0-9]{40}$/iu;
const HOST = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.vercel\.app$/iu;

export function deploymentIdentity(env, config) {
  const owner = env.VERCEL_GIT_REPO_OWNER;
  const repo = env.VERCEL_GIT_REPO_SLUG;
  const commit = env.VERCEL_GIT_COMMIT_SHA;
  const host = env.VERCEL_URL;
  // 2단계부터는 심판이 읽는 공개 주소(config.publicAppUrl)를 적습니다. VERCEL_URL 은 배포마다 바뀌는
  // 개별 배포 주소라 Vercel 배포 보호로 막혀 있을 수 있습니다.
  const publicAppUrl = config?.step >= 2 && typeof config.publicAppUrl === 'string' ? config.publicAppUrl : `https://${host}`;
  const publicHost = typeof publicAppUrl === 'string' && /^https:\/\/([^/]+)\/?$/u.exec(publicAppUrl)?.[1];
  if (env.VERCEL_GIT_PROVIDER !== 'github' || !OWNER.test(owner || '')
      || !REPO.test(repo || '') || repo === '.' || repo === '..'
      || repo.toLowerCase().endsWith('.git') || !SHA.test(commit || '')
      || !HOST.test(host || '') || !HOST.test(publicHost || '') || !Number.isInteger(config?.step)
      || config.step < 1 || config.step > 12
      || typeof config.judgeIssuer !== 'string'
      || !/^https:\/\/[a-z0-9-]+\.up\.railway\.app\/defense\/judge$/iu.test(config.judgeIssuer)
      || typeof config.sampleMarker !== 'string'
      || !/^[A-Z0-9_]{1,80}$/u.test(config.sampleMarker)
      || (config.step >= 5 && (typeof config.originalApiUrl !== 'string'
        || !/^https:\/\/[^?\s]+$/iu.test(config.originalApiUrl)))) {
    throw new Error('배포 식별 정보를 확인할 수 없습니다. Vercel 시스템 환경변수와 단계 설정을 확인하세요.');
  }
  return {
    schema: 'aleph.defense.deployment.v1',
    step: config.step,
    repoUrl: `https://github.com/${owner.toLowerCase()}/${repo.toLowerCase()}`,
    commit: commit.toLowerCase(),
    publicAppUrl: `https://${publicHost.toLowerCase()}`,
    judgeIssuer: config.judgeIssuer,
    sampleMarker: config.sampleMarker,
    ...(Array.isArray(config.allowedRoutes) ? { allowedRoutes: config.allowedRoutes } : {}),
    ...(config.step >= 5 ? { originalApiUrl: config.originalApiUrl } : {}),
    ...(config.step >= 10 && typeof config.restoreRoute === 'string' ? { restoreRoute: config.restoreRoute } : {}),
    ...(config.step >= 3 && config.identityProvider && typeof config.identityProvider === 'object' ? { identityProvider: {
      issuer: config.identityProvider.issuer, audience: config.identityProvider.audience, jwksUrl: config.identityProvider.jwksUrl,
    } } : {}),
  };
}
