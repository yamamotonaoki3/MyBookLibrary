import { GET } from "@/app/api/version/route";

const CLOUDFLARE_CONTEXT = Symbol.for("__cloudflare-context__");
const globals = globalThis as Record<symbol, unknown>;

beforeEach(() => {
  process.env.APP_VERSION = "0.1.0";
});

afterEach(() => {
  delete globals[CLOUDFLARE_CONTEXT];
  delete process.env.APP_VERSION;
});

describe("GET /api/version", () => {
  it("Workers 上では、稼働中のバージョンを返し、キャッシュさせない", async () => {
    globals[CLOUDFLARE_CONTEXT] = {
      env: { CF_VERSION_METADATA: { id: "0e771b49-5bdf-4492-b385-207c75d15f18", tag: "f64ec6c", timestamp: "2026-10-13T03:02:49.040Z" } },
    };

    const res = await GET();

    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.json()).toEqual({
      version: { name: "0.1.0", id: "0e771b49-5bdf-4492-b385-207c75d15f18", tag: "f64ec6c", timestamp: "2026-10-13T03:02:49.040Z" },
    });
  });

  it("Workers 以外では version が null になる", async () => {
    const res = await GET();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ version: null });
  });
});
