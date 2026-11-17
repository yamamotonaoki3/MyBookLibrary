import { readFileSync } from "node:fs";
import path from "node:path";
import config from "../../../../next.config";
test("all Next response paths receive browser protection, including auth and SW", async () => {
  const rules = typeof config.headers === "function" ? await config.headers() : [];
  const all = rules.find(rule => rule.source === "/:path*");
  expect(all).toBeDefined();
  const headers = Object.fromEntries(all!.headers.map(({ key, value }) => [key.toLowerCase(), value]));
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["permissions-policy"]).toContain("camera=(self)");
  expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
});

import { buildSecurityHeaders } from "@/lib/browserProtection";
test("production forbids evaluation and foreign connections; development keeps HMR/debug support",()=>{
  const prod=buildSecurityHeaders(false).find(h=>h.key==="Content-Security-Policy")!.value;
  const dev=buildSecurityHeaders(true).find(h=>h.key==="Content-Security-Policy")!.value;
  expect(prod).not.toContain("unsafe-eval");expect(prod).not.toContain(" ws:");expect(dev).toContain("unsafe-eval");expect(dev).toContain("ws: wss:");
  expect(prod).toContain("worker-src 'self' blob:");expect(prod).toContain("img-src 'self' http: https: data:");expect(prod).toContain("form-action 'self'");
});

test("Cloudflare ASSETS headers exactly match the production builder for every path", () => {
  const lines = readFileSync(path.resolve(__dirname, "../../../../public/_headers"), "utf8")
    .split(/\r?\n/).filter(line => line.trim() && !line.trimStart().startsWith("#"));
  expect(lines.shift()).toBe("/*");
  const headers = lines.map(line => {
    const match = /^  ([^:]+): (.+)$/.exec(line);
    expect(match).not.toBeNull();
    return { key: match![1], value: match![2] };
  });
  expect(headers).toEqual(buildSecurityHeaders(false));
});
