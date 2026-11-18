import { spawn, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync, appendFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { randomBytes, createHash } from "node:crypto";
import { runRuntimeSuite } from "./ci-isolated-suite.mjs";
import { createSourceManifest, createArtifactManifest } from "./ci-isolation.mjs";

const NODE = "/opt/ci-node/bin/node";
const NPM = "/opt/ci-node/lib/node_modules/npm/bin/npm-cli.js";
const OUTPUT = "/ci-output";
const require = createRequire(import.meta.url);

function probe(executable, args) {
  const result = spawnSync(executable, args, { encoding: "utf8", windowsHide: true });
  return { ok: result.status === 0, text: result.stdout?.trim() ?? "" };
}

function validateCopiedSource() {
  const supplied = JSON.parse(readFileSync("/ci-input/source-manifest.json", "utf8"));
  const actual = createSourceManifest({ root: "/workspace", mode: "ci", trackedFiles: supplied.entries.map(item => item.path) });
  const expected = new Map(supplied.entries.map(item => [item.path, item.sha256]));
  if (actual.entries.some(item => expected.get(item.path) !== item.sha256)) throw Error("Copied source hash changed");
  return supplied;
}

export async function toolchain(suite) {
  const child = probe("node", ["-p", "process.execPath"]);
  const native = probe(NODE, ["-e", "require('sharp'); require('@next/swc-linux-x64-gnu');"]);
  const workerd = probe(path.resolve("node_modules/@cloudflare/workerd-linux-64/bin/workerd"), ["--version"]);
  let chromiumReady = false, playwright;
  if (suite === "test") {
    const packagePath = require.resolve("playwright-core/package.json");
    const metadata = JSON.parse(readFileSync(packagePath, "utf8"));
    const browsers = JSON.parse(readFileSync(path.join(path.dirname(packagePath), "browsers.json"), "utf8")).browsers;
    const expectedVersion = "151.0.7922.34";
    const binaries = ["chromium", "chromium-headless-shell"].map(name => {
      const entry = browsers.find(browser => browser.name === name);
      return { name, revision: entry?.revision, browserVersion: entry?.browserVersion };
    });
    if (metadata.version !== "1.62.1" || binaries.some(binary => binary.revision !== "1234" || binary.browserVersion !== expectedVersion)) {
      throw Error("Installed Playwright/Chromium revision or version mismatch");
    }
    const { chromium } = require("playwright-core");
    const executablePath = chromium.executablePath(), ordinary = probe(executablePath, ["--version"]);
    const ordinaryVersion = /(?:^|\s)(\d+\.\d+\.\d+\.\d+)(?:\s|$)/.exec(ordinary.text)?.[1] ?? "";
    let browser, headlessVersion;
    try {
      browser = await chromium.launch({ headless: true });
      headlessVersion = browser.version();
    } finally { if (browser) await browser.close(); }
    playwright = { version: metadata.version, browsers: [
      { ...binaries[0], executablePath, reportedVersion: ordinaryVersion, ready: ordinary.ok && ordinaryVersion === expectedVersion },
      { ...binaries[1], reportedVersion: headlessVersion, ready: headlessVersion === expectedVersion },
    ] };
    chromiumReady = playwright.browsers.every(binary => binary.ready);
  }
  return {
    platform: process.platform, arch: process.arch, nodeVersion: process.versions.node, nodeAbi: process.versions.modules,
    npmVersion: probe(NODE, [NPM, "--version"]).text,
    nodeExecutable: realpathSync(process.execPath), childNodeExecutable: child.text,
    npmCliPath: realpathSync(NPM), nativeReady: native.ok, workerdReady: workerd.ok, chromiumReady, playwright,
    glibc: process.report.getReport().header.glibcVersionRuntime,
  };
}

function execute(command) {
  const tools = {
    npm: [NPM], node: [], playwright: [path.resolve("node_modules/@playwright/test/cli.js")],
    wrangler: [path.resolve("node_modules/wrangler/bin/wrangler.js")],
  };
  if (!(command.tool in tools)) throw Error("Unknown fixed runtime tool");
  const log = path.join(OUTPUT, "logs", command.key + ".log");
  const env = { ...process.env, NEXT_FONT_GOOGLE_MOCKED_RESPONSES: path.resolve("e2e/font-mocks.cjs") };
  if (command.cronTick) { env.ENRICHMENT_MODE = "cron"; env.ENRICHMENT_TICK_SECRET = randomBytes(16).toString("hex"); }
  console.log("isolated step: " + command.key);
  return new Promise((resolve, reject) => {
    const child = spawn(NODE, [...tools[command.tool], ...command.args], { cwd: "/workspace/app", env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    const record = chunk => { appendFileSync(log, chunk); if (stdout.length < 8 * 1024 * 1024) stdout += chunk.toString(); };
    child.stdout.on("data", record); child.stderr.on("data", record);
    child.on("error", reject);
    child.on("close", (code, signal) => resolve({ exitCode: code ?? (signal === "SIGINT" ? 130 : 143), stdout }));
  });
}

function collectReports(suite) {
  if (suite !== "test") return;
  const representatives = ["coverage/coverage-final.json", "playwright-report/index.html", "playwright-report-pwa/index.html"];
  for (const directory of ["coverage", "playwright-report", "playwright-report-pwa"]) {
    if (!existsSync(directory)) continue;
    const manifest = createArtifactManifest({ root: "/workspace/app", requiredPaths: [directory] });
    for (const item of manifest.entries) {
      const destination = path.join(OUTPUT, "reports", item.path);
      mkdirSync(path.dirname(destination), { recursive: true });
      copyFileSync(path.join("/workspace/app", item.path), destination);
    }
  }
  createArtifactManifest({ root: "/workspace/app", requiredPaths: representatives });
}

export async function main(suite) {
  // Fail before reading app env or executing dependencies if invoked outside the owned runtime.
  if (process.env.CI_ISOLATED_RUNTIME !== "1" || process.platform !== "linux" || process.arch !== "x64" ||
      realpathSync(process.execPath) !== NODE || process.cwd() !== "/workspace/app") throw Error("Owned Linux runtime entry is required");
  if (!["test", "integration-d1", "worker"].includes(suite)) throw Error("Unknown isolated suite");
  for (const name of [".env", ".env.local", ".env.test", ".dev.vars"]) if (existsSync(name)) throw Error("Unexpected real or stale app env input");
  mkdirSync(path.join(OUTPUT, "logs"), { recursive: true });
  const interfaces = os.networkInterfaces();
  if (Object.values(interfaces).flat().some(address => !address.internal)) throw Error("Runtime has a non-loopback interface");
  const source = validateCopiedSource();
  const versions = await toolchain(suite);
  const environment = { CI: process.env.CI, DATABASE_URL: process.env.DATABASE_URL };
  for (const key of ["RAKUTEN_API_BASE", "NDL_API_BASE", "NDL_SRU_BASE", "CALIL_API_BASE"]) if (process.env[key] !== undefined) environment[key] = process.env[key];
  const artifacts = { mysqlClient: existsSync("src/generated/prisma/index.js"), d1Client: existsSync("src/generated/prisma-d1/index.js") };
  if (suite === "test") {
    const values = { DATABASE_URL: environment.DATABASE_URL, RAKUTEN_APP_ID: "dummy", RAKUTEN_ACCESS_KEY: "dummy", CALIL_API_KEY: "dummy",
      AUTH_SECRET: randomBytes(32).toString("hex"), CRON_SECRET: randomBytes(32).toString("hex"), AUTH_TRUST_HOST: "true" };
    writeFileSync(".env.test", Object.entries(values).map(([key, value]) => key + "=" + JSON.stringify(value)).join("\n") + "\n");
  }
  let result = { exitCode: 1 }, artifactError;
  try { result = await runRuntimeSuite({ suite, environment, toolchain: versions, artifacts }, execute); }
  catch (error) { result = { exitCode: 1, error: String(error.message ?? error) }; }
  try { collectReports(suite); } catch (error) { artifactError = String(error.message ?? error); }
  if (result.exitCode === 0 && artifactError) result.exitCode = 1;
  const report = { ...result, suite, artifactError, toolchain: versions, environmentKeys: Object.keys(process.env).sort(),
    interfaces, sourceFiles: source.entries.length, sourceManifestSha256: createHash("sha256").update(JSON.stringify(source)).digest("hex") };
  writeFileSync(path.join(OUTPUT, "suite-result.json"), JSON.stringify(report, null, 2));
  console.log("isolated suite finished: " + suite + " exit=" + result.exitCode);
  return result.exitCode;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv[2]).then(code => { process.exitCode = code; }).catch(error => { console.error(String(error.message ?? error)); process.exitCode = 1; });
}
