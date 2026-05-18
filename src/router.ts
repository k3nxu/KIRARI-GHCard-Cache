export type Route =
  | {
      kind: "repo";
      owner: string;
      repo: string;
    }
  | {
      kind: "contents";
      owner: string;
      repo: string;
      path: string;
      ref?: string;
    }
  | {
      kind: "commits";
      owner: string;
      repo: string;
      path: string;
      sha?: string;
    }
  | {
      kind: "avatar";
      owner: string;
      size: number;
    };

export type RouteResult =
  | {
      ok: true;
      route: Route;
    }
  | {
      ok: false;
      status: number;
      message: string;
    };

type ValidationResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      status: number;
      message: string;
    };

const GITHUB_PREFIX = "/api/github";
const NAME_PATTERN = /^[A-Za-z0-9_.-]{1,100}$/;
const MAX_PATH_LENGTH = 512;
const MAX_REF_LENGTH = 100;
const ALLOWED_COMMIT_PARAMS = new Set(["path", "per_page", "sha"]);

export function parseRoute(url: URL): RouteResult {
  if (url.pathname === "/healthz") {
    return { ok: false, status: 404, message: "health route is handled separately" };
  }

  if (!url.pathname.startsWith(`${GITHUB_PREFIX}/`)) {
    return { ok: false, status: 404, message: "Unsupported endpoint." };
  }

  const segments = url.pathname
    .slice(GITHUB_PREFIX.length + 1)
    .split("/")
    .map((segment) => decodeSegment(segment));

  if (segments.some((segment) => segment === null)) {
    return { ok: false, status: 400, message: "Invalid percent encoding in path." };
  }

  const safeSegments = segments as string[];
  const [resource] = safeSegments;

  if (resource === "repos") {
    return parseRepoRoute(url, safeSegments);
  }

  if (resource === "avatar") {
    return parseAvatarRoute(url, safeSegments);
  }

  return { ok: false, status: 404, message: "Unsupported GitHub cache endpoint." };
}

export function routeToCacheParts(route: Route): string[] {
  if (route.kind === "repo") {
    return [route.kind, route.owner, route.repo];
  }

  if (route.kind === "contents") {
    return [route.kind, route.owner, route.repo, route.path, route.ref ?? ""];
  }

  if (route.kind === "commits") {
    return [route.kind, route.owner, route.repo, route.path, route.sha ?? ""];
  }

  return [route.kind, route.owner, String(route.size)];
}

export function parsePrewarmTarget(target: string): RouteResult {
  const trimmed = target.trim();

  if (!trimmed) {
    return { ok: false, status: 400, message: "Empty prewarm target." };
  }

  const [type, payload = ""] = splitOnce(trimmed, ":");
  if (type === "repo") {
    const [owner, repo] = splitRepo(payload);
    return owner && repo ? parseRoute(new URL(`/api/github/repos/${owner}/${repo}`, "https://prewarm.local")) : invalidPrewarm();
  }

  if (type === "content") {
    const [repoPart, path = ""] = splitOnce(payload, ":");
    const [owner, repo] = splitRepo(repoPart);
    return owner && repo && path
      ? parseRoute(new URL(`/api/github/repos/${owner}/${repo}/contents/${encodePath(path)}`, "https://prewarm.local"))
      : invalidPrewarm();
  }

  if (type === "commits") {
    const [repoPart, path = ""] = splitOnce(payload, ":");
    const [owner, repo] = splitRepo(repoPart);
    return owner && repo && path
      ? parseRoute(new URL(`/api/github/repos/${owner}/${repo}/commits?path=${encodeURIComponent(path)}&per_page=1`, "https://prewarm.local"))
      : invalidPrewarm();
  }

  if (type === "avatar") {
    return parseRoute(new URL(`/api/github/avatar/${payload}`, "https://prewarm.local"));
  }

  return invalidPrewarm();
}

function parseRepoRoute(url: URL, segments: string[]): RouteResult {
  const [, owner, repo, action, ...rest] = segments;

  if (!isValidName(owner) || !isValidName(repo)) {
    return { ok: false, status: 400, message: "Invalid GitHub owner or repository name." };
  }

  if (!action) {
    return { ok: true, route: { kind: "repo", owner, repo } };
  }

  if (action === "contents") {
    const path = rest.join("/");
    const pathValidation = validatePath(path);
    if (!pathValidation.ok) {
      return pathValidation;
    }

    const ref = url.searchParams.get("ref") ?? undefined;
    if (ref !== undefined && !isValidRef(ref)) {
      return { ok: false, status: 400, message: "Invalid ref parameter." };
    }

    return { ok: true, route: ref ? { kind: "contents", owner, repo, path, ref } : { kind: "contents", owner, repo, path } };
  }

  if (action === "commits" && rest.length === 0) {
    for (const key of url.searchParams.keys()) {
      if (!ALLOWED_COMMIT_PARAMS.has(key)) {
        return { ok: false, status: 400, message: "Unsupported commits query parameter." };
      }
    }

    const path = url.searchParams.get("path") ?? "";
    const pathValidation = validatePath(path);
    if (!pathValidation.ok) {
      return pathValidation;
    }

    const perPage = url.searchParams.get("per_page");
    if (perPage !== null && perPage !== "1") {
      return { ok: false, status: 400, message: "per_page must be 1 for cached card commits." };
    }

    const sha = url.searchParams.get("sha") ?? undefined;
    if (sha !== undefined && !isValidRef(sha)) {
      return { ok: false, status: 400, message: "Invalid sha parameter." };
    }

    return { ok: true, route: sha ? { kind: "commits", owner, repo, path, sha } : { kind: "commits", owner, repo, path } };
  }

  return { ok: false, status: 404, message: "Unsupported repository endpoint." };
}

function parseAvatarRoute(url: URL, segments: string[]): RouteResult {
  const [, owner, ...rest] = segments;
  if (rest.length > 0 || !isValidName(owner)) {
    return { ok: false, status: 400, message: "Invalid GitHub avatar owner." };
  }

  const requestedSize = url.searchParams.get("size");
  const size = requestedSize === null ? 96 : Number(requestedSize);
  if (!Number.isInteger(size) || size < 16 || size > 256) {
    return { ok: false, status: 400, message: "Avatar size must be an integer from 16 to 256." };
  }

  return { ok: true, route: { kind: "avatar", owner, size } };
}

function decodeSegment(segment: string): string | null {
  try {
    const once = decodeURIComponent(segment);
    return once.includes("%") ? decodeURIComponent(once) : once;
  } catch {
    return null;
  }
}

function validatePath(path: string): ValidationResult {
  if (!path || path.length > MAX_PATH_LENGTH || /[\u0000-\u001f\u007f\\]/.test(path)) {
    return { ok: false, status: 400, message: "Invalid GitHub file path." };
  }

  const parts = path.split("/");
  if (parts.some((part) => part === "" || part === "." || part === "..")) {
    return { ok: false, status: 400, message: "GitHub file path cannot contain empty, current, or parent segments." };
  }

  return { ok: true };
}

function isValidName(value: string | undefined): value is string {
  return typeof value === "string" && NAME_PATTERN.test(value);
}

function isValidRef(value: string): boolean {
  return value.length > 0 && value.length <= MAX_REF_LENGTH && !/[\u0000-\u001f\u007f]/.test(value);
}

function splitOnce(value: string, separator: string): [string, string?] {
  const index = value.indexOf(separator);
  return index === -1 ? [value] : [value.slice(0, index), value.slice(index + separator.length)];
}

function splitRepo(value: string): [string | undefined, string | undefined] {
  const parts = value.split("/");
  return [parts[0], parts.length === 2 ? parts[1] : undefined];
}

function encodePath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

function invalidPrewarm(): RouteResult {
  return { ok: false, status: 400, message: "Invalid prewarm target." };
}
