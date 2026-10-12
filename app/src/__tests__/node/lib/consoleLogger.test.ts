import { createConsoleLogger } from "@/lib/logging/consoleLogger";

type Method = "debug" | "info" | "warn" | "error";

function captureConsole() {
  const lines: Record<Method, string[]> = { debug: [], info: [], warn: [], error: [] };
  const spies = (Object.keys(lines) as Method[]).map((method) =>
    jest.spyOn(console, method).mockImplementation((...args: unknown[]) => {
      lines[method].push(String(args[0]));
    })
  );
  return { lines, restore: () => spies.forEach((spy) => spy.mockRestore()) };
}

describe("createConsoleLogger", () => {
  let capture: ReturnType<typeof captureConsole>;
  beforeEach(() => {
    capture = captureConsole();
  });
  afterEach(() => capture.restore());

  it("オブジェクトとメッセージを 1 行の JSON で出力する", () => {
    createConsoleLogger({ level: "debug" }).error({ userId: 7 }, "失敗しました");

    const [line] = capture.lines.error;
    expect(JSON.parse(line)).toMatchObject({ level: "error", userId: 7, msg: "失敗しました" });
    expect(JSON.parse(line).time).toEqual(expect.any(String));
  });

  it("メッセージだけの呼び出しにも対応する", () => {
    createConsoleLogger({ level: "debug" }).info("起動しました");

    expect(JSON.parse(capture.lines.info[0])).toMatchObject({ level: "info", msg: "起動しました" });
  });

  it("レベルに対応する console メソッドへ出力する", () => {
    const logger = createConsoleLogger({ level: "debug" });
    logger.debug("d");
    logger.info("i");
    logger.warn("w");
    logger.error("e");

    expect(capture.lines.debug).toHaveLength(1);
    expect(capture.lines.info).toHaveLength(1);
    expect(capture.lines.warn).toHaveLength(1);
    expect(capture.lines.error).toHaveLength(1);
  });

  it("設定レベルより低いログは出力しない", () => {
    const logger = createConsoleLogger({ level: "warn" });
    logger.debug("d");
    logger.info("i");
    logger.warn("w");

    expect(capture.lines.debug).toHaveLength(0);
    expect(capture.lines.info).toHaveLength(0);
    expect(capture.lines.warn).toHaveLength(1);
  });

  it("Error は種別・メッセージ・スタックを持つオブジェクトにして出力する", () => {
    createConsoleLogger({ level: "debug" }).error({ err: new TypeError("壊れた") }, "処理に失敗");

    const out = JSON.parse(capture.lines.error[0]);
    expect(out.err).toMatchObject({ type: "TypeError", message: "壊れた" });
    expect(out.err.stack).toEqual(expect.any(String));
  });

  it("機密のキーを伏せ字にする（pino の redact 設定と同じ範囲）", () => {
    createConsoleLogger({ level: "debug" }).info(
      {
        password: "p",
        secretWord: "s",
        authorization: "Bearer x",
        body: { password: "p", secretWord: "s", token: "t", name: "公開してよい値" },
        token: "トップレベルの token は pino と同じく対象外",
      },
      "確認"
    );

    const out = JSON.parse(capture.lines.info[0]);
    expect(out.password).toBe("[REDACTED]");
    expect(out.secretWord).toBe("[REDACTED]");
    expect(out.authorization).toBe("[REDACTED]");
    expect(out.body).toEqual({
      password: "[REDACTED]",
      secretWord: "[REDACTED]",
      token: "[REDACTED]",
      name: "公開してよい値",
    });
    expect(out.token).toBe("トップレベルの token は pino と同じく対象外");
  });

  it("Error に付いた機密のキーも伏せ字にする", () => {
    const err = Object.assign(new Error("認証失敗"), { token: "秘密", code: "E_AUTH" });

    createConsoleLogger({ level: "debug" }).error({ err }, "確認");

    const out = JSON.parse(capture.lines.error[0]);
    expect(out.err.token).toBe("[REDACTED]");
    expect(out.err.code).toBe("E_AUTH");
  });

  it("循環参照を含んでいてもログ出力が失敗しない", () => {
    const loop: Record<string, unknown> = { name: "loop" };
    loop.self = loop;

    expect(() => createConsoleLogger({ level: "debug" }).info({ loop }, "循環")).not.toThrow();
    expect(JSON.parse(capture.lines.info[0]).loop.self.self).toBe("[Circular]");
  });

  it("pino 互換のレベル名（silent / fatal / trace）を解釈する", () => {
    const silent = createConsoleLogger({ level: "silent" });
    silent.error("出ない");
    expect(capture.lines.error).toHaveLength(0);

    const fatal = createConsoleLogger({ level: "fatal" });
    fatal.error("出ない");
    expect(capture.lines.error).toHaveLength(0);

    createConsoleLogger({ level: "trace" }).debug("出る");
    expect(capture.lines.debug).toHaveLength(1);
  });

  it("未知のレベル名は info として扱う", () => {
    const logger = createConsoleLogger({ level: "unknown" });
    logger.debug("出ない");
    logger.info("出る");
    expect(capture.lines.debug).toHaveLength(0);
    expect(capture.lines.info).toHaveLength(1);
  });

  it("BigInt を含んでいてもログ出力が失敗しない", () => {
    createConsoleLogger({ level: "debug" }).info({ count: BigInt(3) }, "件数");

    expect(JSON.parse(capture.lines.info[0]).count).toBe("3");
  });
});
