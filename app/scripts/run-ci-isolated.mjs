import { spawn, spawnSync } from "node:child_process";
import { appendFileSync, closeSync, copyFileSync, lstatSync, mkdirSync, mkdtempSync, openSync, readFileSync, readSync, readdirSync, realpathSync, renameSync, writeFileSync } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as wait } from "node:timers/promises";
import { buildIsolationPlan, createArtifactManifest, createSourceManifest, runIsolatedSuite } from "./ci-isolation.mjs";

const NODE_ARCHIVE_SHA = "1805bcd35e6815559bd2eb97db438d3fdb0eb3a5e6a977b7c1badca76337e9ce";
function sha(file) {
  const hash = createHash("sha256"), fd = openSync(file, "r"), buffer = Buffer.alloc(64 * 1024);
  try { let length; while ((length = readSync(fd, buffer, 0, buffer.length, null)) > 0) hash.update(buffer.subarray(0, length)); }
  finally { closeSync(fd); }
  return hash.digest("hex");
}
function regularFiles(root, relative = "") {
  const files = [];
  for (const name of readdirSync(path.join(root, relative))) {
    const value = relative ? relative + "/" + name : name, stat = lstatSync(path.join(root, value));
    if (stat.isSymbolicLink()) throw Error("Artifact link prohibited");
    if (stat.isDirectory()) files.push(...regularFiles(root, value));
    else if (stat.isFile()) files.push(value);
    else throw Error("Artifact type prohibited");
  }
  return files;
}
const gitEnv = { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null", GIT_TEMPLATE_DIR: "" };

function command(program, args, { cwd, env, allowFailure = false, encoding = "utf8" } = {}) {
  const result = spawnSync(program, args, { cwd, env, encoding, windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  if (result.status !== 0 && !allowFailure) throw Error(program + " " + args[0] + " failed (exit " + result.status + ")");
  return result;
}
const git = (root, args) => command("git", args, { cwd: root, env: gitEnv }).stdout;
const docker = args => command("docker", args).stdout;
function parseEnvironment(entries) {
  const result = {};
  for (const entry of entries ?? []) { const index = entry.indexOf("="); if (index <= 0) throw Error("Invalid image environment"); result[entry.slice(0, index)] = entry.slice(index + 1); }
  return result;
}

function archiveEntries(file, prefix) {
  const names = command("tar", ["-tf", file]).stdout.split(/\r?\n/).filter(Boolean);
  if (!names.length || names.some(name => {
    const value = name.replace(/^\.\//, "").replace(/\/$/, "");
    return path.isAbsolute(value) || /^[a-z]:/i.test(value) || value.includes("\\") || value.split("/").includes("..") ||
      (prefix && ![prefix].flat().some(allowed => value === allowed || value.startsWith(allowed + "/")));
  })) throw Error("Prepared archive contains an unsafe path");
}

function prepareSource(root, inputs, temporary) {
  const tracked = git(root, ["ls-files", "-z"]).split("\0").filter(Boolean);
  const local = inputs.localManifest ? JSON.parse(readFileSync(inputs.localManifest, "utf8")) : null;
  if (!local && process.env.GITHUB_ACTIONS !== "true") throw Error("Local validation requires an explicit approved input manifest");
  if (local && Object.keys(local).some(key => !["newFiles", "trackedChanges"].includes(key))) throw Error("Unknown approved manifest field");
  const changes = git(root, ["diff", "HEAD", "--name-only", "-z"]).split("\0").filter(Boolean);
  const trackedChanges = local?.trackedChanges ?? {};
  if (typeof trackedChanges !== "object" || Array.isArray(trackedChanges)) throw Error("Invalid approved tracked changes");
  const expectedChanges = Object.keys(trackedChanges), trackedPaths = new Set(tracked), changedPaths = new Set(changes);
  if (changes.some(name => !Object.hasOwn(trackedChanges, name)) ||
      expectedChanges.some(name => !trackedPaths.has(name) || !changedPaths.has(name) ||
        typeof trackedChanges[name] !== "string" || !/^[a-f0-9]{64}$/.test(trackedChanges[name]))) throw Error("Unapproved tracked working-copy change");
  if (expectedChanges.length) {
    const approved = createSourceManifest({ root, mode: "local", trackedFiles: expectedChanges, baselineHashes: trackedChanges });
    if (approved.entries.some(item => item.sha256 !== trackedChanges[item.path])) throw Error("Unapproved tracked working-copy change");
  }
  const controls = new Map();
  if (local) for (const name of tracked.filter(name => ["AGENTS.md", "CLAUDE.md"].includes(path.posix.basename(name)))) {
    controls.set(name, command("git", ["show", "HEAD:" + name], { cwd: root, env: gitEnv, encoding: null }).stdout);
  }
  // Local private working instructions never enter staging; clean committed bytes preserve real docs and line endings.
  const manifest = createSourceManifest({ root, mode: local ? "local" : "ci", trackedFiles: tracked.filter(name => !controls.has(name)), approvedNewFiles: local?.newFiles ?? {} });
  for (const [name, bytes] of controls) manifest.entries.push({ path: name, sha256: createHash("sha256").update(bytes).digest("hex") });
  manifest.entries.sort((a, b) => a.path.localeCompare(b.path));
  const staging = path.join(temporary, "source");
  mkdirSync(staging);
  for (const item of manifest.entries) {
    const destination = path.join(staging, item.path);
    mkdirSync(path.dirname(destination), { recursive: true });
    if (controls.has(item.path)) writeFileSync(destination, controls.get(item.path));
    else copyFileSync(path.join(root, item.path), destination);
    if (sha(destination) !== item.sha256) throw Error("Source changed while staging");
  }
  command("git", ["-c", "init.templateDir=", "init", "--quiet"], { cwd: staging, env: gitEnv });
  const list = path.join(temporary, "source-paths.nul");
  writeFileSync(list, manifest.entries.map(item => item.path).join("\0") + "\0");
  command("git", ["-c", "core.autocrlf=false", "add", "--pathspec-from-file=" + list, "--pathspec-file-nul"], { cwd: staging, env: gitEnv });
  const sourceTar = path.join(temporary, "ci-input", "source.tar");
  command("tar", ["-cf", sourceTar, "-C", staging, "."]);
  const publicManifest = { entries: manifest.entries, lockSha256: sha(path.join(root, "app/package-lock.json")),
    schemaSha256: sha(path.join(root, "app/prisma/schema.prisma")), d1SchemaSha256: sha(path.join(root, "app/prisma/d1/schema.prisma")) };
  writeFileSync(path.join(temporary, "ci-input", "source-manifest.json"), JSON.stringify(publicManifest));
  return publicManifest;
}

function prepareArchives(root, inputs, temporary, source) {
  const input = path.join(temporary, "ci-input"), nodeTar = path.join(input, "node.tar"), dependenciesTar = path.join(input, "dependencies.tar");
  let nodeStrip = 0;
  if (inputs.nodeArchive) {
    if (sha(inputs.nodeArchive) !== NODE_ARCHIVE_SHA) throw Error("Prepared Linux Node archive SHA mismatch");
    archiveEntries(inputs.nodeArchive, "node-v22.23.4-linux-x64");
    command("tar", ["-cf", nodeTar, "@" + inputs.nodeArchive]);
    archiveEntries(nodeTar, "node-v22.23.4-linux-x64");
    nodeStrip = 1;
  } else {
    if (process.platform !== "linux" || process.arch !== "x64" || process.versions.node !== "22.23.4" || process.versions.modules !== "127") throw Error("Preparation needs the exact Linux Node22 toolchain");
    const prefix = path.dirname(path.dirname(realpathSync(process.execPath)));
    if (JSON.parse(readFileSync(path.join(prefix, "lib/node_modules/npm/package.json"), "utf8")).version !== "10.9.9") throw Error("Preparation npm version mismatch");
    command("tar", ["-cf", nodeTar, "-C", prefix, "bin/node", "bin/npm", "bin/npx", "lib/node_modules/npm"]);
    archiveEntries(nodeTar);
  }
  if (inputs.dependenciesArchive) {
    if (!inputs.dependenciesMetadata) throw Error("Prepared dependencies need provenance metadata");
    const meta = JSON.parse(readFileSync(inputs.dependenciesMetadata, "utf8"));
    if (meta.sha256 !== sha(inputs.dependenciesArchive) || meta.lockSha256 !== source.lockSha256 || meta.platform !== "linux" || meta.schemaSha256 !== source.schemaSha256 || meta.d1SchemaSha256 !== source.d1SchemaSha256) throw Error("Prepared dependency source/lock SHA mismatch");
    archiveEntries(inputs.dependenciesArchive, ["node_modules", "src/generated/prisma", "src/generated/prisma-d1"]);
    copyFileSync(inputs.dependenciesArchive, dependenciesTar);
  } else {
    if (process.platform !== "linux") throw Error("Host Windows dependencies cannot enter the runtime");
    command("tar", ["-cf", dependenciesTar, "-C", path.join(root, "app"), "node_modules", "src/generated/prisma", "src/generated/prisma-d1"]);
    archiveEntries(dependenciesTar, ["node_modules", "src/generated/prisma", "src/generated/prisma-d1"]);
  }
  writeFileSync(path.join(input, "bootstrap.json"), JSON.stringify({ nodeStrip, nodeArchiveSha256: sha(nodeTar), dependenciesSha256: sha(dependenciesTar) }));
  return nodeStrip;
}

const requiredArtifacts = suite => suite === "test"
  ? ["suite-result.json", "reports/coverage/coverage-final.json", "reports/playwright-report/index.html", "reports/playwright-report-pwa/index.html"]
  : ["suite-result.json", "logs/" + (suite === "worker" ? "worker-smoke" : "integration-d1") + ".log"];

function assertActive(signal) {
  if (signal?.aborted) throw Object.assign(Error("Isolated run cancelled"), { exitCode: signal.reason === "SIGINT" ? 130 : 143 });
}

async function executeDocker(args, signal) {
  return new Promise((resolve, reject) => {
    assertActive(signal);
    const child = spawn("docker", args, { windowsHide: true, stdio: "inherit" });
    const abort = () => child.kill("SIGTERM");
    const cleanup = () => signal?.removeEventListener("abort", abort);
    signal?.addEventListener("abort", abort, { once: true });
    child.once("error", error => { cleanup(); reject(error); });
    child.once("close", (code, terminated) => {
      cleanup();
      resolve({ exitCode: code ?? (terminated === "SIGINT" ? 130 : 143) });
    });
    if (signal?.aborted) abort();
  });
}

function createAdapters(plan, temporary, nodeStrip) {
  const imageInfo = new Map(plan.resources.map(spec => [spec.image, JSON.parse(docker(["image", "inspect", spec.image]))[0]]));
  for (const [id, info] of imageInfo) if (info.Id !== id || info.Os !== "linux" || info.Architecture !== "amd64") throw Error("Resolved runtime image platform mismatch");
  const password = randomBytes(24).toString("hex"), rootPassword = randomBytes(24).toString("hex");
  const fixed = {
    app: {
      CI: "true", CI_ISOLATED_RUNTIME: "1", HOME: "/tmp/ci-home", NODE_VERSION: "22.23.4",
      PATH: "/opt/ci-node/bin:/workspace/app/node_modules/.bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
      PLAYWRIGHT_BROWSERS_PATH: "/ms-playwright", NEXT_TELEMETRY_DISABLED: "1", WRANGLER_SEND_METRICS: "false", WRANGLER_SEND_ERROR_REPORTS: "false",
      npm_config_offline: "true", npm_config_audit: "false", npm_config_fund: "false", PRISMA_HIDE_UPDATE_MESSAGE: "1", CHECKPOINT_DISABLE: "1",
      DB_PROVIDER: plan.suite === "test" ? "mysql" : "d1", D1_RUNTIME: plan.suite === "integration-d1" ? "node" : "workers",
      ...(plan.suite === "test" ? { DATABASE_URL: "mysql://ci_test_user:" + password + "@127.0.0.1:3307/mybooklibrary_test" } : {}),
    },
    mysql: { MYSQL_ROOT_PASSWORD: rootPassword, MYSQL_DATABASE: "mybooklibrary_test", MYSQL_USER: "ci_test_user", MYSQL_PASSWORD: password },
  };
  const observations = [];
  const environment = spec => ({ ...parseEnvironment(imageInfo.get(spec.image).Config.Env), ...fixed[spec.kind] });
  const adapter = {
    async environment(spec) { return environment(spec); },
    async create(spec) {
      const args = ["create", "--pull", "never", "--name", spec.name, "--network", spec.network];
      for (const [key, value] of Object.entries(spec.labels)) args.push("--label", key + "=" + value);
      for (const [key, value] of Object.entries(fixed[spec.kind])) args.push("--env", key + "=" + value);
      if (spec.kind === "mysql") args.push("--tmpfs", "/var/lib/mysql:rw,nosuid,nodev,size=1g");
      else args.push("--cap-drop", "ALL", "--security-opt", "no-new-privileges");
      args.push(spec.image, ...(spec.kind === "mysql" ? ["--port=3307", "--bind-address=127.0.0.1", "--mysqlx=OFF"] : ["/bin/sleep", "infinity"]));
      return docker(args).trim();
    },
    async inspect(id) {
      const value = JSON.parse(docker(["inspect", id]))[0];
      observations.push({ id: value.Id, image: value.Image, network: value.HostConfig.NetworkMode,
        environmentKeys: Object.keys(parseEnvironment(value.Config.Env)).sort(), portBindings: value.HostConfig.PortBindings,
        binds: value.HostConfig.Binds, tmpfs: value.HostConfig.Tmpfs, privileged: value.HostConfig.Privileged,
        capAdd: value.HostConfig.CapAdd, state: value.State, mounts: value.Mounts.map(mount => ({ type: mount.Type, destination: mount.Destination })) });
      return value;
    },
    async start(id) { docker(["start", id]); },
    async ready(id, { signal } = {}) {
      assertActive(signal);
      const deadline = Date.now() + 60_000;
      while (Date.now() < deadline) {
        assertActive(signal);
        const probe = command("docker", ["exec", "--env", "MYSQL_PWD=" + password, id, "mysql", "--protocol=TCP", "--host=127.0.0.1", "--port=3307", "--user=ci_test_user", "--database=mybooklibrary_test", "--batch", "--skip-column-names", "--execute=SELECT 1"], { allowFailure: true });
        assertActive(signal);
        if (probe.status === 0 && probe.stdout.trim() === "1") return;
        await wait(500, undefined, { signal });
      }
      assertActive(signal);
      throw Error("Authenticated TCP test database readiness failed");
    },
    async execute(id, suite, { signal }) {
      assertActive(signal);
      docker(["exec", id, "mkdir", "-p", "/opt/ci-node", "/workspace", "/ci-output"]);
      assertActive(signal);
      docker(["exec", id, "tar", "--no-same-owner", "-xf", "/ci-input/node.tar", "-C", "/opt/ci-node", ...(nodeStrip ? ["--strip-components=1"] : [])]);
      assertActive(signal);
      docker(["exec", id, "tar", "--no-same-owner", "-xf", "/ci-input/source.tar", "-C", "/workspace"]);
      assertActive(signal);
      docker(["exec", id, "tar", "--no-same-owner", "-xf", "/ci-input/dependencies.tar", "-C", "/workspace/app"]);
      return executeDocker(["exec", "--workdir", "/workspace/app", id, "/opt/ci-node/bin/node", "scripts/run-ci-isolated-suite.mjs", suite], signal);
    },
    async stop(id) { const state = JSON.parse(docker(["inspect", id]))[0].State; if (state.Running) docker(["stop", "--time", "10", id]); },
    async remove(id) { docker(["rm", id]); observations.push({ id, removed: true }); },
  };
  let output;
  const files = {
    async stage(id) { docker(["cp", path.join(temporary, "ci-input") + path.sep + ".", id + ":/ci-input"]); },
    async collect(id, current) {
      // Validate every output link inside the owned container before Docker copies anything.
      const check = "import fs from 'node:fs'; import path from 'node:path'; import {createArtifactManifest} from './scripts/ci-isolation.mjs'; const root='/ci-output'; const all=[]; function walk(rel=''){ for(const e of fs.readdirSync(path.join(root,rel),{withFileTypes:true})){const p=rel?rel+'/'+e.name:e.name; if(e.isSymbolicLink())throw Error('Artifact link prohibited'); if(e.isDirectory())walk(p); else if(e.isFile())all.push(p); else throw Error('Artifact type prohibited');}} walk(); let requiredError; try{createArtifactManifest({root,requiredPaths:JSON.parse(process.argv[1])});}catch(error){requiredError=String(error.message);} console.log(JSON.stringify({...createArtifactManifest({root,requiredPaths:all}),requiredError}));";
      const expected = JSON.parse(docker(["exec", "--workdir", "/workspace/app", id, "/opt/ci-node/bin/node", "--input-type=module", "-e", check, JSON.stringify(requiredArtifacts(current.suite))]));
      const staging = path.join(temporary, "collected");
      mkdirSync(staging);
      docker(["cp", id + ":/ci-output/.", staging]);
      const actual = createArtifactManifest({ root: staging, requiredPaths: regularFiles(staging) });
      if (actual.entries.length !== expected.entries.length) throw Error("Artifact entries changed during collection");
      const hashes = new Map(expected.entries.map(item => [item.path, item.sha256]));
      if (actual.entries.some(item => hashes.get(item.path) !== item.sha256)) throw Error("Artifacts changed during collection");
      output = path.join(temporary, "artifacts");
      renameSync(staging, output);
      if (expected.requiredError) throw Error("Required artifacts: " + expected.requiredError);
    },
  };
  return { docker: adapter, files, output: () => output, observations };
}

export async function finalizeIsolatedResult(result, signal, publish) {
  publish();
  await new Promise(resolve => setImmediate(resolve));
  const exitCode = result.exitCode || (signal.aborted ? (signal.reason === "SIGINT" ? 130 : 143) : 0);
  if (exitCode !== result.exitCode) {
    result.exitCode = exitCode;
    publish();
  }
  return exitCode;
}

export async function main(suite) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const images = { runtime: process.env.CI_ISOLATION_RUNTIME_IMAGE, ...(suite === "test" ? { mysql: process.env.CI_ISOLATION_MYSQL_IMAGE } : {}) };
  const runId = process.env.CI_ISOLATION_RUN_ID ?? ((process.env.GITHUB_RUN_ID ?? "local") + "-" + randomBytes(5).toString("hex"));
  const plan = buildIsolationPlan({ suite, runId, images });
  const inputs = { localManifest: process.env.CI_ISOLATION_LOCAL_MANIFEST, nodeArchive: process.env.CI_ISOLATION_NODE_ARCHIVE,
    dependenciesArchive: process.env.CI_ISOLATION_DEPENDENCIES_ARCHIVE, dependenciesMetadata: process.env.CI_ISOLATION_DEPENDENCIES_METADATA };
  if (inputs.nodeArchive && process.platform !== "win32") {
    throw Error("CI_ISOLATION_NODE_ARCHIVE is Windows-only; Linux must use the default exact Node 22 preparation.");
  }
  const temporary = mkdtempSync(path.join(os.tmpdir(), "mbl-ci-" + runId + "-"));
  mkdirSync(path.join(temporary, "ci-input"));
  const source = prepareSource(root, inputs, temporary);
  const strip = prepareArchives(root, inputs, temporary, source);
  const adapters = createAdapters(plan, temporary, strip);
  const controller = new AbortController();
  for (const name of ["SIGINT", "SIGTERM"]) process.once(name, () => {
    controller.abort(name);
    if (!process.exitCode) process.exitCode = name === "SIGINT" ? 130 : 143;
  });
  const result = await runIsolatedSuite(plan, { ...adapters, signal: controller.signal });
  const artifactDirectory = adapters.output();
  return finalizeIsolatedResult(result, controller.signal, () => {
    const record = { ...result, suite, runId, sourceFiles: source.entries.length, lockSha256: source.lockSha256,
      bootstrap: JSON.parse(readFileSync(path.join(temporary, "ci-input/bootstrap.json"), "utf8")), isolation: adapters.observations, artifactDirectory };
    writeFileSync(path.join(temporary, "host-result.json"), JSON.stringify(record, null, 2));
    if (artifactDirectory) {
      const evidence = { ...record, artifactDirectory: undefined, isolation: record.isolation.map(({ state, ...observation }) => ({
        ...observation, ...(state ? { state: { Status: state.Status, Running: state.Running, ExitCode: state.ExitCode } } : {}),
      })) };
      writeFileSync(path.join(artifactDirectory, "host-result.json"), JSON.stringify(evidence, null, 2));
    }
    if (process.env.GITHUB_OUTPUT && artifactDirectory) appendFileSync(process.env.GITHUB_OUTPUT, "artifacts=" + artifactDirectory + "\n");
    console.log(JSON.stringify({ suite, runId, exitCode: result.exitCode, secondaryErrors: result.secondaryErrors, evidence: temporary }));
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv[2]).then(code => { process.exitCode = code; }).catch(error => { console.error(String(error.message ?? error)); process.exitCode = 1; });
}
