import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchJson, dataUrl } from "./client";
import { orinLots } from "./index";

// The test owns its configuration: a local .env (VITE_DATA_BASE_URL
// pointing at a bucket) must not change what the client is checked against.
vi.mock("../config", () => ({
  DATA_BASE_URL: "/data/v1/", API_BASE: "", APP_NAME: "test",
}));

describe("api client", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it("dataUrl joins base and path", () => {
    expect(dataUrl("meta.json")).toBe("/data/v1/meta.json");
    expect(dataUrl("/meta.json")).toBe("/data/v1/meta.json");
  });

  it("404 resolves to null (missing shard is normal)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response("nf", { status: 404 })));
    expect(await orinLots()).toBeNull();
  });

  it("parses json on 200", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(JSON.stringify({ version: "v1" }), { status: 200 })));
    expect(await fetchJson<{ version: string }>("x"))
      .toEqual({ version: "v1" });
  });

  it("network error resolves to null, not throw", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("down"); }));
    expect(await fetchJson("x")).toBeNull();
  });
});
