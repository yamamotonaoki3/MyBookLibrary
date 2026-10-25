# Issue #775 dependency audit snapshot

Audit snapshot taken on 2026-10-24 after Issue #774 was merged and rechecked on 2026-10-25, using the npm advisory database and the updated `app/package-lock.json`. npm audit results can change when the advisory database changes, even without package changes.

## Compatible updates

`npm audit fix` updated the lockfile without changing `app/package.json` or using `--force`. After a clean `npm ci`, these previously reported package warnings no longer appear: `handlebars`, `js-yaml`, `fast-uri`, `brace-expansion`, `browserslist`, and `source-map-js`.

| Audit | Before | After `npm ci` |
| --- | ---: | ---: |
| All dependencies | 33 (11 moderate, 20 high, 2 critical) | 15 (6 moderate, 9 high) |
| Production dependency tree (`npm audit --omit=dev`) | 24 | 8 (4 moderate, 4 high) |

No direct dependency declaration or major version was changed. `npm audit fix --force` was not used because npm proposes incompatible downgrades or a Prisma 7 upgrade.

## Resolved advisories

Re-audited the base commit (`1137e5f`) and updated lockfile on 2026-10-25 using the same npm advisory database. Every advisory below is absent from the updated audit. These are advisory IDs, not a count of independent attack paths. A removed nested path means dependency deduplication; its advisory is also absent from the updated tree.

| Package | Locked versions (before → after) | Resolved advisory IDs |
| --- | --- | --- |
| @hono/node-server | 1.19.14 -> 2.1.5 | [GHSA-frvp-7c67-39w9](https://github.com/advisories/GHSA-frvp-7c67-39w9) |
| @modelcontextprotocol/sdk | 1.29.0 -> 1.32.2 | [GHSA-6qxp-vccf-f47h](https://github.com/advisories/GHSA-6qxp-vccf-f47h), [GHSA-22jm-h49p-29qw](https://github.com/advisories/GHSA-22jm-h49p-29qw), [GHSA-6prh-2h8m-c8cw](https://github.com/advisories/GHSA-6prh-2h8m-c8cw), [GHSA-46jr-4wx8-v453](https://github.com/advisories/GHSA-46jr-4wx8-v453), [GHSA-rvq5-wwqv-78pq](https://github.com/advisories/GHSA-rvq5-wwqv-78pq) |
| baseline-browser-mapping | 2.10.32 -> 2.11.32 | [GHSA-w5vr-8v7q-w6rv](https://github.com/advisories/GHSA-w5vr-8v7q-w6rv) |
| body-parser | 2.2.2 -> 2.4.0 | [GHSA-v422-hmwv-36x6](https://github.com/advisories/GHSA-v422-hmwv-36x6), [GHSA-27r3-jxmh-p828](https://github.com/advisories/GHSA-27r3-jxmh-p828) |
| brace-expansion | 2.1.7 -> 2.1.7; 5.0.12 -> 5.0.12; 5.0.6 -> 5.0.12; 1.1.15 -> 1.1.21; 2.1.1 -> 2.1.7 | [GHSA-3jxr-9vmj-r5cp](https://github.com/advisories/GHSA-3jxr-9vmj-r5cp), [GHSA-mh99-v99m-4gvg](https://github.com/advisories/GHSA-mh99-v99m-4gvg), [GHSA-rgw5-rvv9-x895](https://github.com/advisories/GHSA-rgw5-rvv9-x895), [GHSA-q2hr-2g5m-vwhr](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr), [GHSA-qhr7-859c-m2p7](https://github.com/advisories/GHSA-qhr7-859c-m2p7), [GHSA-6j4f-fj2g-mc7p](https://github.com/advisories/GHSA-6j4f-fj2g-mc7p) |
| browserslist | 4.28.2 -> 4.29.4 | [GHSA-c83g-rgw3-j3cx](https://github.com/advisories/GHSA-c83g-rgw3-j3cx), [GHSA-73wf-gq98-2v4g](https://github.com/advisories/GHSA-73wf-gq98-2v4g) |
| fast-copy | 4.0.4 -> 4.2.0 | [GHSA-jggr-w7fw-pc2j](https://github.com/advisories/GHSA-jggr-w7fw-pc2j) |
| fast-uri | 3.1.2 -> 3.1.9 | [GHSA-v2hh-gcrm-f6hx](https://github.com/advisories/GHSA-v2hh-gcrm-f6hx), [GHSA-7p8r-x3mc-p8w7](https://github.com/advisories/GHSA-7p8r-x3mc-p8w7), [GHSA-f65p-4m7j-42xc](https://github.com/advisories/GHSA-f65p-4m7j-42xc), [GHSA-fph4-wmhf-6fwf](https://github.com/advisories/GHSA-fph4-wmhf-6fwf), [GHSA-jqff-g426-hqxp](https://github.com/advisories/GHSA-jqff-g426-hqxp), [GHSA-4c8g-83qw-93j6](https://github.com/advisories/GHSA-4c8g-83qw-93j6), [GHSA-qw65-cvwx-89v3](https://github.com/advisories/GHSA-qw65-cvwx-89v3), [GHSA-hrr3-gc8f-f4qj](https://github.com/advisories/GHSA-hrr3-gc8f-f4qj), [GHSA-w74x-v6f9-j3xg](https://github.com/advisories/GHSA-w74x-v6f9-j3xg), [GHSA-xhq7-xmqj-769h](https://github.com/advisories/GHSA-xhq7-xmqj-769h), [GHSA-333x-w4r6-6crp](https://github.com/advisories/GHSA-333x-w4r6-6crp) |
| handlebars | 4.7.9 -> 4.7.10 | [GHSA-xw65-4hp5-5hc7](https://github.com/advisories/GHSA-xw65-4hp5-5hc7), [GHSA-8r5x-fm3f-whwj](https://github.com/advisories/GHSA-8r5x-fm3f-whwj), [GHSA-p8wg-vrv2-v86f](https://github.com/advisories/GHSA-p8wg-vrv2-v86f) |
| hono | 4.12.23 -> 4.13.13 | [GHSA-rv63-4mwf-qqc2](https://github.com/advisories/GHSA-rv63-4mwf-qqc2), [GHSA-wgpf-jwqj-8h8p](https://github.com/advisories/GHSA-wgpf-jwqj-8h8p), [GHSA-88fw-hqm2-52qc](https://github.com/advisories/GHSA-88fw-hqm2-52qc), [GHSA-wwfh-h76j-fc44](https://github.com/advisories/GHSA-wwfh-h76j-fc44), [GHSA-j6c9-x7qj-28xf](https://github.com/advisories/GHSA-j6c9-x7qj-28xf), [GHSA-xgm2-5f3f-mvvc](https://github.com/advisories/GHSA-xgm2-5f3f-mvvc), [GHSA-hvrm-45r6-mjfj](https://github.com/advisories/GHSA-hvrm-45r6-mjfj), [GHSA-w62v-xxxg-mg59](https://github.com/advisories/GHSA-w62v-xxxg-mg59), [GHSA-8j4g-w8fx-2239](https://github.com/advisories/GHSA-8j4g-w8fx-2239), [GHSA-f23p-vx2j-j53r](https://github.com/advisories/GHSA-f23p-vx2j-j53r), [GHSA-79qm-7rj5-m7r9](https://github.com/advisories/GHSA-79qm-7rj5-m7r9), [GHSA-54fx-42gc-7vw4](https://github.com/advisories/GHSA-54fx-42gc-7vw4), [GHSA-gqvv-2mrq-wpjv](https://github.com/advisories/GHSA-gqvv-2mrq-wpjv), [GHSA-g6gw-c38x-mqfc](https://github.com/advisories/GHSA-g6gw-c38x-mqfc), [GHSA-crvj-82cr-hjcx](https://github.com/advisories/GHSA-crvj-82cr-hjcx), [GHSA-hxh3-vqpv-xpqv](https://github.com/advisories/GHSA-hxh3-vqpv-xpqv), [GHSA-5r4p-p66f-jhc7](https://github.com/advisories/GHSA-5r4p-p66f-jhc7) |
| ip-address | 10.2.0 -> 10.7.4 | [GHSA-mwp4-54f8-5fhr](https://github.com/advisories/GHSA-mwp4-54f8-5fhr), [GHSA-4xrf-jv44-h6hh](https://github.com/advisories/GHSA-4xrf-jv44-h6hh), [GHSA-22jq-vg5j-6vgg](https://github.com/advisories/GHSA-22jq-vg5j-6vgg), [GHSA-rpw4-54j3-4h4q](https://github.com/advisories/GHSA-rpw4-54j3-4h4q), [GHSA-2vr4-cq9g-pvrc](https://github.com/advisories/GHSA-2vr4-cq9g-pvrc), [GHSA-j6r3-76f7-8jcv](https://github.com/advisories/GHSA-j6r3-76f7-8jcv), [GHSA-h3mg-xc3c-68pw](https://github.com/advisories/GHSA-h3mg-xc3c-68pw), [GHSA-rxp7-6hxx-x8q5](https://github.com/advisories/GHSA-rxp7-6hxx-x8q5) |
| js-yaml | 3.14.2 -> 3.15.2; 4.1.1 -> 4.3.2 | [GHSA-h67p-54hq-rp68](https://github.com/advisories/GHSA-h67p-54hq-rp68), [GHSA-52cp-r559-cp3m](https://github.com/advisories/GHSA-52cp-r559-cp3m), [GHSA-5p4m-2wfm-xmqj](https://github.com/advisories/GHSA-5p4m-2wfm-xmqj), [GHSA-2883-xcg3-v3hh](https://github.com/advisories/GHSA-2883-xcg3-v3hh) |
| postcss-selector-parser | 7.1.1 -> 7.1.7 | [GHSA-w9m9-85wc-3x92](https://github.com/advisories/GHSA-w9m9-85wc-3x92), [GHSA-rj75-hqrm-r3gf](https://github.com/advisories/GHSA-rj75-hqrm-r3gf) |
| proxy-addr | 2.0.7 -> 2.0.8 | [GHSA-jqcg-44mw-7w3h](https://github.com/advisories/GHSA-jqcg-44mw-7w3h) |
| qs | 6.15.2 -> 6.16.1 | [GHSA-x5fp-wj9c-mxmx](https://github.com/advisories/GHSA-x5fp-wj9c-mxmx), [GHSA-4mjr-xmp4-gh2g](https://github.com/advisories/GHSA-4mjr-xmp4-gh2g) |
| shadcn | 4.10.0 -> 4.22.1 | Transitive warning only |
| source-map-js | 1.2.1 -> 1.2.2 | [GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q) |
| zod | 3.25.76 -> deduplicated; 4.4.3 -> 4.6.7 | [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5) |

The direct dependency declarations are unchanged, including their ranges. `shadcn` resolves from 4.10.0 to 4.22.1 within its existing range; its MCP dependency now selects `@hono/node-server` 2.x. No override or out-of-range dependency is introduced (`npm ls --all` reports no problems). This is a transitive major update selected by its parent, not a direct dependency major upgrade.

## Remaining advisory paths

| Advisory / package path | Use and current limitation | Follow-up |
| --- | --- | --- |
| GHSA-ggr8-5vv4-36mx: `prisma@6.19.3` → `@prisma/config` → `deepmerge-ts` | Prisma configuration tooling; the advisory concerns merging recursive object graphs and stack exhaustion. npm only offers Prisma 7.10.1, which crosses the project's Prisma 6 boundary. | #778 investigates a Prisma 6-compatible option and input reachability. |
| GHSA-5j98-mcp5-4vw2: OpenNext Cloudflare → OpenNext AWS → `@node-minify/core` → `glob` | OpenNext build tooling. The advisory applies to CLI command execution with attacker-influenced matched filenames; package presence does not prove that CLI mode is used. npm proposes downgrading `@opennextjs/cloudflare` to 1.20.9 from 1.20.13. | #772 follow-up; preserve the merged OpenNext version and assess a compatible upstream fix and CLI reachability. |
| GHSA-5c6j-r48x-rmvq, GHSA-qj8w-gfj5-8c6v, GHSA-m5mm-p8h7-m29v: `@ducanh2912/next-pwa@10.2.9` → Workbox → `@rollup/plugin-terser` → `serialize-javascript` | PWA build toolchain. Advisory inputs include custom RegExp/Date behavior, crafted array-like objects and function-body serialization. Whether an external input reaches these build-time serialization paths is not established by npm audit. npm proposes downgrading next-pwa to 10.2.6. | #776 checks the PWA chain, input reachability, generated service worker, and safe compatible remedies. |
| GHSA-4qv8-2p9j-2685, GHSA-f72v-6w45-q472, GHSA-xjj6-f33q-929c: Wrangler → Miniflare → `undici` | Local Worker/build tooling; this path is absent from the production-only audit. The advisories concern EventSource parsing, integrity algorithm handling and excessive content encodings in responses. npm proposes downgrading Wrangler to 4.35.0, outside the current `^4.149.0` range. | #772 follow-up; assess network input reachability and do not downgrade Wrangler without validating Cloudflare compatibility. |

The remaining package rows in `npm audit` are transitive effects of these paths. `npm audit --omit=dev` still reports 8 findings, so the remaining production-tree findings need the follow-up investigations above; the audit result alone does not establish whether vulnerable code is reachable from Worker requests.

The previous shadcn/MCP/Express advisory paths are absent after the compatible lockfile update. #777 remains open: recheck its current CSS/CLI and production-install acceptance criteria after #775 merges; this snapshot does not close or complete that separate issue.

## Verification

### Previous session (2026-10-24)

The previous session recorded successful `npm ci`, `npm run check`, `npm run test:integration`, `npm run build`, `npm run build:worker`, and `npm run smoke:worker`. These are historical results, not fresh verification for the resumed session. The full E2E run passed 95/96 tests; `admin-visual-check.spec.ts` failed while waiting for the seeded admin login to reach the dashboard, and a standalone retry reproduced the failure.

### Resumed session (2026-10-25)

- `npm ci`: passed, generating both MySQL and D1 Prisma clients. Direct dependency declarations remain identical to the base lockfile, and `npm ls --all` reports no dependency problems.
- `npm run check`: passed after the clean install (71 suites / 720 tests). Lint retains one pre-existing unused-function warning in `scripts/build-konomys-csv.mjs`; there are no lint errors.
- `npm run test:integration:d1`: 16 suites / 97 tests passed, with the existing MySQL-only suite and 3 tests skipped.
- `npm run build`: passed.
- `codex review --uncommitted`: completed three times. The first pass flagged the pre-existing PC-specific `docker-compose.override.yml`, which is excluded from the proposed commit. The second pass temporarily excluded that file and the pre-existing `debug.log` from review scope, without changing persistent Git configuration, and reported no actionable defects in the lockfile or documentation. The third pass included the login-helper correction and updated documentation, and also reported no actionable defects. The reviewer's sandbox could not run all checks; the successful checks above were run separately in the Orca terminal.
- `npm run test:integration`: passed after Docker was started (15 suites / 84 tests; the existing 2 suites / 16 tests were skipped).
- Linux `npm ci`, `npm run build:worker` and `npm run smoke:worker`: passed in a clean `node:24.22.1` Debian container. The source was mounted read-only and copied without local `.env*`, `.dev.vars*`, dependencies or build artifacts. Prisma wasm was bundled (72 rewritten references), and all 10 Worker checks passed, including Credentials login, D1 writes, protected pages and Cron. Only an isolated local D1 was used.
- `admin-visual-check.spec.ts`: failed before the test-helper correction and passed afterwards. Trace evidence showed successful authentication and an admin session. A temporary timing diagnostic measured dashboard visibility at 8.344 seconds from test start, versus submission at 0.792 seconds: the old 5-second display assertion included authentication and initial navigation. Both login helpers now await `page.waitForURL("/")` before checking the dashboard. Assertion timeouts and application authentication behavior are unchanged. The temporary diagnostic was removed.
- Full E2E: all 96 tests passed in 8.3 minutes with `.env.test` explicitly loaded. The first admin visual scenario also passed in the full suite. The post-fix `npm run check` passed again (71 suites / 720 tests).

E2E coverage was inspected in the test bodies: `smoke.spec.ts` checks real login, stubbed book search, reading status, review submission and logout; `admin-visual-check.spec.ts` checks all three admin tabs; `auth-session.spec.ts` checks issued sessions. This issue changes the dependency graph rather than adding a screen or endpoint. Existing E2E scenarios cover application compatibility, while lockfile/audit comparison and `npm ls` directly verify the dependency changes. E2E alone does not verify build-time tools; the Linux Worker build and HTTP smoke remain separate required checks.

Local verification above records the pre-commit snapshot. Remaining audit warnings are assigned above to #772, #776 and #778. Deployment is outside this change. The pre-existing `debug.log` and PC-specific Compose override are not part of the proposed commit.

### PR CI follow-up

The first CI run for PR #781 passed the D1 and Worker jobs, but the normal E2E run reported 94 passed, one flaky session/logout scenario (passed on retry), and one failed book-search loan-check scenario. The failed scenario's page snapshot explicitly displayed the search API's HTTP 429 message; it was not a missing loan-check UI regression.

The loan-check E2E now waits for either results or that specific rate-limit message, and only for 429 waits past the API's 500ms interval before reloading once. The unregistered-book scenario deliberately returns 429 for the first search request, then continues to the real application API and still verifies the edition inventory and zero book/reading-status writes. This covers the recovery branch without mocking successful search or inventory responses.

Docker Desktop was stopped when this follow-up was made, so the attempted local E2E stopped at test DB connection rather than exercising the test. The follow-up's database/E2E verification is performed by PR CI; consult the latest check results there. The session/logout flake is recorded as an observation, not claimed fixed by this search-test change.
