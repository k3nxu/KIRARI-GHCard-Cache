import type { Route } from "./router";

export function normalizeUpstreamBody(route: Route, body: Uint8Array, contentType: string, publicBaseUrl: string): Uint8Array {
  if (route.kind !== "repo" || !contentType.toLowerCase().includes("application/json")) {
    return body;
  }

  const decoded = new TextDecoder().decode(body);
  const parsed: unknown = JSON.parse(decoded);
  const normalized = rewriteRepoAvatar(parsed, publicBaseUrl);
  return new TextEncoder().encode(JSON.stringify(normalized));
}

export function rewriteRepoAvatar(value: unknown, publicBaseUrl: string): unknown {
  if (!isRecord(value)) {
    return value;
  }

  const owner = value.owner;
  if (!isRecord(owner)) {
    return value;
  }

  const login = owner.login;
  if (typeof login !== "string" || login.length === 0) {
    return value;
  }

  return {
    ...value,
    owner: {
      ...owner,
      avatar_url: `${publicBaseUrl.replace(/\/$/, "")}/avatar/${encodeURIComponent(login)}?size=96`,
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
