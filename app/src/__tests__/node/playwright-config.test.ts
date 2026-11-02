import path from 'node:path';

jest.mock('@playwright/test', () => ({
  defineConfig: (config: unknown) => config,
  devices: { 'Desktop Chrome': {} },
}));

jest.mock('fs', () => {
  const actual = jest.requireActual('fs');
  const path = jest.requireActual('path');
  const testEnvPath = path.resolve(__dirname, '../../../.env.test');
  const isTestEnv = (filePath: unknown) =>
    typeof filePath === 'string' && path.resolve(filePath) === testEnvPath;

  return {
    ...actual,
    existsSync: (filePath: unknown) =>
      isTestEnv(filePath) ? true : actual.existsSync(filePath),
    readFileSync: (filePath: unknown, ...args: unknown[]) =>
      isTestEnv(filePath)
        ? Buffer.from('DATABASE_URL=mysql://testuser_:test@127.0.0.1:3307/mybooklibrary_test')
        : actual.readFileSync(filePath, ...args),
  };
});

jest.mock('dotenv', () => ({
  parse: () => ({
    DATABASE_URL: 'mysql://testuser_:test@127.0.0.1:3307/mybooklibrary_test',
    ...(process.env.PLAYWRIGHT_CONFIG_TEST_FORCE_COLOR === undefined
      ? {}
      : { FORCE_COLOR: process.env.PLAYWRIGHT_CONFIG_TEST_FORCE_COLOR }),
  }),
}));

type Server = { command?: string; env?: Record<string, string> };
type PlaywrightConfig = { webServer: Server[] };

function loadConfig(
  configPath: string,
  platform: NodeJS.Platform,
  testForceColor?: string,
): PlaywrightConfig {
  const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
  const originalForceColor = process.env.PLAYWRIGHT_CONFIG_TEST_FORCE_COLOR;
  Object.defineProperty(process, 'platform', { configurable: true, value: platform });
  if (testForceColor === undefined) {
    delete process.env.PLAYWRIGHT_CONFIG_TEST_FORCE_COLOR;
  } else {
    process.env.PLAYWRIGHT_CONFIG_TEST_FORCE_COLOR = testForceColor;
  }

  try {
    let config: PlaywrightConfig | undefined;
    jest.isolateModules(() => {
      // 動的な設定ファイルを隔離したモジュールキャッシュで読み込むため、require を使う。
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const loadedConfig = require(configPath);
      config = loadedConfig.default ?? loadedConfig;
    });
    if (!config) throw new Error(`Playwright config did not load: ${configPath}`);
    return config;
  } finally {
    if (originalPlatform) Object.defineProperty(process, 'platform', originalPlatform);
    if (originalForceColor === undefined) delete process.env.PLAYWRIGHT_CONFIG_TEST_FORCE_COLOR;
    else process.env.PLAYWRIGHT_CONFIG_TEST_FORCE_COLOR = originalForceColor;
  }
}

function serverFor(config: PlaywrightConfig, commandPart: string): Server {
  const server = config.webServer.find(({ command }) => command?.includes(commandPart));
  if (!server) throw new Error(`No webServer command includes ${commandPart}`);
  return server;
}

describe('Playwright server color environment', () => {
  const nextConfig = path.resolve(__dirname, '../../../playwright.config.ts');
  const demoConfig = path.resolve(__dirname, '../../../playwright.demo.config.ts');
  const pwaConfig = path.resolve(__dirname, '../../../playwright.pwa.config.ts');

  it('disables forced color in the Windows Next server while preserving the test environment elsewhere', () => {
    const windows = loadConfig(nextConfig, 'win32', '1');
    const linux = loadConfig(nextConfig, 'linux', '1');
    const macos = loadConfig(nextConfig, 'darwin');
    const windowsNextEnv = serverFor(windows, 'npm run dev').env;
    const linuxNextEnv = serverFor(linux, 'npm run dev').env;
    const macosNextEnv = serverFor(macos, 'npm run dev').env;

    expect(windowsNextEnv?.FORCE_COLOR).toBe('0');
    expect(linuxNextEnv?.FORCE_COLOR).toBe('1');
    expect(macosNextEnv?.FORCE_COLOR).toBeUndefined();
  });

  it('inherits the Windows override in demo mode while leaving the stub and PWA servers unchanged', () => {
    const demo = loadConfig(demoConfig, 'win32');
    expect(serverFor(demo, 'npm run dev').env).toMatchObject({
      FORCE_COLOR: '0',
      DEMO_MODE: 'true',
    });

    const normal = loadConfig(nextConfig, 'win32');
    expect(serverFor(normal, 'stub-server.ts').env).toEqual({ STUB_SERVER_PORT: '3999' });

    const pwa = loadConfig(pwaConfig, 'win32');
    expect(serverFor(pwa, 'npm run start').env?.FORCE_COLOR).toBeUndefined();
  });
});
