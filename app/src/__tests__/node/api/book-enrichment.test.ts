jest.mock("@/lib/prisma");
jest.mock("@/lib/session");
jest.mock("@/lib/bookEnrichmentWorker", () => ({ processEnrichmentJob: jest.fn() }));
jest.mock("@/lib/auditLog", () => ({
  ...jest.requireActual("@/lib/auditLog"), recordAuditEvent: jest.fn().mockResolvedValue(undefined),
}));

import { randomBytes } from "node:crypto";
import { NextRequest } from "next/server";
import { prismaMock } from "../../helpers/prismaMock";
import { asAdmin, asForbidden } from "../../helpers/sessionMock";
import { processEnrichmentJob } from "@/lib/bookEnrichmentWorker";
import { POST } from "@/app/api/admin/book-enrichment/start/route";
import { GET } from "@/app/api/admin/book-enrichment/tick/route";

const worker = jest.mocked(processEnrichmentJob);
const secret = randomBytes(24).toString("hex");
const originalEnv = { ...process.env };
const request = (token = secret) => new NextRequest("http://localhost/api/admin/book-enrichment/tick", {
  headers: { authorization: `Bearer ${token}` },
});
beforeEach(() => {
  delete process.env.ENRICHMENT_MODE;
  delete process.env.DEMO_MODE;
  process.env.ENRICHMENT_TICK_SECRET = secret;
  worker.mockReset().mockResolvedValue(undefined);
  asAdmin(99);
  prismaMock.bookEnrichmentJob.findFirst.mockResolvedValue(null);
  prismaMock.book.findMany.mockResolvedValue([{ id: 1 }]);
  prismaMock.bookEnrichmentJob.create.mockResolvedValue({ id: 7, totalCount: 1 });
  prismaMock.bookEnrichmentJob.findMany.mockResolvedValue([{ id: 7 }, { id: 8 }]);
});
afterEach(() => { process.env = { ...originalEnv }; jest.restoreAllMocks(); });

it.each(["cron", undefined])("start mode=%s", async (mode) => {
  if (mode) process.env.ENRICHMENT_MODE = mode;
  const res = await POST(new NextRequest("http://localhost/api/admin/book-enrichment/start", { method: "POST" }));
  expect(await res.json()).toEqual({ jobId: 7, totalCount: 1 });
  expect(worker).toHaveBeenCalledTimes(mode === "cron" ? 0 : 1);
  expect(prismaMock.bookEnrichmentJob.create).toHaveBeenCalled();
});
it("startは管理者認可を維持する", async () => {
  asForbidden();
  expect((await POST(request())).status).toBe(403);
  expect(worker).not.toHaveBeenCalled();
});
it("cron tickは全runningを順にawaitし残り予算を渡す", async () => {
  process.env.ENRICHMENT_MODE = "cron";
  let now = 0;
  jest.spyOn(Date, "now").mockImplementation(() => now);
  let release!: () => void;
  worker.mockImplementationOnce(() => new Promise<void>((resolve) => { release = () => { now = 12_000; resolve(); }; }));
  let settled = false;
  const response = GET(request()).then((res) => { settled = true; return res; });
  await new Promise<void>((resolve) => setImmediate(resolve));
  expect(settled).toBe(false);
  expect(worker).toHaveBeenCalledTimes(1);
  release();
  expect(await (await response).json()).toEqual({ processed: [7, 8] });
  expect(prismaMock.bookEnrichmentJob.findMany).toHaveBeenCalledWith({ where: { status: "running" } });
  expect(worker).toHaveBeenNthCalledWith(1, 7, { maxMs: 20_000 });
  expect(worker).toHaveBeenNthCalledWith(2, 8, { maxMs: 8_000 });
});
it("tick全体の予算が尽きたら次のジョブを起動しない", async () => {
  process.env.ENRICHMENT_MODE = "cron";
  let now = 0;
  jest.spyOn(Date, "now").mockImplementation(() => now);
  worker.mockImplementationOnce(async () => { now = 20_001; });
  expect(await (await GET(request())).json()).toEqual({ processed: [7] });
  expect(worker).toHaveBeenCalledTimes(1);
});
it("従来tickはstaleのみをvoidで再開する", async () => {
  worker.mockImplementation(() => new Promise(() => {}));
  expect(await (await GET(request())).json()).toEqual({ resumed: [7, 8] });
  expect(prismaMock.bookEnrichmentJob.findMany).toHaveBeenCalledWith({ where: {
    status: "running", lastTickAt: { lt: expect.any(Date) },
  } });
  expect(worker).toHaveBeenNthCalledWith(1, 7);
});
it.each(["cron", undefined])("tick認証 mode=%s", async (mode) => {
  if (mode) process.env.ENRICHMENT_MODE = mode;
  expect((await GET(request("wrong"))).status).toBe(401);
  delete process.env.ENRICHMENT_TICK_SECRET;
  expect((await GET(request())).status).toBe(500);
  process.env.ENRICHMENT_TICK_SECRET = "short";
  expect((await GET(request())).status).toBe(500);
  process.env.DEMO_MODE = "true";
  expect((await GET(request())).status).toBe(403);
  expect(worker).not.toHaveBeenCalled();
});
