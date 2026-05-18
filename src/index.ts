import { handleCachedRoute } from "./cache";
import { corsHeaders, evaluateCors, withCors } from "./cors";
import { getStringBinding } from "./env";
import { parsePrewarmTarget, parseRoute } from "./router";
import { errorResponse, headResponse, jsonResponse } from "./response";

const MAX_PREWARM_TARGETS = 50;

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const cors = evaluateCors(request, env);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: cors.allowed ? 204 : 403,
        headers: corsHeaders(cors),
      });
    }

    if (!cors.allowed) {
      return withCors(errorResponse(403, "Origin is not allowed to call this Worker.", "origin_not_allowed"), cors);
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      return withCors(errorResponse(405, "Only GET, HEAD, and OPTIONS are supported.", "method_not_allowed"), cors);
    }

    const url = new URL(request.url);
    if (url.pathname === "/healthz") {
      return withCors(jsonResponse({ ok: true, service: "kirari-ghcard-cache" }), cors);
    }

    const parsed = parseRoute(url);
    if (!parsed.ok) {
      return withCors(errorResponse(parsed.status, parsed.message), cors);
    }

    const response = await handleCachedRoute(request, env, ctx, parsed.route);
    return withCors(request.method === "HEAD" ? headResponse(response) : response, cors);
  },

  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(prewarmTargets(env, ctx));
  },
};

async function prewarmTargets(env: Env, ctx: ExecutionContext): Promise<void> {
  const publicBaseUrl = getStringBinding(env, "PUBLIC_BASE_URL");
  const targets = parsePrewarmTargets(getStringBinding(env, "PREWARM_TARGETS")).slice(0, MAX_PREWARM_TARGETS);

  for (const target of targets) {
    const parsed = parsePrewarmTarget(target);
    if (!parsed.ok) {
      console.warn(JSON.stringify({ event: "prewarm_skip", target, reason: parsed.message }));
      continue;
    }

    if (parsed.route.kind === "repo" && !publicBaseUrl) {
      console.warn(JSON.stringify({ event: "prewarm_skip", target, reason: "PUBLIC_BASE_URL is required for repo JSON avatar rewriting during cron prewarm." }));
      continue;
    }

    const request = new Request(prewarmUrlForTarget(publicBaseUrl, target));
    try {
      const response = await handleCachedRoute(request, env, ctx, parsed.route);
      console.log(JSON.stringify({ event: "prewarm_complete", target, status: response.status, cache: response.headers.get("X-Cache") }));
    } catch (error) {
      console.warn(JSON.stringify({ event: "prewarm_failed", target, message: error instanceof Error ? error.message : "unknown error" }));
    }
  }
}

function parsePrewarmTargets(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((target) => target.trim())
    .filter(Boolean);
}

function prewarmUrlForTarget(publicBaseUrl: string, target: string): string {
  const baseUrl = publicBaseUrl || "https://prewarm.local/api/github";
  return `${baseUrl.replace(/\/$/, "")}/prewarm-placeholder?target=${encodeURIComponent(target)}`;
}
