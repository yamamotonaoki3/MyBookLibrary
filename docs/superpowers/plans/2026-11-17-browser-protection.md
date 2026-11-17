# Browser protection implementation plan (#841)

> **For agentic workers:** Use superpowers:executing-plans. Inline implementation is assigned; no additional subagents. Steps use checkbox syntax.

**Goal:** Preserve existing HTTP(S) library reservations and arbitrary-host cover images while enforcing safe Web URLs, fallbacks and compatible browser headers.
**Architecture:** A pure shared URL boundary feeds controller validation and two client UI boundaries. Next headers apply to all paths and Cloudflare ASSETS uses a synchronized public/_headers declaration; CSP keeps required inline scripts/styles and never adds server-side image proxying.
**Tech Stack:** Existing Next 16.4.3 / React / TypeScript / Zod / Jest / Playwright; no new dependencies.
**Spec:** ../specs/2026-11-17-browser-protection-design.md

## Global constraints
- User selected minimum option A and delegated details. No nonce/HTTPS-only/host allowlist expansion.
- Isolated local tests with dummy data/stubs only; no production/staging/external SaaS connections.
- No DB change, deployment, commit, push, PR or merge in this implementation phase.
- Preserve main/other worktrees and existing dirty files. Task shell runs in dedicated Orca terminal, Node children windowsHide:true.

## Review focus
- Non-Web/userinfo/control/backslash URL inputs never become actionable links or image requests; task1 table and UI/API tests.
- HTTP library destinations and arbitrary HTTPS cover hosts still work; task1/UI/local browser tests.
- Failed image source then changed source recovers without stale error state; task2 rerender test.
- Auth endpoints, static assets and pre-login SW receive compatible headers; task3 actual response assertions.
- Production CSP retains Next hydration, PWA worker and fake-media camera operation; task3 production local E2E. Real devices/Google roundtrip are unverified.

### Task 1: Web URL boundary and reservation link
Files: src/lib/webUrl.ts, src/lib/validations.ts, cover-input Route Handlers, LibraryAvailabilityModal.tsx; node browserProtectionInputs/validations/API tests and UI BrowserProtection.test.tsx.
Interface: getSafeWebUrl(value:unknown):string|null; optional CoverImageUrlSchema accepts undefined/null/empty and safe HTTP(S), otherwise validation error.
- [x] Write input/link tests against existing behavior; run targeted Jest and record expected RED failures.
- [x] Add URL helper/schema and use at every cover input boundary before DB writes; normalize empty to null.
- [x] Link only safe reserveurl; keep status text/target/rel, announce external new-tab destination. Run targeted GREEN.

### Task 2: Cover fallback
Files: src/components/ui/BookCover.tsx; admin, awards, books search/detail/list, favorite-author cover call sites; UI tests.
Interface: BookCover takes src:string|null|undefined, alt, fill/width/height/className/sizes/fallbackClassName; handles failed source independently so a changed src retries.
- [x] Write real award-card image error test and observe RED.
- [x] Implement shared safe image+fallback, preserve six existing wrappers/dimensions/alt; invalid/absent/failed source gives No Image.
- [x] Add source-change recovery and protocol cases; run targeted GREEN and check layout locally later.

### Task 3: Response protection and local regressions
Files: src/lib/browserProtection.ts, next.config.ts, node policy/config tests, e2e/browser-protection.spec.ts, test stub/fixtures if needed, docs/browser-protection.md.
Interface: buildSecurityHeaders(development:boolean):{key:string,value:string}[]; Next headers route /:path*.
- [x] Write Next config header behavior test and observe RED.
- [x] Set nosniff, DENY, strict-origin-when-cross-origin, camera self/microphone none. CSP default self, script self+unsafe-inline(dev unsafe-eval), style self+unsafe-inline, img self+http+https+data, font self, connect self(dev ws/wss), worker/media self+blob, object/frame none, base/form self. No HSTS/preload/COOP policy expansion.
- [x] Node tests verify environment boundary; local E2E checks actual headers, safe links/invalid links, cover success/error, harmless untrusted text, CSP blocks a controlled foreign script while Next stays interactive.
- [x] Run npm check, targeted integration/E2E, isolated build and production PWA/fake-camera regressions. Read .env.test explicitly; use own ports and coordinate DB use with root. Record every result and unverified boundary.
- [x] Update relevant feature/API/test docs and ledger. Hand complete uncommitted changes to root for independent CLI review; no commit yet.

Self-review: all accepted A requirements mapped above. Shared interface is getSafeWebUrl; URL schema is server-only Zod consumer and BookCover only imports pure helper. Directives are compatibility-limited, not strict XSS prevention. No unapproved dependency/DB/publication step.

Review-1 follow-up: tracked fake-camera flags, server-side local calil reservation fixture under active SW, correct scanner cancel locator, and ASSETS production declaration synchronization implemented by codex exec. Targeted 5 tests and production PWA 3 tests passed. Final check passed (93 suites / 909 tests plus type/lint/docs/worker checks); independent re-review 2 had no findings. Local assets-only HTTP checks passed for SW/manifest and the temporary server was closed; deployment headers and real device/external services remain unverified.
