# next-pwa local fork

Source: @ducanh2912/next-pwa 10.2.9 (MIT).
Tarball: https://registry.npmjs.org/@ducanh2912/next-pwa/-/next-pwa-10.2.9.tgz
Integrity: sha512-Wtu823+0Ga1owqSu1I4HqKgeRYarduCCKwsh1EJmJiJqgbt+gvVf5cFwFH8NigxYyyEvriAro4hzm0pMSrXdRQ==

## Changes

Only package.json differs: version 10.2.9 → 10.2.9-mbl.1; private: true added; workbox-build 7.1.1 and workbox-core/workbox-webpack-plugin/workbox-window 7.1.0 → 7.4.1. fast-glob, semver and peer constraints are unchanged. All distributed JavaScript and declarations are byte-identical.

Install from file:vendor/next-pwa with project .npmrc install-links=true. Copy vendor and .npmrc before every npm ci, including Docker runtime. Root .gitattributes disables newline conversion for this directory so upstream bytes survive Windows checkouts. No registry publication.

## Recreate and verify

1. Run npm pack @ducanh2912/next-pwa@10.2.9 --json in a temporary directory. Confirm the returned integrity matches above.
2. Extract the tarball. Copy package/LICENSE, package/README.md, package/dist and package/package.json here.
3. Verify the original SHA-256 values below before editing package.json. Apply only the changes listed above.
4. From app run npm install --package-lock-only --ignore-scripts, npm ci, npm ls --all and npm audit. Review the diff; do not use force/overrides. Run quality checks, production PWA E2E, Docker and Worker checks as described in docs/dependency-audit-776.md.
5. For future upstream/Workbox updates repeat the provenance and compatibility checks. Remove this fork only when a reviewed upstream release satisfies the same checks.

## Original file SHA-256

| File | SHA-256 |
| --- | --- |
| LICENSE | 56eba30898d0392aef58d3bc1f9a30ccbffd01c915acd7f2bac7f32077c5810c |
| README.md | b805b53da554bd9af984ecaa37322f774d181c9fcaa54f2f9fa3e521f8f9beb9 |
| dist/fallback.cjs | 3490a00fd41fa39e8a12b2accfd646cfda1614fca64c55af1d05526f7aacf679 |
| dist/fallback.js | b9ab290820b0ac0892ca690f733a34466420d74af532807f0a4e25eb281b8d87 |
| dist/index.cjs | 34055651bcbf868e00344f49131c76817765d9766b78b14c17764ba8be50636f |
| dist/index.d.cts | 788428a13bb67b807b776d458603343e2213fc180960b951d991d096c212741c |
| dist/index.d.ts | 788428a13bb67b807b776d458603343e2213fc180960b951d991d096c212741c |
| dist/index.js | 2ba541fe14adbe02137d114b3bfcfb3f0ec5112f073d6ce39f96edd466a62513 |
| dist/sw-entry-worker.cjs | 1f74cd1454473c9658d090e0b65fa071ed1c067c7644c10ca86489ed350ef8ad |
| dist/sw-entry-worker.js | 440fc339f58bb6f05c5a4e617e79265946060c9d9047dbe630851d67389f3e91 |
| dist/sw-entry.cjs | 342f74647c8cbefd73ed9adec77b5393da95ffe27b713a1ffb6d8d849a1f276e |
| dist/sw-entry.d.cts | 399e4fb7b1d9f4e51077a7f87627a897b14ff3f8a0dfac1c22c6d41d43994aad |
| dist/sw-entry.d.ts | 399e4fb7b1d9f4e51077a7f87627a897b14ff3f8a0dfac1c22c6d41d43994aad |
| dist/sw-entry.js | 1d2983041d4d3a2bda262850d72f289ee90ee702e927c27da88c912d7ed30335 |
| package.json | 6a5a17a2a17d10a7e07c0ed6839002a6338a5319a60576a859285ad3704a181a |
