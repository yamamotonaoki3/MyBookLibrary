import assert from "node:assert/strict";
import test from "node:test";
import { rewriteWasmImports } from "./build-worker.mjs";

test("rewrites Prisma 7.10.1's fast wasm import to a relative Worker entry", () => {
  const result = rewriteWasmImports(
    'await import("/app/src/generated/prisma-d1/query_compiler_fast_bg.wasm")'
  );

  assert.deepEqual(result, {
    source: 'await import("./query_compiler_fast_bg.wasm")',
    count: 1,
  });
});

test("rejects a Worker bundle that contains MariaDB adapter and pool implementation", () => {
  const bundle = [
    'var dq = "@prisma/adapter-mariadb";',
    "function poolCallback(config) { return config; }",
    "function dr(value) { return value; }",
    'await import("/app/src/generated/prisma-d1/query_compiler_fast_bg.wasm")',
  ].join("\n");

  assert.throws(() => rewriteWasmImports(bundle), /MariaDB|MySQL/i);
});
