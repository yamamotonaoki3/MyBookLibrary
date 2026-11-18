import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, writeFileSync, mkdirSync, symlinkSync, existsSync, copyFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

const implementationUrl = new URL("./ci-isolation.mjs", import.meta.url);
// Before implementation the RED is an assertion about the missing policy, not an import/parse failure.
const subject = existsSync(implementationUrl) ? await import(implementationUrl.href) : {};
function need(name) {
  assert.equal(typeof subject[name], "function", "Missing CI isolation behavior: " + name);
  return subject[name];
}
const images = { runtime: "sha256:" + "a".repeat(64), mysql: "sha256:" + "b".repeat(64) };
const input = { suite: "test", runId: "test-run-1", images };
const ownerKey = "io.mybooklibrary.ci-run";
const suiteKey = "io.mybooklibrary.ci-suite";

function inspect(id, spec) {
  const isDb = spec.kind === "mysql";
  return {
    Id: id, Image: spec.image, Name: "/" + spec.name,
    Config: { Labels: { [ownerKey]: "test-run-1", [suiteKey]: "test" }, ExposedPorts: isDb ? { "3306/tcp": {} } : {}, Env: ["CI=true"] },
    HostConfig: { NetworkMode: spec.network, PortBindings: {}, PublishAllPorts: false, Binds: null, VolumesFrom: null, Privileged: false, CapAdd: null,
      Tmpfs: isDb ? { "/var/lib/mysql": "rw,nosuid,size=1g" } : {} },
    Mounts: isDb ? [{ Type: "tmpfs", Destination: "/var/lib/mysql", RW: true }] : [],
    NetworkSettings: { Ports: isDb ? { "3306/tcp": null } : {}, Networks: {} },
  };
}

function environment(overrides = {}) {
  const objects = new Map(), events = [];
  let serial = 0;
  const docker = {
    async create(spec) { const id = String(++serial).padStart(64, "0"); objects.set(id, inspect(id, spec)); events.push(["create", id]); return id; },
    async inspect(id) { return structuredClone(objects.get(id)); },
    async environment() { return { CI: "true" }; },
    async start(id) { events.push(["start", id]); },
    async ready(id) { events.push(["ready", id]); },
    async execute(id, suite) { events.push(["execute", id, suite]); return { exitCode: 0 }; },
    async stop(id) { events.push(["stop", id]); },
    async remove(id) { events.push(["remove", id]); objects.delete(id); },
    ...overrides.docker,
  };
  const files = {
    async stage() { events.push(["stage"]); },
    async collect() { events.push(["collect"]); },
    ...overrides.files,
  };
  return { docker, files, events, objects, signal: overrides.signal };
}

test("unknown suite and injected Docker/command options are rejected before planning resources", () => {
  const build = need("buildIsolationPlan");
  assert.throws(() => build({ ...input, suite: "production" }), /suite/i);
  assert.throws(() => build({ ...input, command: "deploy", network: "host" }), /option|input|key/i);
  assert.throws(() => build({ ...input, runId: "../foreign" }), /run|name/i);
  assert.throws(() => build({ ...input, images: { ...images, runtime: "node:latest" } }), /image|immutable/i);
});

test("inspect rejects a published port or host mount before any app execution", () => {
  const validate = need("validateRuntimeInspect"), plan = need("buildIsolationPlan")(input);
  const spec = plan.resources.find(x => x.kind === "mysql");
  const safe = inspect("1".repeat(64), spec);
  assert.doesNotThrow(() => validate(safe, { ...spec, id: "1".repeat(64), runId: input.runId, suite: input.suite, environment: { CI: "true" } }));
  for (const altered of [
    { ...safe, HostConfig: { ...safe.HostConfig, PortBindings: { "3306/tcp": [{ HostPort: "3307" }] } } },
    { ...safe, HostConfig: { ...safe.HostConfig, Binds: ["/var/run/docker.sock:/var/run/docker.sock"] } },
    { ...safe, Mounts: [{ Type: "volume", Name: "real-db", Destination: "/var/lib/mysql" }] },
  ]) assert.throws(() => validate(altered, { ...spec, id: "1".repeat(64), runId: input.runId, suite: input.suite, environment: { CI: "true" } }), /port|mount|bind|volume/i);
});

test("inspect accepts image EXPOSE and the owned mysql tmpfs but rejects non-none networking and extra privilege", () => {
  const validate = need("validateRuntimeInspect"), spec = need("buildIsolationPlan")(input).resources.find(x => x.kind === "mysql");
  const safe = inspect("1".repeat(64), spec);
  assert.doesNotThrow(() => validate(safe, { ...spec, id: "1".repeat(64), runId: input.runId, suite: input.suite, environment: { CI: "true" } }));
  for (const patch of [{ NetworkMode: "bridge" }, { Privileged: true }, { CapAdd: ["NET_ADMIN"] }])
    assert.throws(() => validate({ ...safe, HostConfig: { ...safe.HostConfig, ...patch } }, { ...spec, id: "1".repeat(64), runId: input.runId, suite: input.suite, environment: { CI: "true" } }), /network|privilege|capabil/i);
});

test("suite failure wins over secondary artifact and cleanup failures", async () => {
  const env = environment({
    docker: { async execute() { return { exitCode: 17 }; }, async remove() { throw Error("remove failed"); } },
    files: { async collect() { throw Error("artifact failed"); } },
  });
  const result = await need("runIsolatedSuite")(need("buildIsolationPlan")(input), env);
  assert.equal(result.exitCode, 17);
  assert.ok(result.secondaryErrors.length >= 2);
});

for (const failed of ["artifact", "cleanup"]) test("successful suite fails the job when required " + failed + " fails", async () => {
  const env = environment(failed === "artifact" ? { files: { async collect() { throw Error("artifact failed"); } } } : { docker: { async remove() { throw Error("remove failed"); } } });
  const result = await need("runIsolatedSuite")(need("buildIsolationPlan")(input), env);
  assert.notEqual(result.exitCode, 0);
  assert.ok(result.secondaryErrors.length > 0);
});

test("partial setup cleans only created IDs and does not execute app tests", async () => {
  const env = environment();
  const original = env.docker.create;
  env.docker.create = async spec => { if (env.objects.size === 1) throw Error("second create failed"); return original(spec); };
  const result = await need("runIsolatedSuite")(need("buildIsolationPlan")(input), env);
  assert.notEqual(result.exitCode, 0);
  assert.deepEqual(env.events.filter(x => x[0] === "execute"), []);
  assert.equal(env.events.filter(x => x[0] === "remove").length, 1);
  assert.equal(env.objects.size, 0);
});

test("foreign ownership aborts execution and is never stopped or removed", async () => {
  const env = environment();
  const original = env.docker.inspect;
  env.docker.inspect = async id => { const value = await original(id); value.Config.Labels[ownerKey] = "another-run"; return value; };
  const result = await need("runIsolatedSuite")(need("buildIsolationPlan")(input), env);
  assert.notEqual(result.exitCode, 0);
  assert.deepEqual(env.events.filter(x => ["start", "execute", "stop", "remove"].includes(x[0])), []);
});

for (const [reason, expected] of [["SIGINT", 130], ["SIGTERM", 143]]) test(reason + " cancels execution and cleans created owned IDs", async () => {
  const controller = new AbortController(), env = environment({ signal: controller.signal });
  env.docker.execute = async () => { controller.abort(reason); return { exitCode: 0 }; };
  const result = await need("runIsolatedSuite")(need("buildIsolationPlan")(input), env);
  assert.equal(result.exitCode, expected);
  assert.equal(env.objects.size, 0);
});

const sha = text => createHash("sha256").update(text).digest("hex");
function tree() {
  const root = mkdtempSync(path.join(os.tmpdir(), "ci-isolation-policy-"));
  mkdirSync(path.join(root, "app/scripts"), { recursive: true });
  writeFileSync(path.join(root, "README.md"), "safe readme\n");
  writeFileSync(path.join(root, "app/scripts/new-runner.mjs"), "export const ready = true;\n");
  writeFileSync(path.join(root, ".env.local"), "not copied");
  writeFileSync(path.join(root, "debug.log"), "not copied");
  return root;
}

test("local manifest includes exactly approved new inputs and excludes arbitrary untracked env and debug files", () => {
  const root = tree(), manifest = need("createSourceManifest")({
    root, mode: "local", trackedFiles: ["README.md"],
    approvedNewFiles: { "app/scripts/new-runner.mjs": sha("export const ready = true;\n") },
  });
  assert.deepEqual(manifest.entries.map(x => x.path).sort(), ["README.md", "app/scripts/new-runner.mjs"]);
  assert.equal(manifest.entries.find(x => x.path.endsWith("new-runner.mjs")).sha256, sha("export const ready = true;\n"));
});

test("source manifest refuses missing approved input, changed hash and root escapes", () => {
  const root = tree(), create = need("createSourceManifest");
  assert.throws(() => create({ root, mode: "local", trackedFiles: ["README.md"], approvedNewFiles: { "app/scripts/missing.mjs": "a".repeat(64) } }), /missing|exist/i);
  assert.throws(() => create({ root, mode: "local", trackedFiles: ["README.md"], approvedNewFiles: { "app/scripts/new-runner.mjs": "a".repeat(64) } }), /hash|changed/i);
  assert.throws(() => create({ root, mode: "ci", trackedFiles: ["../outside"], approvedNewFiles: {} }), /root|path|escape/i);
  assert.throws(() => create({ root, mode: "local", trackedFiles: [], approvedNewFiles: { ".env.local": sha("not copied") } }), /env|private|input/i);
});

test("source manifest never follows a source symlink outside the approved root", () => {
  const root = tree(), outside = mkdtempSync(path.join(os.tmpdir(), "ci-isolation-outside-"));
  writeFileSync(path.join(outside, "private.txt"), "outside");
  symlinkSync(outside, path.join(root, "outside-link"), "junction");
  assert.throws(() => need("createSourceManifest")({ root, mode: "ci", trackedFiles: ["outside-link/private.txt"], approvedNewFiles: {} }), /link|root|escape/i);
});

test("required artifacts cannot be copied through a link outside their owned output directory", () => {
  const root = tree(), outside = mkdtempSync(path.join(os.tmpdir(), "ci-isolation-artifact-"));
  writeFileSync(path.join(outside, "private.txt"), "outside");
  symlinkSync(outside, path.join(root, "report-directory"), "junction");
  assert.throws(() => need("createArtifactManifest")({ root, requiredPaths: ["report-directory/private.txt"] }), /link|root|escape/i);
});

test("missing required artifacts fail collection instead of silently returning success", () => {
  const create = need("createArtifactManifest");
  assert.throws(() => create({ root: tree(), requiredPaths: ["coverage/coverage-final.json"] }), /missing|exist|artifact/i);
});

for (const [name, mutate] of [
  ["different exact container ID", value => { value.Id = "f".repeat(64); }],
  ["different immutable image", value => { value.Image = "sha256:" + "f".repeat(64); }],
  ["changed fixed runtime environment", value => { value.Config.Env = ["CI=false"]; }],
  ["injected environment key", value => { value.Config.Env.push("UNAPPROVED_KEY=dummy"); }],
  ["missing owned database tmpfs", value => { value.HostConfig.Tmpfs = {}; value.Mounts = []; }],
]) test("inspect rejects " + name + " before app startup", () => {
  const validate = need("validateRuntimeInspect"), spec = need("buildIsolationPlan")(input).resources.find(x => x.kind === "mysql");
  const value = inspect("1".repeat(64), spec); mutate(value);
  assert.throws(() => validate(value, { ...spec, id: "1".repeat(64), runId: input.runId, suite: input.suite, environment: { CI: "true" } }), /container|image|environment|tmpfs|mount|ID/i);
});

for (const [phase, reason, expected] of [["collect", "SIGTERM", 143], ["cleanup", "SIGINT", 130]]) test("cancellation during " + phase + " never returns a successful job", async () => {
  const controller = new AbortController(), env = environment({ signal: controller.signal });
  if (phase === "collect") env.files.collect = async () => { controller.abort(reason); };
  else env.docker.stop = async () => { controller.abort(reason); };
  const result = await need("runIsolatedSuite")(need("buildIsolationPlan")(input), env);
  assert.equal(result.exitCode, expected);
  assert.equal(env.objects.size, 0);
});

test("a nonzero suite exit wins over simultaneous cancellation", async () => {
  const controller = new AbortController(), env = environment({ signal: controller.signal });
  env.docker.execute = async () => { controller.abort("SIGTERM"); return { exitCode: 17 }; };
  const result = await need("runIsolatedSuite")(need("buildIsolationPlan")(input), env);
  assert.equal(result.exitCode, 17);
});

test("local tracked agent instructions cannot import private working-copy changes", () => {
  const root = tree(), create = need("createSourceManifest");
  writeFileSync(path.join(root, "AGENTS.md"), "local private instruction\n");
  assert.throws(() => create({
    root, mode: "local", trackedFiles: ["README.md", "AGENTS.md"], approvedNewFiles: {},
    baselineHashes: { "AGENTS.md": sha("committed agent instruction\n") },
  }), /private|baseline|changed|hash/i);
});

test("an empty required artifact subtree is a collection failure", () => {
  const root = tree(), create = need("createArtifactManifest");
  mkdirSync(path.join(root, "coverage"));
  assert.throws(() => create({ root, requiredPaths: ["coverage"] }), /empty|required|artifact/i);
});

test("database readiness receives cancellation and never proceeds to app execution after abort", async () => {
  const controller = new AbortController(), env = environment({ signal: controller.signal });
  let observed;
  env.docker.ready = async (_id, context) => { observed = context?.signal; controller.abort("SIGTERM"); };
  const result = await need("runIsolatedSuite")(need("buildIsolationPlan")(input), env);
  assert.equal(observed, controller.signal);
  assert.equal(result.exitCode, 143);
  assert.equal(env.events.filter(item => item[0] === "execute").length, 0);
  assert.equal(env.objects.size, 0);
});

test("an already cancelled app run stops owned containers without starting artifact collection", async () => {
  const controller = new AbortController(), env = environment({ signal: controller.signal });
  let collections = 0;
  env.docker.execute = async () => { controller.abort("SIGTERM"); return { exitCode: 143 }; };
  env.files.collect = async () => { collections += 1; };
  const result = await need("runIsolatedSuite")(need("buildIsolationPlan")(input), env);
  assert.equal(result.exitCode, 143);
  assert.equal(collections, 0);
  assert.equal(env.objects.size, 0);
});

test("local CLI rejects an approved tracked file restored to HEAD before preparing runtime inputs", () => {
  const root = tree(), env = { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null", GIT_TEMPLATE_DIR: "" };
  const cli = path.join(root, "app/scripts/run-ci-isolated.mjs");
  copyFileSync(new URL("./run-ci-isolated.mjs", import.meta.url), cli);
  copyFileSync(new URL("./ci-isolation.mjs", import.meta.url), path.join(root, "app/scripts/ci-isolation.mjs"));
  mkdirSync(path.join(root, "app/prisma/d1"), { recursive: true });
  writeFileSync(path.join(root, "app/package-lock.json"), "{}\n");
  writeFileSync(path.join(root, "app/prisma/schema.prisma"), "// fixture\n");
  writeFileSync(path.join(root, "app/prisma/d1/schema.prisma"), "// fixture\n");
  const git = args => {
    const result = spawnSync("git", args, { cwd: root, env, encoding: "utf8", windowsHide: true });
    assert.equal(result.status, 0, "fixture git operation failed");
  };
  git(["-c", "init.templateDir=", "init", "--quiet"]);
  git(["add", "--", "README.md", "app/scripts/run-ci-isolated.mjs", "app/scripts/ci-isolation.mjs", "app/package-lock.json", "app/prisma/schema.prisma", "app/prisma/d1/schema.prisma"]);
  git(["-c", "user.name=CI Test", "-c", "user.email=testuser_ci@example.com", "commit", "--quiet", "-m", "fixture baseline"]);
  const manifest = path.join(root, "approved.json");
  writeFileSync(manifest, JSON.stringify({ newFiles: {}, trackedChanges: { "README.md": sha("intended changed readme\n") } }));
  const result = spawnSync(process.execPath, [cli, "test"], {
    cwd: root, encoding: "utf8", windowsHide: true,
    env: { ...env, GITHUB_ACTIONS: "", CI_ISOLATION_LOCAL_MANIFEST: manifest, CI_ISOLATION_RUNTIME_IMAGE: images.runtime, CI_ISOLATION_MYSQL_IMAGE: images.mysql, CI_ISOLATION_RUN_ID: "manifest-fixture" },
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /approved|manifest|tracked.*(hash|change)|hash.*(changed|mismatch)/i);
});

test("queued cancellation during finalization is delivered before publishing a successful result", async () => {
  const controller = new AbortController();
  const env = environment({ signal: controller.signal, files: { async collect() {
    setImmediate(() => controller.abort("SIGTERM"));
  } } });
  const result = await need("runIsolatedSuite")(need("buildIsolationPlan")(input), env);
  assert.equal(result.exitCode, 143);
  assert.equal(env.objects.size, 0);
});
