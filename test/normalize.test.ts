import { describe, expect, it } from "vitest";
import { rewriteRepoAvatar } from "../src/normalize";

describe("rewriteRepoAvatar", () => {
  it("rewrites repo owner avatar_url to the Worker avatar endpoint", () => {
    const normalized = rewriteRepoAvatar(
      {
        name: "fuwari",
        owner: {
          login: "saicaca",
          avatar_url: "https://avatars.githubusercontent.com/u/123",
        },
      },
      "https://cache.example.com/api/github",
    );

    expect(normalized).toMatchObject({
      owner: {
        avatar_url: "https://cache.example.com/api/github/avatar/saicaca?size=96",
      },
    });
  });
});
