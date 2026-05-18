import { describe, expect, it } from "vitest";
import { buildGithubUrl } from "../src/github";

describe("buildGithubUrl", () => {
  it("builds repo API URLs", () => {
    expect(buildGithubUrl({ kind: "repo", owner: "saicaca", repo: "fuwari" }).toString()).toBe("https://api.github.com/repos/saicaca/fuwari");
  });

  it("builds contents API URLs with encoded path and ref", () => {
    expect(buildGithubUrl({ kind: "contents", owner: "saicaca", repo: "fuwari", path: "docs/hello world.md", ref: "main" }).toString()).toBe(
      "https://api.github.com/repos/saicaca/fuwari/contents/docs/hello%20world.md?ref=main",
    );
  });

  it("builds commits API URLs with per_page forced to 1", () => {
    expect(buildGithubUrl({ kind: "commits", owner: "saicaca", repo: "fuwari", path: "README.md" }).toString()).toBe(
      "https://api.github.com/repos/saicaca/fuwari/commits?path=README.md&per_page=1",
    );
  });

  it("builds avatar URLs", () => {
    expect(buildGithubUrl({ kind: "avatar", owner: "saicaca", size: 96 }).toString()).toBe("https://github.com/saicaca.png?size=96");
  });
});
