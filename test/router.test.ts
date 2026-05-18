import { describe, expect, it } from "vitest";
import { parsePrewarmTarget, parseRoute } from "../src/router";

describe("parseRoute", () => {
  it("parses repo routes", () => {
    const parsed = parseRoute(new URL("https://cache.test/api/github/repos/saicaca/fuwari"));
    expect(parsed).toEqual({ ok: true, route: { kind: "repo", owner: "saicaca", repo: "fuwari" } });
  });

  it("parses contents routes", () => {
    const parsed = parseRoute(new URL("https://cache.test/api/github/repos/saicaca/fuwari/contents/docs/README.md?ref=main"));
    expect(parsed).toEqual({ ok: true, route: { kind: "contents", owner: "saicaca", repo: "fuwari", path: "docs/README.md", ref: "main" } });
  });

  it("parses commits routes with path and forced per_page", () => {
    const parsed = parseRoute(new URL("https://cache.test/api/github/repos/saicaca/fuwari/commits?path=README.md&per_page=1"));
    expect(parsed).toEqual({ ok: true, route: { kind: "commits", owner: "saicaca", repo: "fuwari", path: "README.md" } });
  });

  it("rejects path traversal", () => {
    const parsed = parseRoute(new URL("https://cache.test/api/github/repos/saicaca/fuwari/contents/docs/%252E%252E/README.md"));
    expect(parsed).toMatchObject({ ok: false, status: 400 });
  });

  it("rejects unsupported commits parameters", () => {
    const parsed = parseRoute(new URL("https://cache.test/api/github/repos/saicaca/fuwari/commits?path=README.md&author=x"));
    expect(parsed).toMatchObject({ ok: false, status: 400 });
  });

  it("parses avatar routes", () => {
    const parsed = parseRoute(new URL("https://cache.test/api/github/avatar/saicaca?size=128"));
    expect(parsed).toEqual({ ok: true, route: { kind: "avatar", owner: "saicaca", size: 128 } });
  });
});

describe("parsePrewarmTarget", () => {
  it("parses repo prewarm targets", () => {
    expect(parsePrewarmTarget("repo:saicaca/fuwari")).toEqual({ ok: true, route: { kind: "repo", owner: "saicaca", repo: "fuwari" } });
  });

  it("parses content prewarm targets", () => {
    expect(parsePrewarmTarget("content:saicaca/fuwari:README.md")).toEqual({
      ok: true,
      route: { kind: "contents", owner: "saicaca", repo: "fuwari", path: "README.md" },
    });
  });
});
