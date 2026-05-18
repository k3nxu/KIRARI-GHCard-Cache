import type { Route } from "./router";
import { getStringBinding } from "./env";

const GITHUB_API_BASE = "https://api.github.com";
const GITHUB_AVATAR_BASE = "https://github.com";
const API_VERSION = "2022-11-28";
const USER_AGENT = "KIRARI-GHCard-Cache";

export function buildGithubUrl(route: Route): URL {
  if (route.kind === "avatar") {
    const url = new URL(`/${encodeURIComponent(route.owner)}.png`, GITHUB_AVATAR_BASE);
    url.searchParams.set("size", String(route.size));
    return url;
  }

  const base = `/repos/${encodeURIComponent(route.owner)}/${encodeURIComponent(route.repo)}`;
  if (route.kind === "repo") {
    return new URL(base, GITHUB_API_BASE);
  }

  if (route.kind === "contents") {
    const url = new URL(`${base}/contents/${encodePath(route.path)}`, GITHUB_API_BASE);
    if (route.ref) {
      url.searchParams.set("ref", route.ref);
    }

    return url;
  }

  const url = new URL(`${base}/commits`, GITHUB_API_BASE);
  url.searchParams.set("path", route.path);
  url.searchParams.set("per_page", "1");
  if (route.sha) {
    url.searchParams.set("sha", route.sha);
  }

  return url;
}

export async function fetchGithub(route: Route, env: Env): Promise<Response> {
  const url = buildGithubUrl(route);
  const headers = new Headers();
  headers.set("User-Agent", USER_AGENT);

  if (route.kind === "avatar") {
    headers.set("Accept", "image/png,image/*;q=0.8,*/*;q=0.5");
  } else {
    headers.set("Accept", "application/vnd.github+json");
    headers.set("X-GitHub-Api-Version", API_VERSION);

    const token = getOptionalSecret(env, "GITHUB_TOKEN");
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
  }

  return fetch(url, {
    method: "GET",
    headers,
    signal: AbortSignal.timeout(8000),
  });
}

function encodePath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

function getOptionalSecret(env: Env, key: string): string | undefined {
  const value = getStringBinding(env, key);
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
