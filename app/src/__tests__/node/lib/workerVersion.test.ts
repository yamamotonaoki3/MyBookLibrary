import { getWorkerVersion } from "@/lib/workerVersion";

const CLOUDFLARE_CONTEXT = Symbol.for("__cloudflare-context__");
const globals = globalThis as Record<symbol, unknown>;

function setBinding(binding: unknown) {
  globals[CLOUDFLARE_CONTEXT] = { env: { CF_VERSION_METADATA: binding } };
}

afterEach(() => {
  delete globals[CLOUDFLARE_CONTEXT];
});

describe("getWorkerVersion", () => {
  it("Workers のバインディングから、バージョン ID・タグ・時刻を返す", () => {
    setBinding({ id: "0e771b49-5bdf-4492-b385-207c75d15f18", tag: "f64ec6c", timestamp: "2026-10-13T03:02:49.040Z" });

    expect(getWorkerVersion()).toEqual({
      id: "0e771b49-5bdf-4492-b385-207c75d15f18",
      tag: "f64ec6c",
      timestamp: "2026-10-13T03:02:49.040Z",
    });
  });

  it("タグ・時刻が空のときは null にする", () => {
    setBinding({ id: "0e771b49-5bdf-4492-b385-207c75d15f18", tag: "", timestamp: undefined });

    expect(getWorkerVersion()).toEqual({ id: "0e771b49-5bdf-4492-b385-207c75d15f18", tag: null, timestamp: null });
  });

  it("Workers 以外（コンテキストなし）では null を返す", () => {
    expect(getWorkerVersion()).toBeNull();
  });

  it("バインディングが無い、または ID が無いときは null を返す", () => {
    globals[CLOUDFLARE_CONTEXT] = { env: {} };
    expect(getWorkerVersion()).toBeNull();

    setBinding({ tag: "f64ec6c" });
    expect(getWorkerVersion()).toBeNull();
  });
});
