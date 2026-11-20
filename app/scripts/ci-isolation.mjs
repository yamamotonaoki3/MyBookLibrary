import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

const OWNER = "io.mybooklibrary.ci-run";
const SUITE = "io.mybooklibrary.ci-suite";
const SUITES = new Set(["test", "integration-d1", "worker"]);
const IMMUTABLE_IMAGE = /^sha256:[a-f0-9]{64}$/;
const CONTAINER_ID = /^[a-f0-9]{64}$/;

export function buildIsolationPlan(input) {
  if (!input || Object.keys(input).some(key => !["suite", "runId", "images"].includes(key))) throw Error("Unexpected isolation input option");
  const { suite, runId, images } = input;
  if (!SUITES.has(suite)) throw Error("Unknown isolated suite");
  if (typeof runId !== "string" || !/^[a-z0-9][a-z0-9-]{0,39}$/.test(runId)) throw Error("Invalid isolation run name");
  if (!images || Object.keys(images).some(key => !["runtime", "mysql"].includes(key)) ||
      !IMMUTABLE_IMAGE.test(images.runtime ?? "") || (suite === "test" && !IMMUTABLE_IMAGE.test(images.mysql ?? ""))) {
    throw Error("Resolved immutable runtime/database image IDs are required");
  }
  const prefix = "mbl-ci-" + runId;
  const resources = [];
  if (suite === "test") resources.push({ kind: "mysql", name: prefix + "-mysql", image: images.mysql, network: "none" });
  resources.push({ kind: "app", name: prefix + "-app", image: images.runtime, network: suite === "test" ? "container:" + prefix + "-mysql" : "none" });
  return { suite, runId, resources, labels: { [OWNER]: runId, [SUITE]: suite } };
}

function assertOwnership(inspect, expected) {
  if (!inspect || !CONTAINER_ID.test(expected.id ?? "") || !CONTAINER_ID.test(inspect.Id ?? "") ||
      inspect.Id !== expected.id || inspect.Name !== "/" + expected.name ||
      inspect.Config?.Labels?.[OWNER] !== expected.runId || inspect.Config?.Labels?.[SUITE] !== expected.suite) {
    throw Error("Container ownership does not match this run");
  }
}

function published(bindings) {
  return Object.values(bindings ?? {}).some(value => value != null && (!Array.isArray(value) || value.length > 0));
}

export function validateRuntimeInspect(inspect, expected) {
  assertOwnership(inspect, expected);
  if (!IMMUTABLE_IMAGE.test(expected.image ?? "") || inspect.Image !== expected.image) throw Error("Unexpected runtime image");
  const environment = expected.environment, seen = new Set();
  if (!environment || typeof environment !== "object" || Array.isArray(environment) ||
      Object.values(environment).some(value => typeof value !== "string") || !Array.isArray(inspect.Config?.Env)) {
    throw Error("Unexpected runtime environment");
  }
  for (const entry of inspect.Config.Env) {
    const separator = typeof entry === "string" ? entry.indexOf("=") : -1;
    if (separator <= 0) throw Error("Unexpected runtime environment");
    const key = entry.slice(0, separator);
    if (seen.has(key) || !Object.hasOwn(environment, key) || entry.slice(separator + 1) !== environment[key]) {
      throw Error("Unexpected runtime environment");
    }
    seen.add(key);
  }
  if (seen.size !== Object.keys(environment).length) throw Error("Unexpected runtime environment");
  const host = inspect.HostConfig;
  if (!host || host.NetworkMode !== expected.network || !/^(none|container:[a-z0-9-]+)$/.test(expected.network)) throw Error("Unexpected runtime network");
  if (host.Privileged || (host.CapAdd?.length ?? 0) > 0 || ["host"].includes(host.PidMode) || ["host"].includes(host.IpcMode)) throw Error("Unexpected privileged capability or host namespace");
  if (host.PublishAllPorts || published(host.PortBindings) || published(inspect.NetworkSettings?.Ports)) throw Error("Published host ports are prohibited");
  if ((host.Binds?.length ?? 0) || (host.VolumesFrom?.length ?? 0) || (host.Devices?.length ?? 0)) throw Error("Host binds, devices and foreign volumes are prohibited");
  let mysqlTmpfs = false;
  for (const mount of inspect.Mounts ?? []) {
    if (expected.kind !== "mysql" || mount.Type !== "tmpfs" || mount.Destination !== "/var/lib/mysql") throw Error("Unexpected runtime mount or foreign volume");
    mysqlTmpfs = true;
  }
  const tmpfs = Object.keys(host.Tmpfs ?? {});
  if (tmpfs.some(destination => expected.kind !== "mysql" || destination !== "/var/lib/mysql")) throw Error("Unexpected runtime tmpfs mount");
  if (expected.kind === "mysql" && !mysqlTmpfs && !tmpfs.includes("/var/lib/mysql")) throw Error("Required database tmpfs mount is missing");
  // EXPOSE is image metadata, not a published port. The sole DB tmpfs is run-owned.
}

function safeRelative(input) {
  if (typeof input !== "string" || !input || input.includes("\0") || input.includes("\\") ||
      input.includes("*") || input.includes("?") || path.isAbsolute(input) || /^[a-z]:/i.test(input) ||
      input.split("/").some(part => !part || part === "." || part === "..")) throw Error("Invalid relative path or root escape");
  return input;
}

function within(root, file) {
  const relative = path.relative(root, file);
  return relative === "" || (!relative.startsWith(".." + path.sep) && relative !== ".." && !path.isAbsolute(relative));
}

function checkedPath(root, relative) {
  safeRelative(relative);
  let current = root;
  for (const segment of relative.split("/")) {
    current = path.join(current, segment);
    if (!existsSync(current)) throw Error("Required input/artifact does not exist: " + relative);
    if (lstatSync(current).isSymbolicLink()) throw Error("Source/artifact symlink or junction is not allowed: " + relative);
    if (!within(root, realpathSync(current))) throw Error("Input/artifact escapes the owned root: " + relative);
  }
  return current;
}

function digest(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function privateSource(relative, overlay) {
  const segments = relative.split("/"), basename = segments.at(-1);
  return segments.some(segment => [".git", ".claude", ".codex", ".agents"].includes(segment)) ||
    (basename.startsWith(".env") && !basename.endsWith(".example")) ||
    relative === "debug.log" || segments[0] === "artifacts" ||
    (overlay && ["AGENTS.md", "CLAUDE.md"].includes(basename));
}

export function createSourceManifest({ root, mode, trackedFiles, approvedNewFiles = {}, baselineHashes = {} }) {
  if (!["ci", "local"].includes(mode) || !Array.isArray(trackedFiles)) throw Error("Invalid source input mode or tracked paths");
  if (mode === "ci" && Object.keys(approvedNewFiles).length) throw Error("CI accepts tracked source input only");
  const canonical = realpathSync(root), paths = new Map();
  for (const relative of trackedFiles) paths.set(safeRelative(relative), null);
  if (mode === "local") for (const [relative, hash] of Object.entries(approvedNewFiles)) {
    safeRelative(relative);
    if (!/^[a-f0-9]{64}$/.test(hash) || paths.has(relative)) throw Error("Invalid or duplicate approved input hash");
    paths.set(relative, hash);
  }
  const entries = [];
  for (const [relative, expectedHash] of [...paths].sort(([a], [b]) => a.localeCompare(b))) {
    if (privateSource(relative, expectedHash !== null)) throw Error("Private or actual env input is prohibited: " + relative);
    const file = checkedPath(canonical, relative);
    if (!lstatSync(file).isFile()) throw Error("Source input must be a regular file: " + relative);
    const sha256 = digest(file);
    if (mode === "local" && expectedHash === null && ["AGENTS.md", "CLAUDE.md"].includes(relative.split("/").at(-1))) {
      const baselineHash = Object.hasOwn(baselineHashes ?? {}, relative) ? baselineHashes[relative] : undefined;
      if (typeof baselineHash !== "string" || !/^[a-f0-9]{64}$/.test(baselineHash) || sha256 !== baselineHash) {
        throw Error("Private or changed baseline input is prohibited: " + relative);
      }
    }
    if (expectedHash !== null && sha256 !== expectedHash) throw Error("Approved source hash changed: " + relative);
    entries.push({ path: relative, sha256 });
  }
  return { root: canonical, entries };
}

export function createArtifactManifest({ root, requiredPaths }) {
  if (!Array.isArray(requiredPaths) || requiredPaths.length === 0) throw Error("Required artifact paths are missing");
  const canonical = realpathSync(root), entries = new Map();
  function collect(relative) {
    const file = checkedPath(canonical, relative), stat = lstatSync(file);
    if (stat.isDirectory()) {
      let count = 0;
      for (const name of readdirSync(file).sort()) count += collect(relative + "/" + name);
      return count;
    } else if (stat.isFile()) {
      entries.set(relative, { path: relative, sha256: digest(file) });
      return 1;
    } else throw Error("Artifact must be a regular file or directory");
  }
  for (const relative of requiredPaths) {
    if (collect(relative) === 0) throw Error("Required artifact path contains no regular files: " + relative);
  }
  return { root: canonical, entries: [...entries.values()] };
}

function cancellation(signal) {
  return signal?.aborted ? (signal.reason === "SIGINT" ? 130 : 143) : 0;
}

export async function runIsolatedSuite(plan, { docker, files, signal }) {
  const owned = [];
  const secondaryErrors = [];
  let primaryExit = 0, appId, executed = false;
  function assertActive() {
    const exit = cancellation(signal);
    if (exit) throw Object.assign(Error("Isolated run cancelled"), { exitCode: exit });
  }
  try {
    assertActive();
    for (const original of plan.resources) {
      assertActive();
      const spec = { ...original };
      if (spec.network.startsWith("container:")) {
        const database = owned.find(item => item.spec.kind === "mysql");
        if (!database) throw Error("Owned database namespace is missing");
        spec.network = "container:" + database.id;
      }
      const environment = await docker.environment(spec);
      assertActive();
      const id = await docker.create({ ...spec, labels: plan.labels });
      if (!CONTAINER_ID.test(id ?? "")) throw Error("Docker did not return an owned container ID");
      const expected = { ...spec, id, environment, runId: plan.runId, suite: plan.suite };
      owned.push({ id, spec: expected });
      validateRuntimeInspect(await docker.inspect(id), expected);
      assertActive();
      if (spec.kind === "app") {
        appId = id;
        await files.stage(id, plan);
      }
      assertActive();
      await docker.start(id);
      if (spec.kind === "mysql") await docker.ready(id, { signal });
    }
    assertActive();
    executed = true;
    const result = await docker.execute(appId, plan.suite, { signal });
    if (!Number.isInteger(result?.exitCode) || result.exitCode < 0 || result.exitCode > 255) throw Error("Invalid isolated suite exit");
    primaryExit = result.exitCode;
  } catch (error) {
    primaryExit = cancellation(signal) || error.exitCode || 1;
    secondaryErrors.push(String(error.message ?? error));
  } finally {
    if (executed && appId && !signal?.aborted) {
      try { await files.collect(appId, plan); }
      catch (error) { secondaryErrors.push("Required artifacts: " + String(error.message ?? error)); }
    }
    for (const item of owned.toReversed()) {
      try {
        assertOwnership(await docker.inspect(item.id), item.spec);
        await docker.stop(item.id);
        await docker.remove(item.id);
      } catch (error) { secondaryErrors.push("Owned cleanup: " + String(error.message ?? error)); }
    }
  }
  await new Promise(resolve => setImmediate(resolve));
  return { exitCode: primaryExit || cancellation(signal) || (secondaryErrors.length ? 1 : 0), secondaryErrors };
}
