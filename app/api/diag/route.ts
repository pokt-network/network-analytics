import { NextResponse } from 'next/server';

// Read-only deployment/config introspection for the DiagnosticsOverlay. Exposes NO secret values —
// only presence booleans, hostnames, and Vercel-provided deployment metadata — so it's safe to serve
// openly. It answers the two questions that most often explain a permanently-cold cache:
//   1. Is the warmer even configured, and where does it point?
//   2. Does the warmer target the *protected* deployment URL (→ 401 → warms nothing)?
export const dynamic = 'force-dynamic';

function hostOf(u: string | null | undefined): string | null {
  if (!u) return null;
  try {
    return new URL(u.startsWith('http') ? u : `https://${u}`).host;
  } catch {
    return u;
  }
}

export async function GET() {
  const cronWarmBaseUrl = process.env.CRON_WARM_BASE_URL ?? null;
  const vercelUrl = process.env.VERCEL_URL ?? null;

  // Mirrors baseUrl() in app/api/cron/warm/route.ts: CRON_WARM_BASE_URL wins, else $VERCEL_URL.
  const warmTargetHost = hostOf(cronWarmBaseUrl) ?? hostOf(vercelUrl) ?? 'localhost:3000';
  const warmTargetIsDeploymentUrl = !cronWarmBaseUrl && !!vercelUrl;

  return NextResponse.json({
    now: new Date().toISOString(),
    env: process.env.VERCEL_ENV ?? 'local',
    region: process.env.VERCEL_REGION ?? null,
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
    deploymentHost: hostOf(vercelUrl),
    warm: {
      cronSecretSet: !!process.env.CRON_SECRET,
      cronWarmBaseUrlSet: !!cronWarmBaseUrl,
      cronWarmBaseUrlHost: hostOf(cronWarmBaseUrl),
      warmTargetHost,
      // The smoking gun for a silently-failing warmer: falling back to the protected deployment URL.
      warmTargetIsDeploymentUrl,
    },
  });
}
