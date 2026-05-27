import { describe, expect, it } from "vitest";
import {
  editKeyPath,
  isValidToken,
  newShareToken,
  snapshotPath,
} from "./token";

describe("share tokens", () => {
  it("mints URL-safe tokens that validate", () => {
    for (let i = 0; i < 50; i++) {
      const t = newShareToken();
      expect(isValidToken(t)).toBe(true);
      expect(t).toMatch(/^[0-9a-z]+$/);
    }
  });

  it("mints distinct view and edit tokens", () => {
    const view = newShareToken();
    const edit = newShareToken();
    expect(view).not.toBe(edit);
  });

  it("rejects malformed tokens", () => {
    expect(isValidToken("")).toBe(false);
    expect(isValidToken("short")).toBe(false);
    expect(isValidToken("HAS-UPPER-AND-DASH-0123456")).toBe(false);
    expect(isValidToken("a".repeat(65))).toBe(false);
  });

  it("maps a view token to its snapshot path", () => {
    expect(snapshotPath("abc123")).toBe("shares/abc123.json");
  });

  it("maps an edit token to a key pointer path under keys/", () => {
    expect(editKeyPath("edit99")).toBe("shares/keys/edit99.json");
  });

  it("never collides a snapshot path with an edit-key path for the same token", () => {
    const t = newShareToken();
    expect(snapshotPath(t)).not.toBe(editKeyPath(t));
  });
});
