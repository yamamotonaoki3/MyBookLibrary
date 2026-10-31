# Issue #806: shadcn runtime dependency verification

## Change

`shadcn` was moved from `dependencies` to `devDependencies` with its existing range `^4.10.0`. Its lock identity is unchanged: version `4.22.1`, registry tarball `https://registry.npmjs.org/shadcn/-/shadcn-4.22.1.tgz`, and integrity `sha512-LbB4Lro+b0qSVki/tgL5edtKylEnXe1ppxMJC12d7NHPgaT+eSgJGMQULwP72V7X9tbiUq7xfx3VDAfB7jdGoA==`. The lock comparison found no version, resolved URL, integrity, or dependency-edge change outside the root classification and derived `dev` flags.

Baseline: `a4911740bb560ea4c970e8e4ae4081421b66d135`; `app/package.json` SHA-1 `cb2c40fbe1ab0c7eb7049b5a7a27c003f3a74b95`; `app/package-lock.json` SHA-1 `5d4fa15b4631710bed051523bbe05a3e6f882daa`. The repository search found the CSS import in `src/app/globals.css`; it found no shadcn runtime import in app source, Worker, or scripts. The baseline `npm explain` records include the CLI's MCP/Express dependency paths.

`src/app/globals.css` still imports `shadcn/tailwind.css`. No source, Prisma, PWA, or other dependency classification was changed.

## Measured production impact

The baseline and candidate were installed from clean copies with the same Node/npm versions (`v24.22.1` / `11.19.1`) and `npm ci --omit=dev` with postinstall enabled.

| Measurement | Baseline | Candidate | Difference |
|---|---:|---:|---:|
| npm production install package paths | 680 | 492 | −188 |
| production install `node_modules` bytes | 838,869,343 | 820,223,126 | −18,646,217 |
| Docker runner package manifests | 1,234 | 1,022 | −212 |
| Docker runner `node_modules` bytes | 765,665,888 | 728,058,578 | −37,607,310 |
| Docker image size | 2,061,739,852 | 1,980,290,818 | −81,449,034 |

The Docker image size includes all image layers and is reported separately from the runner's installed `node_modules` size. The reduced production-only audit set is a consequence of moving the CLI and its private dependency subtree out of the production install; it is not a vulnerability fix.

## CSS and runtime evidence

Baseline and candidate Docker builds both completed. The builder-produced CSS manifests were identical:

| CSS asset | Bytes | SHA-256 |
|---|---:|---|
| `css/09134e3ab47a454b.css` | 83,527 | `21a01fd19245b29882370579859d276765dbb3c29ed808b9925fb2941ebbc41a` |

The same assertion checked the installed package itself, not the manifest text:

- Baseline clean production install: `npm ci --omit=dev` exited 0; the assertion failed with exit 1 because `shadcn@4.22.1` was present.
- Baseline Docker runner: assertion failed with exit 1 because `shadcn` was present.
- Candidate clean production install: `npm ci --omit=dev`, `npm ls --omit=dev --all`, and the assertion all exited 0. Postinstall generated both Prisma clients, and the Prisma CLI reported its version successfully.
- Candidate Docker runner: assertion exited 0; both generated Prisma output directories existed; the Prisma CLI ran successfully.

The candidate was exercised through both `next start` using the clean production-only install and the Docker standalone runner. With fictional test-only auth settings, both served `/login` with 200, served the linked CSS with 200, redirected unauthenticated `/books` with 307, and returned 200 from `/api/auth/providers` and `/api/version`. The standalone CSS response was 83,527 bytes.

The browser and Playwright E2E suites were not run. The existing login/auth E2E scenarios check user-visible auth behavior, and `admin-visual-check.spec.ts` checks admin tabs and selection state; neither verifies the production dependency tree or compares CSS bytes. The production-only `next start` and Docker HTTP checks plus the exact baseline/candidate CSS hash comparison directly cover this dependency move and asset delivery. A visual browser comparison remains unverified.

## Audits

Audits were captured for baseline and candidate at the same point in the task. The full audit reports identical vulnerable-package records and identical advisory URLs; moving `shadcn` did not change those package versions or advisories.

| Audit set | Baseline (low / moderate / high / critical) | Candidate (low / moderate / high / critical) |
|---|---:|---:|
| All dependencies | 53 (3 / 43 / 7 / 0) | 53 (3 / 43 / 7 / 0) |
| `--omit=dev` | 18 (3 / 12 / 3 / 0) | 14 (2 / 9 / 3 / 0) |

The five unchanged advisory URLs are `GHSA-3g3m-2fjr-6pw4`, `GHSA-5j98-mcp5-4vw2`, `GHSA-g3hv-75wg-m249`, `GHSA-gcqx-w48m-w2h4`, and `GHSA-ggr8-5vv4-36mx`. The four package findings absent from the candidate production-only report are `shadcn`, `@shadcn/registry`, `ts-morph`, and `@ts-morph/common`; all remain in the full candidate audit. The lower `--omit=dev` count is a classification/reporting change, not remediation. Other full-tree findings remain unchanged.

## Worker and checks

The clean candidate was installed and built in a Linux/glibc Node `22.23.4` environment. `npm run build:worker` and `npm run smoke:worker` succeeded. All ten smoke checks passed, including login, unauthenticated redirect, password outcomes, Prisma+D1 write, session, Cron authorization, scheduled trigger, and secret-free logs. The temporary Linux harness included system CA certificates and `SSL_CERT_FILE` so Wrangler's local Workers runtime could start; no application or dependency changes were made for that environment setup. The smoke suite used local D1 only.

On the clean candidate copy with temporary Git metadata, `npm ci`, `npm ls --all`, and `npm run check` exited 0. `check:docs` reported 66 Markdown files and no broken links. The first clean copy lacked Git metadata, so its initial check stopped at `git rev-parse`; the full-source temporary copy with Git metadata was used for the successful check. No integration/E2E database suite was run because this change only changes the production dependency graph and has no database behavior change.

## Scope limits

This change removes the CLI and packages exclusive to its development dependency subtree from production-only installs. It does not update vulnerable transitive packages, remove CSS or alter its supplier, change Worker code, or claim a reduction in application vulnerabilities. Visual rendering in a browser and database-backed E2E behavior were not exercised; CSS byte identity and production HTTP delivery were verified instead.
