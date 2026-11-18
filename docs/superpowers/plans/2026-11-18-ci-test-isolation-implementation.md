# CI test isolation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking. The assigned implementation owner edits source; operations owner executes Docker/tests; root reviews adoption. No additional delegation.

**Goal:** Preserve all existing CI checks while denying external app-test/build communication.
**Architecture:** Keep acquisition/static steps on the runner, then execute fixed suite commands in run-owned Docker none namespaces. Test MySQL shares the same loopback namespace when needed; copy explicit safe inputs/artifacts rather than mount host state.
**Tech Stack:** Existing Node22, JavaScript ESM/node:test, Docker, MySQL8.4, Playwright1.62.1, Jest/Prisma/Wrangler from the unchanged lock.
**Spec:** ../specs/2026-11-18-ci-test-isolation-design.md

## Global Constraints
- Existing jobs `test`, `integration-d1`, `worker` and every suite remain.
- Preparation/static checks/runner control/artifact upload stay outside; app test/build/server/browser/native execution stays inside.
- Runtime has no non-loopback network, host bind/socket/published HostConfig.PortBindings, real env/keys/home or foreign/existing DB volumes; allow image EXPOSE metadata and owned /var/lib/mysql tmpfs.
- Node22.23.4 Linux x64/ABI127/npm10.9.9 and Playwright1.62.1 runtime compatibility is checked before app execution. Child Node/npm PATH resolve to that toolchain, not Windows/Alpine executables. Runtime CI=true.
- PWA Service Worker/cache verification stays enabled.
- No new dependencies, host firewall, README/product changes, commit/push/PR/merge/publication.
- Root adopts this plan before implementation. Ops alone executes Docker and app tests.

## Review Focus
1. Unknown suite/untrusted option/image/name must fail before creating any resource — Task1 policy tests.
2. Unexpected inspect namespace/mount/privilege/env or foreign ownership must abort before app execution — Task1 inspect tests and Task3 runtime evidence.
3. Test failure/partial setup/SIGINT/SIGTERM/artifact failure must preserve the nonzero primary exit, fail a successful suite on required artifact/cleanup errors and only clean up owned resources — Task1 lifecycle tests.
4. Missing/incompatible Node/browser/generated/native artifacts must fail rather than download or run on host — Task2 preflight tests and Task3 version evidence.
5. Initial PR event/artifact capture must keep required checks/all tests without running the old unsafe path — Task3 static event/matrix review.

### Task 1: Safe host runner contract, source manifest and lifecycle
**Files:** Create app/scripts/ci-isolation.mjs and app/scripts/ci-isolation.test.mjs.
**Interfaces:** `buildIsolationPlan({suite,runId,images}) -> {suite,runId,resources,labels}; adapter environment(spec) -> independently prepared image-baseline plus fixed-overlay map`; `validateRuntimeInspect(inspect,expected) -> void`; `runIsolatedSuite(plan,{docker,files}) -> Promise<{exitCode,secondaryErrors}>`. Source interface: createSourceManifest({root,mode,approvedNewFiles}) -> {paths,sha256}; mode is CI tracked-only or local tracked-plus-exact-new-file-allowlist. Suite is exactly test/integration-d1/worker; Docker/files are injectable boundaries, no arbitrary shell command execution.

- [ ] Write focused failing node:test cases: reject unknown suite/options and unsafe ownership/inspect; a fixed test exit17 remains17 after artifact/cleanup errors; suite exit0 becomes job failure on required artifact or cleanup failure; partial setup and SIGINT/SIGTERM cancel remaining work and clean only created IDs with matching labels, refusing foreign containers. Artifact cases reject a symlink/junction outside the fixed owned output directory before copy/upload. Inspect cases accept image EXPOSE plus owned DB tmpfs but reject published HostConfig.PortBindings/host binds/foreign volumes. Source cases require approved new runner/test files to be present with exact manifest hashes, reject canonical root escapes/symlinks/secret or private-agent overlays, and never collect arbitrary untracked files. Use a fake Docker boundary recording calls, not real Docker.
- [ ] Ops runs `node --test scripts/ci-isolation.test.mjs` inside the safe test container and records RED with expected missing policy/behavior, not dependency/parse failure.
- [ ] Implement the smallest policy and lifecycle against those assertions. Explicit Docker argv arrays/windowsHide, no shell interpolation, allowlisted env. Build CI source from Git's explicit tracked paths; local validation adds only the exact new-file allowlist from this plan. Canonical paths must remain within the designated root and match approved per-file SHA256; source copy must include every approved new runner/test file. Preserve legitimate internal dependency .bin/vendor links separately from source-root policy. Exclude actual env/private-agent overlays/host metadata and all other untracked files. No git add . or commit workaround. Accept only prepared runtime/image IDs that passed the preflight.
- [ ] Ops records GREEN for targeted tests, including setup/test/artifact/cleanup failure branches. No host app tests.

### Task 2: Fixed restricted commands and minimum communication fixes
**Files:** Create app/scripts/ci-isolated-suite.mjs; modify app/e2e/stub-server.ts and ordinary E2E config/fixture only as required; app/package.json only for focused runner test entry.
**Interfaces:** Runtime CLI `node scripts/run-ci-isolated-suite.mjs <test|integration-d1|worker>`, no arbitrary command arguments. It checks the exact Linux Node/npm/ABI/native/workerd/browser toolchain and fixed CI=true, writes dummy-only test env, then runs the fixed command list sequentially and returns the first failing exit.

- [ ] Write RED for runtime preflight: nonmatching Linux Node/npm/child-Node PATH or ABI, missing browser/generated/native artifacts, wrong test DB target, or unexpected outbound API base aborts before any suite command. Ops executes safe-container focused tests.
- [ ] Implement fixed suite command lists corresponding to current ci.yml, including d1:migration:check in the restricted test suite (its original test-job responsibility), preserving normal E2E, cron with generated tick secret, demo-mode and real production PWA stages; D1 and Worker dry-run/config/smoke stages stay complete. Port3307/testDB and localstub origins only.
- [ ] Use the ordinary webServer env to opt into the existing localReserve option, keep constructor default/old opt-in contract, use the bound-port local href and retain PWA controls. Extend existing e2e/library-availability.spec.ts to assert localhost:3999/stub/reserve and local HTML200 through the ordinary fixture path, not the route.fulfill protection test.
- [ ] Ops records focused GREEN and the existing ordinary-library reserve regression without any external URL access. Do not add config-mirroring assertions.

### Task 3: Workflow integration and complete safe validation
**Files:** Modify .github/workflows/ci.yml, docs/test-dependency-map.md, docs/test-plan.md; update lessons only if an adopted finding meets the existing recording standard.
**Consumes:** Task1 host runner and Task2 runtime CLI.
**Produces:** Same three CI checks with isolated test/build execution and reports.

- [ ] Preserve host checkout/setup/npm/image preparation on a clean tracked source snapshot without old .env.local; existing postinstall is the two Prisma generate calls only. Use the locked runtime image's validated browser/OS dependencies instead of duplicate host browser/apt transfer when possible. Keep static type/lint/docs and pure schema:d1:check responsibilities. Move d1:migration:check (migration SQL execution plus Prisma child process) to the restricted test invocation and retain its visible result. Pin runtime Playwright image to1.62.1 and copy the verified prepared Linux Node22.23.4 toolchain/dependencies including matching npm10.9.9 and child PATH; resolve images before runtime and verify Node/ABI127/git/glibc/native/workerd/Chromium library compatibility. Record source Node24 ABI137 from reused dependencies; require actual compatibility checks before app commands. If incompatible, report to root before broadening the design.
- [ ] Add CI-only WRANGLER_SEND_METRICS=false, WRANGLER_SEND_ERROR_REPORTS=false, NEXT_TELEMETRY_DISABLED=1; apply existing fontmock to CI Worker build without changing production build behavior.
- [ ] Replace host app-test/build invocations with the fixed host runner. MySQL runs in a fresh none container at3307 with run-owned /var/lib/mysql tmpfs; authenticated TCP SELECT 1 using testuser/testDB proves readiness. App shares that namespace; D1/Worker use none directly. No service host ports, real env or socket mounts. Keep upload actions outside and collect existing coverage/Playwright/PWA from fixed owned output directories only; reject out-of-bound links, fail on missing required artifacts, and record secondary errors without masking a nonzero suite exit. Handle partial setup and SIGINT/SIGTERM/Actions cancel with owned-ID cleanup and disclose hardkill/runner-loss limits.
- [ ] Statically compare before/after command matrix and workflow triggers, including the first pull_request merge ref; inspect other workflow entry points for unintended app-test execution. No workflow dispatch/PR is created.
- [ ] Ops runs targeted isolation/lifecycle probes using only local fictitious resources, then one full current check/type/lint/docs/worker-build/Jest/integration/E2E/D1/Worker matrix in the new boundary. Capture inspect/env keys/versions/source hashes/exits/reports/cleanup. Failures are debugged from evidence without skips/timeouts.
- [ ] Implementation owner verifies diff scope/secret and protected-state hashes, then mandatory codex review --uncommitted (read-only; no duplicate tests/DB/server). Valid findings are fixed by concrete codex exec and affected checks; false positives retain source evidence.
- [ ] Root adopts concrete result; external delivery approval remains a separate final step. Do not commit merely to complete a plan checkbox.

## Plan self-check
All spec requirements map to Tasks1–3. Tests cover unsafe inputs, namespace/ownership, partial cleanup/exit propagation and missing-runtime fallback. APIs/enum names align. Plan-review revision2 adds authenticated TCP readiness, image-metadata/tmpfs exceptions, signal/secondary-failure semantics, compatible Linux Node/npm/native checks, bounded artifacts and ordinary-fixture reserve regression. Plan-review revision1: d1:migration:check is execution, not a host static check; local new files use an exact canonical/hash-verified allowlist without staging. Runtime implementation details may be adjusted only within the approved existing-tool boundary using ops evidence, and full-suite success remains a gate rather than an assumption.

Implementation boundary: the reviewed pure mechanisms remain in ci-isolation.mjs and ci-isolated-suite.mjs. Focused entry points run-ci-isolated.mjs (host Docker/input/artifact adapter) and run-ci-isolated-suite.mjs (restricted preflight/command executor) keep those modules side-effect-free when imported. Linux dependency input also includes current-schema MySQL/D1 generated clients with source-schema SHA provenance.
