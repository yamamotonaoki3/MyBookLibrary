import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // API Routeはlib/loggerでのログ出力に統一するため、console直呼びをエラーにする。
  {
    files: ["src/app/api/**/*.ts"],
    rules: {
      "no-console": "error",
    },
  },
  // Prisma の $transaction は、D1 ではエラーにならず非原子的に実行されるため使わない。
  // 複数の書き込みを原子的に実行するときは、MySQL と D1 の両方で成立する atomically（src/lib/atomically.ts）を使う。
  // （docs/cloudflare-d1-migration-plan.md §5-3）
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/lib/atomically.ts", "src/__tests__/**", "src/lib/__mocks__/**"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "MemberExpression[property.name='$transaction']",
          message:
            "$transaction は D1 で非原子的に実行されます。複数の書き込みの原子化には atomically（src/lib/atomically.ts）を使ってください。",
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // OpenNext / Wrangler（Cloudflare Workers）のビルド成果物とローカル状態（.gitignore の /.open-next, /.wrangler と対応）:
    ".open-next/**",
    ".wrangler/**",
    // Prisma auto-generated files:
    "src/generated/**",
    // next-pwa auto-generated service worker files:
    "public/sw.js",
    "public/workbox-*.js",
    "public/swe-worker-*.js",
    // jest --coverage の出力（.gitignore の /coverage と対応）:
    "coverage/**",
    // playwright test の出力（.gitignore の /playwright-report, /test-results と対応）:
    "playwright-report/**",
    "test-results/**",
  ]),
]);

export default eslintConfig;
