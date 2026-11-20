import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";
const moduleUrl = new URL("./ci-isolated-suite.mjs", import.meta.url);
const subject = existsSync(moduleUrl) ? await import(moduleUrl.href) : {};
function need(name) { assert.equal(typeof subject[name], "function", "Missing isolated runtime behavior: " + name); return subject[name]; }
const valid = () => ({
  suite: "test",
  environment: { CI: "true", DATABASE_URL: "mysql://test_user:dummy@127.0.0.1:3307/mybooklibrary_test" },
  toolchain: { platform: "linux", arch: "x64", nodeVersion: "22.23.4", nodeAbi: "127", npmVersion: "10.9.9",
    nodeExecutable: "/opt/ci-node/bin/node", childNodeExecutable: "/opt/ci-node/bin/node",
    npmCliPath: "/opt/ci-node/lib/node_modules/npm/bin/npm-cli.js", nativeReady: true, workerdReady: true, chromiumReady: true },
  artifacts: { mysqlClient: true, d1Client: true },
});

for (const [name, change] of [
  ["Windows binary", x => { x.toolchain.platform = "win32"; }],
  ["wrong Node ABI", x => { x.toolchain.nodeVersion = "24.18.1"; x.toolchain.nodeAbi = "137"; }],
  ["foreign npm/child Node", x => { x.toolchain.npmVersion = "11.0.0"; x.toolchain.childNodeExecutable = "/usr/bin/node"; }],
  ["missing Chromium", x => { x.toolchain.chromiumReady = false; }],
  ["incompatible native dependency", x => { x.toolchain.nativeReady = false; }],
  ["missing generated client", x => { x.artifacts.d1Client = false; }],
  ["non-test DB", x => { x.environment.DATABASE_URL = "mysql://dummy@production.invalid:3306/real"; }],
  ["external API base", x => { x.environment.CALIL_API_BASE = "https://example.invalid"; }],
  ["non-CI execution", x => { x.environment.CI = "false"; }],
]) test(name + " fails preflight before any app command", async () => {
  const run = need("runRuntimeSuite"), input = valid(), calls = [];
  change(input);
  await assert.rejects(() => run(input, async command => { calls.push(command); return { exitCode: 0 }; }), /runtime|toolchain|node|npm|client|native|browser|chromium|database|DB|API|CI|platform|preflight/i);
  assert.equal(calls.length, 0);
});

test("a suite command failure stops all later commands and preserves its exit", async () => {
  const calls = [];
  const result = await need("runRuntimeSuite")(valid(), async command => { calls.push(command); return { exitCode: 29 }; });
  assert.equal(result.exitCode, 29);
  assert.equal(calls.length, 1);
});

test("unknown suite is rejected rather than running a caller-supplied command", async () => {
  const run = need("runRuntimeSuite"), input = valid(); input.suite = "deploy-production";
  await assert.rejects(() => run(input, async () => { throw Error("should never execute"); }), /suite|runtime/i);
});
