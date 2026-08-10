import type { Config } from "jest";

/**
 * node / jsdom / integration の3 project 構成。
 *
 * projects を使う場合、ルート直下に書いた設定は各 project へ自動継承
 * されない（実測で確認済み）。そのため共通部を明示的に各 project へ
 * 展開している。
 */
const shared = {
  preset: "ts-jest",
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  // 呼び出し履歴のみをクリアする。resetMocks は使わない。Prisma モックの
  // $transaction に持たせた既定実装（コールバックへ同じモックを渡す）まで
  // 消えてしまい、2件目以降のテストだけが原因不明で失敗するため。
  clearMocks: true,
  // setupFiles: テスト環境の構築直後・jest/expect が使える前に実行される。
  // pino の LOG_LEVEL はモジュール読み込み時に評価されるため、logger を
  // import するどのテストより先に走らせる必要がある。
  setupFiles: ["<rootDir>/jest.setup.silent-logger.ts"],
  // setupFilesAfterEnv: jest/expect が使える状態になった後に実行される。
  // jest.fn() を使う外部通信ガードはここに置く。
  setupFilesAfterEnv: ["<rootDir>/jest.setup.network.ts"],
};

const config: Config = {
  projects: [
    {
      ...shared,
      displayName: "node",
      testEnvironment: "node",
      testMatch: ["<rootDir>/src/__tests__/node/**/*.test.ts"],
    },
    {
      ...shared,
      displayName: "jsdom",
      testEnvironment: "jsdom",
      testMatch: ["<rootDir>/src/__tests__/ui/**/*.test.ts?(x)"],
      setupFilesAfterEnv: [
        ...shared.setupFilesAfterEnv,
        "<rootDir>/jest.setup.tsx",
      ],
      moduleNameMapper: {
        ...shared.moduleNameMapper,
        "\\.(css|less|scss|sass)$": "identity-obj-proxy",
      },
    },
    {
      ...shared,
      displayName: "integration",
      testEnvironment: "node",
      testMatch: ["<rootDir>/src/__tests__/integration/**/*.itest.ts"],
      // .env.test の読み込みと接続先の安全確認、prisma migrate deploy を行う。
      // 開発用DBへ誤って migrate してしまう事故を防ぐガードを含む。
      globalSetup: "<rootDir>/jest.global-setup.integration.ts",
    },
  ],
  // .tsx（未テストのコンポーネント・ページ）も含めて測定する。含めないと
  // 「テストが無いファイルほど分母に入らず数字が良く見える」状態になる。
  collectCoverageFrom: [
    "src/**/*.{ts,tsx}",
    "!src/**/*.d.ts",
    "!src/generated/**",
    "!src/**/__mocks__/**",
    "!src/__tests__/**",
  ],
  // ラチェット運用。実測値（Statements 13.4% / Branches 10.53%）の少し下を
  // 初期値とし、以降の Phase で機能ごとにテストを追加するたびに引き上げる。
  // 最初から高い値を目標にしない。
  coverageThreshold: {
    global: {
      statements: 11,
      branches: 8,
    },
  },
};

export default config;
