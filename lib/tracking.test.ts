import { describe, expect, it } from "vitest";
import { getAttribution } from "./tracking";

describe("getAttribution", () => {
  it("preserva UTMs e ref conhecidos", () => {
    const params = new URLSearchParams("utm_source=instagram&utm_medium=social&utm_campaign=z1&ref=unifesp&ignored=x");
    expect(getAttribution(params)).toEqual({ utm_source: "instagram", utm_medium: "social", utm_campaign: "z1", ref: "unifesp" });
  });
  it("omite parâmetros vazios", () => expect(getAttribution(new URLSearchParams())).toEqual({}));
});
