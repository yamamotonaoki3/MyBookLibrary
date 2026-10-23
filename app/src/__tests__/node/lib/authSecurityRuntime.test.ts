import { execFileSync } from "node:child_process";
import path from "node:path";

describe("Auth.jsの設定異常時の実行時保護", () => {
  it("設定エラーをセッションとして公開せず、実ライブラリとアプリのガードが拒否する", () => {
    const fixture = path.resolve(__dirname, "../../helpers/authSecurityRuntime.mjs");
    const result = JSON.parse(execFileSync(process.execPath, ["--import", "tsx", fixture], {
      encoding: "utf8",
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    }));
    expect(result.configurationErrorAuth).toBeNull();
    expect(result.configurationErrorStatus).toBe(307);
    expect(result.appGuardStatus).toBe(307);
    expect(new URL(result.appGuardLocation).pathname).toBe("/login");
  });
});
