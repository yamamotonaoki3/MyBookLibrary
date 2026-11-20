const SUITES = new Set(["test", "integration-d1", "worker"]);
const NODE = "/opt/ci-node/bin/node";
const NPM = "/opt/ci-node/lib/node_modules/npm/bin/npm-cli.js";

export function validateRuntimeEnvironment({ suite, environment, toolchain, artifacts }) {
  if (!SUITES.has(suite)) throw Error("Unknown isolated runtime suite");
  if (!environment || environment.CI !== "true") throw Error("Runtime CI must be true");
  if (!toolchain || toolchain.platform !== "linux" || toolchain.arch !== "x64" ||
      toolchain.nodeVersion !== "22.23.4" || toolchain.nodeAbi !== "127" || toolchain.npmVersion !== "10.9.9" ||
      toolchain.nodeExecutable !== NODE || toolchain.childNodeExecutable !== NODE || toolchain.npmCliPath !== NPM) {
    throw Error("Runtime Node/npm Linux toolchain or child PATH does not match the prepared version");
  }
  if (toolchain.nativeReady !== true || toolchain.workerdReady !== true) throw Error("Runtime native/workerd preflight is incomplete");
  if (suite === "test" && toolchain.chromiumReady !== true) throw Error("Runtime Chromium preflight is incomplete");
  if (!artifacts || artifacts.mysqlClient !== true || artifacts.d1Client !== true) throw Error("Generated runtime client artifacts are missing");
  if (suite === "test") {
    let url;
    try { url = new URL(environment.DATABASE_URL); } catch { throw Error("Invalid runtime test database URL"); }
    if (url.protocol !== "mysql:" || !["localhost", "127.0.0.1"].includes(url.hostname) || url.port !== "3307" || url.pathname !== "/mybooklibrary_test") {
      throw Error("Runtime database must be the loopback test DB at port3307");
    }
  }
  for (const key of ["RAKUTEN_API_BASE", "NDL_API_BASE", "NDL_SRU_BASE", "CALIL_API_BASE"]) {
    if (environment[key] === undefined) continue;
    let url;
    try { url = new URL(environment[key]); } catch { throw Error("Invalid runtime API base"); }
    if (url.protocol !== "http:" || !["localhost", "127.0.0.1"].includes(url.hostname) || url.port !== "3999" || url.username || url.password) {
      throw Error("Runtime API base must use the loopback stub");
    }
  }
}

function commands(suite) {
  if (suite === "test") return [
    { key: "d1-migrations", tool: "npm", args: ["run", "d1:migration:check"] },
    { key: "worker-build-unit", tool: "npm", args: ["run", "test:worker-build"] },
    { key: "isolation-unit", tool: "node", args: ["--test", "scripts/ci-isolation.test.mjs", "scripts/ci-isolated-suite.test.mjs"] },
    { key: "jest", tool: "npm", args: ["run", "test", "--", "--coverage"] },
    { key: "integration-mysql", tool: "npm", args: ["run", "test:integration"] },
    { key: "e2e", tool: "npm", args: ["run", "test:e2e"] },
    { key: "e2e-cron", tool: "playwright", args: ["test", "e2e/book-enrichment-cron.spec.ts"], cronTick: true },
    { key: "e2e-demo", tool: "npm", args: ["run", "test:e2e:demo"] },
    { key: "pwa-build", tool: "npm", args: ["run", "build:test:pwa"] },
    { key: "e2e-pwa", tool: "npm", args: ["run", "test:e2e:pwa"] },
  ];
  if (suite === "integration-d1") return [
    { key: "integration-d1", tool: "npm", args: ["run", "test:integration:d1"] },
  ];
  return [
    { key: "worker-build", tool: "npm", args: ["run", "build:worker"] },
    { key: "worker-size", tool: "wrangler", args: ["deploy", "--dry-run", "--outdir", "/tmp/ci-worker-dist"], sizeCheck: true, noDemo: true },
    { key: "staging-config", tool: "wrangler", args: ["deploy", "--dry-run", "--env", "staging", "--outdir", "/tmp/ci-worker-dist-staging"], expectedDatabase: "mybooklibrary-staging-db", noDemo: true },
    { key: "demo-config", tool: "wrangler", args: ["deploy", "--dry-run", "--env", "demo", "--outdir", "/tmp/ci-worker-dist-demo"], expectedDatabase: "mybooklibrary-demo-db", requireDemo: true },
    { key: "worker-smoke", tool: "npm", args: ["run", "smoke:worker"] },
  ];
}

export async function runRuntimeSuite(input, execute) {
  validateRuntimeEnvironment(input);
  const completed = [];
  for (const command of commands(input.suite)) {
    const result = await execute(command);
    if (!Number.isInteger(result?.exitCode) || result.exitCode < 0 || result.exitCode > 255) throw Error("Invalid runtime command exit");
    completed.push({ key: command.key, exitCode: result.exitCode });
    if (result.exitCode !== 0) return { exitCode: result.exitCode, completed };
    if (command.sizeCheck) {
      const size = Number(/gzip:\s*([0-9.]+)/.exec(result.stdout ?? "")?.[1]);
      if (!(size > 0 && size < 10240)) return { exitCode: 1, completed, error: "Worker gzip size check failed" };
    }
    if ((command.noDemo && /DEMO_MODE/.test(result.stdout ?? "")) ||
        (command.requireDemo && !/DEMO_MODE/.test(result.stdout ?? "")) ||
        (command.expectedDatabase && !(result.stdout ?? "").includes(command.expectedDatabase))) {
      return { exitCode: 1, completed, error: "Worker configuration check failed" };
    }
  }
  return { exitCode: 0, completed };
}
