import { describe, expect, it } from "vitest";
import { getTtlPolicy } from "../src/cache";
import type { Route } from "../src/router";

const repoRoute: Route = { kind: "repo", owner: "saicaca", repo: "fuwari" };
const contentsRoute: Route = { kind: "contents", owner: "saicaca", repo: "fuwari", path: "README.md" };
const commitsRoute: Route = { kind: "commits", owner: "saicaca", repo: "fuwari", path: "README.md" };
const avatarRoute: Route = { kind: "avatar", owner: "saicaca", size: 96 };

describe("getTtlPolicy", () => {
  it("uses the repo metadata TTL", () => {
    expect(getTtlPolicy(repoRoute, 200)).toEqual({ freshSeconds: 21_600, staleSeconds: 604_800, cacheable: true });
  });

  it("uses the contents metadata TTL", () => {
    expect(getTtlPolicy(contentsRoute, 200)).toEqual({ freshSeconds: 86_400, staleSeconds: 1_209_600, cacheable: true });
  });

  it("uses the commits latest-by-path TTL", () => {
    expect(getTtlPolicy(commitsRoute, 200)).toEqual({ freshSeconds: 3_600, staleSeconds: 604_800, cacheable: true });
  });

  it("uses the avatar TTL", () => {
    expect(getTtlPolicy(avatarRoute, 200)).toEqual({ freshSeconds: 604_800, staleSeconds: 2_592_000, cacheable: true });
  });

  it("short-caches 404 responses", () => {
    expect(getTtlPolicy(repoRoute, 404)).toEqual({ freshSeconds: 600, staleSeconds: 86_400, cacheable: true });
  });

  it("does not cache rate-limit responses", () => {
    expect(getTtlPolicy(repoRoute, 429)).toEqual({ freshSeconds: 0, staleSeconds: 0, cacheable: false });
  });
});
