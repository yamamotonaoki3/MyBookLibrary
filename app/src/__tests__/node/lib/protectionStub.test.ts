import { get } from "node:http";
import type { AddressInfo } from "node:net";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createStubServer } from "../../../../e2e/stub-server";

const fixture = JSON.parse(readFileSync(path.resolve(__dirname, "../../../../e2e/fixtures/external/calil-check.json"), "utf8"));

async function withStub(localReserve: boolean | undefined, run: (origin: string) => Promise<void>) {
  const server = createStubServer(localReserve === undefined ? undefined : { localReserve });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  try {
    await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

function readLocal(url: string): Promise<{ status: number; type: string; body: string }> {
  return new Promise((resolve, reject) => {
    get(url, response => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", chunk => { body += chunk; });
      response.on("end", () => resolve({ status: response.statusCode!, type: String(response.headers["content-type"]), body }));
      response.on("error", reject);
    }).on("error", reject);
  });
}

test("ordinary suites keep the original calil fixture and no reserve page", async () => {
  await withStub(undefined, async origin => {
    expect(JSON.parse((await readLocal(origin + "/check")).body)).toEqual(fixture);
    expect((await readLocal(origin + "/stub/reserve")).status).toBe(404);
  });
});

test("opt-in reserve fixture uses the bound loopback port and serves local HTML", async () => {
  await withStub(true, async origin => {
    const result = JSON.parse((await readLocal(origin + "/check")).body);
    const reserveurl = result.books["9784101010014"].Tokyo_Bunkyo.reserveurl;
    expect(reserveurl).toBe(origin.replace("127.0.0.1", "localhost") + "/stub/reserve");
    expect(result).toEqual({ ...fixture, books: { "9784101010014": { Tokyo_Bunkyo: {
      ...fixture.books["9784101010014"].Tokyo_Bunkyo, reserveurl,
    } } } });
    const page = await readLocal(origin + "/stub/reserve");
    expect(page.status).toBe(200);
    expect(page.type).toContain("text/html");
    expect(page.body).toContain("[E2E_TEST] ローカル予約先");
    expect(page.body).not.toMatch(/https?:|<script|<img/);
    expect(JSON.parse((await readLocal(origin + "/check")).body)).toEqual(result);
  });
  await withStub(false, async origin => {
    expect(JSON.parse((await readLocal(origin + "/check")).body)).toEqual(fixture);
  });
});
