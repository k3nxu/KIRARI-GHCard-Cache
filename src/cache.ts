import { fetchGithub } from "./github";
import { normalizeUpstreamBody } from "./normalize";
import { getStringBinding } from "./env";
import type { Route } from "./router";
import { routeToCacheParts } from "./router";
import { errorResponse } from "./response";

export type CacheStatus = "HIT-L1" | "HIT-KV" | "MISS" | "STALE";

export type CacheEnvelope = {
  status: number;
  headers: Record<string, string>;
  body: string;
  bodyEncoding: "utf-8" | "base64";
  cachedAt: number;
  freshUntil: number;
  staleUntil: number;
  upstreamEtag?: string;
  upstreamLastModified?: string;
};

const INTERNAL_CACHE_ORIGIN = "https://kirari-ghcard-cache.internal";
const MAX_JSON_BYTES = 1_000_000;
const MAX_AVATAR_BYTES = 512_000;

export async function handleCachedRoute(request: Request, env: Env, ctx: ExecutionContext, route: Route): Promise<Response> {
  const cacheKey = buildCacheKey(env, route);
  const l1Request = new Request(`${INTERNAL_CACHE_ORIGIN}/${encodeURIComponent(cacheKey)}`);
  const cached = await caches.default.match(l1Request);
  if (cached) {
    return cached;
  }

  const now = Date.now();
  const envelope = await env.GITHUB_CACHE.get<CacheEnvelope>(cacheKey, "json");
  if (isCacheEnvelope(envelope)) {
    if (envelope.freshUntil > now) {
      const response = envelopeToResponse(envelope, "HIT-KV", cacheKey);
      ctx.waitUntil(putL1(l1Request, envelope, cacheKey));
      return response;
    }

    if (envelope.staleUntil > now) {
      ctx.waitUntil(refreshCache(request, env, route, cacheKey, l1Request, envelope));
      return envelopeToResponse(envelope, "STALE", cacheKey);
    }
  }

  return refreshCache(request, env, route, cacheKey, l1Request, isCacheEnvelope(envelope) ? envelope : undefined);
}

export function buildCacheKey(env: Env, route: Route): string {
  const version = getStringBinding(env, "CACHE_NAMESPACE_VERSION", "v1") || "v1";
  return ["ghcard", version, ...routeToCacheParts(route)].map(encodeKeyPart).join(":");
}

export function getTtlPolicy(route: Route, status: number): { freshSeconds: number; staleSeconds: number; cacheable: boolean } {
  if (status === 404) {
    return { freshSeconds: 600, staleSeconds: 86_400, cacheable: true };
  }

  if (status !== 200) {
    return { freshSeconds: 0, staleSeconds: 0, cacheable: false };
  }

  if (route.kind === "repo") {
    return { freshSeconds: 21_600, staleSeconds: 604_800, cacheable: true };
  }

  if (route.kind === "contents") {
    return { freshSeconds: 86_400, staleSeconds: 1_209_600, cacheable: true };
  }

  if (route.kind === "commits") {
    return { freshSeconds: 3_600, staleSeconds: 604_800, cacheable: true };
  }

  return { freshSeconds: 604_800, staleSeconds: 2_592_000, cacheable: true };
}

async function refreshCache(
  request: Request,
  env: Env,
  route: Route,
  cacheKey: string,
  l1Request: Request,
  fallback?: CacheEnvelope,
): Promise<Response> {
  try {
    const upstream = await fetchGithub(route, env);
    const ttl = getTtlPolicy(route, upstream.status);

    if (!ttl.cacheable) {
      if (fallback) {
        return envelopeToResponse(fallback, "STALE", cacheKey);
      }

      return upstreamErrorResponse(upstream.status);
    }

    const envelope = await upstreamToEnvelope(upstream, route, request, env, ttl);
    await env.GITHUB_CACHE.put(cacheKey, JSON.stringify(envelope), {
      expirationTtl: ttl.freshSeconds + ttl.staleSeconds,
    });
    await putL1(l1Request, envelope, cacheKey);
    return envelopeToResponse(envelope, "MISS", cacheKey);
  } catch {
    if (fallback) {
      return envelopeToResponse(fallback, "STALE", cacheKey);
    }

    return errorResponse(504, "GitHub upstream did not respond and no stale cache is available.", "upstream_timeout");
  }
}

async function upstreamToEnvelope(
  upstream: Response,
  route: Route,
  request: Request,
  env: Env,
  ttl: { freshSeconds: number; staleSeconds: number },
): Promise<CacheEnvelope> {
  const body = await readBoundedBody(upstream, route.kind === "avatar" ? MAX_AVATAR_BYTES : MAX_JSON_BYTES);
  const contentType = upstream.headers.get("Content-Type") ?? (route.kind === "avatar" ? "image/png" : "application/json; charset=utf-8");
  const publicBaseUrl = getPublicBaseUrl(request, env);
  const normalizedBody = normalizeUpstreamBody(route, body, contentType, publicBaseUrl);
  const now = Date.now();
  const responseHeaders = filterHeaders(upstream.headers, contentType);

  const envelope: CacheEnvelope = {
    status: upstream.status,
    headers: responseHeaders,
    body: encodeBody(normalizedBody, route.kind === "avatar" ? "base64" : "utf-8"),
    bodyEncoding: route.kind === "avatar" ? "base64" : "utf-8",
    cachedAt: now,
    freshUntil: now + ttl.freshSeconds * 1000,
    staleUntil: now + (ttl.freshSeconds + ttl.staleSeconds) * 1000,
  };

  const etag = upstream.headers.get("ETag");
  if (etag) {
    envelope.upstreamEtag = etag;
  }

  const lastModified = upstream.headers.get("Last-Modified");
  if (lastModified) {
    envelope.upstreamLastModified = lastModified;
  }

  return envelope;
}

async function readBoundedBody(response: Response, maxBytes: number): Promise<Uint8Array> {
  const contentLength = response.headers.get("Content-Length");
  if (contentLength !== null && Number(contentLength) > maxBytes) {
    throw new Error("Upstream response is too large to cache.");
  }

  const body = new Uint8Array(await response.arrayBuffer());
  if (body.byteLength > maxBytes) {
    throw new Error("Upstream response is too large to cache.");
  }

  return body;
}

function envelopeToResponse(envelope: CacheEnvelope, cacheStatus: CacheStatus, cacheKey: string): Response {
  const headers = new Headers(envelope.headers);
  const ttl = Math.max(0, Math.floor((envelope.freshUntil - Date.now()) / 1000));
  const stale = Math.max(0, Math.floor((envelope.staleUntil - Math.max(Date.now(), envelope.freshUntil)) / 1000));
  headers.set("Cache-Control", `public, max-age=300, s-maxage=${ttl}, stale-while-revalidate=${stale}`);
  headers.set("X-Cache", cacheStatus);
  headers.set("X-Cache-Key", cacheKey);
  if (envelope.upstreamEtag) {
    headers.set("X-Upstream-ETag", envelope.upstreamEtag);
  }
  if (envelope.upstreamLastModified) {
    headers.set("X-Upstream-Last-Modified", envelope.upstreamLastModified);
  }

  return new Response(decodeBody(envelope), {
    status: envelope.status,
    headers,
  });
}

async function putL1(request: Request, envelope: CacheEnvelope, cacheKey: string): Promise<void> {
  await caches.default.put(request, envelopeToResponse(envelope, "HIT-L1", cacheKey));
}

function filterHeaders(headers: Headers, contentType: string): Record<string, string> {
  const filtered: Record<string, string> = {
    "Content-Type": contentType,
  };

  const rateLimitRemaining = headers.get("X-RateLimit-Remaining");
  const rateLimitReset = headers.get("X-RateLimit-Reset");
  if (rateLimitRemaining) {
    filtered["X-Upstream-RateLimit-Remaining"] = rateLimitRemaining;
  }
  if (rateLimitReset) {
    filtered["X-Upstream-RateLimit-Reset"] = rateLimitReset;
  }

  return filtered;
}

function upstreamErrorResponse(status: number): Response {
  if (status === 403 || status === 429) {
    return errorResponse(status, "GitHub rate limit or access restriction was returned and no stale cache is available.", "upstream_rate_limited");
  }

  if (status >= 500) {
    return errorResponse(502, "GitHub upstream returned a temporary error and no stale cache is available.", "upstream_error");
  }

  return errorResponse(status, "GitHub upstream returned an uncached response.", "upstream_error");
}

function encodeBody(body: Uint8Array, encoding: CacheEnvelope["bodyEncoding"]): string {
  if (encoding === "utf-8") {
    return new TextDecoder().decode(body);
  }

  let binary = "";
  for (const byte of body) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}

function decodeBody(envelope: CacheEnvelope): Uint8Array | string {
  if (envelope.bodyEncoding === "utf-8") {
    return envelope.body;
  }

  const binary = atob(envelope.body);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function isCacheEnvelope(value: unknown): value is CacheEnvelope {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const envelope = value as Partial<CacheEnvelope>;
  return (
    typeof envelope.status === "number" &&
    typeof envelope.body === "string" &&
    (envelope.bodyEncoding === "utf-8" || envelope.bodyEncoding === "base64") &&
    typeof envelope.cachedAt === "number" &&
    typeof envelope.freshUntil === "number" &&
    typeof envelope.staleUntil === "number" &&
    typeof envelope.headers === "object" &&
    envelope.headers !== null
  );
}

function encodeKeyPart(value: string): string {
  return encodeURIComponent(value);
}

function getPublicBaseUrl(request: Request, env: Env): string {
  return (
    request.headers.get("X-KIRARI-GHC-PUBLIC-BASE") ||
    getStringBinding(env, "PUBLIC_BASE_URL") ||
    `${new URL(request.url).origin}/api/github`
  );
}
