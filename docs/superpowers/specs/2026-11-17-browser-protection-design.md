# Browser protection design (#841)

User selected minimum option A on 2026-11-17 and delegated implementation details. Preserve absolute HTTP(S) library URLs and arbitrary-host HTTP(S) cover images; reject other schemes, credentials, internal controls/whitespace and backslashes at input and display boundaries. No server-side arbitrary image fetch is introduced. Missing/invalid/failed images show No Image, source changes recover. Reservation links retain new-tab and noopener/noreferrer and announce the external destination.

Enforce compatible headers and a baseline CSP using Next headers across all paths. Keep unsafe-inline for existing Next bootstrap/styles; dev alone allows unsafe-eval and WebSocket connections. This is not nonce-based strict CSP and does not claim inline-script injection prevention. Nonce/HTTPS-only/host allowlist would narrow behavior and are out of accepted scope. HSTS/preload/COOP are not independently added.

All verification uses dummy/mock data in isolated local environments; real camera devices, external OAuth roundtrips, external library/image services and platform-delivered production headers remain unverified. No deployment or external settings changes. Details and tests are in the implementation plan.
