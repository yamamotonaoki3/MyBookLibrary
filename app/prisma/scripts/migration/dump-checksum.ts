/**
 * dumpファイルのSHA-256チェックサムを計算し `<dump>.sha256` として保存したうえで、
 * dumpファイル自体を読み取り専用化する（誤って上書き・削除するリスクを下げる）。
 *
 * 使い方:
 *   cd app && npx tsx prisma/scripts/migration/dump-checksum.ts <dumpファイルのパス>
 */
import { readFileSync, writeFileSync, chmodSync, existsSync } from "node:fs";
import { computeSha256 } from "@/lib/migration/checksum";

function main(): void {
  const dumpPath = process.argv[2];
  if (!dumpPath) {
    throw new Error("使い方: npx tsx prisma/scripts/migration/dump-checksum.ts <dumpファイルのパス>");
  }
  if (!existsSync(dumpPath)) {
    throw new Error(`dumpファイルが見つかりません: ${dumpPath}`);
  }

  const data = readFileSync(dumpPath);
  const checksum = computeSha256(data);
  const checksumPath = `${dumpPath}.sha256`;
  writeFileSync(checksumPath, `${checksum}  ${dumpPath}\n`, "utf-8");
  console.log(`チェックサムを保存しました: ${checksumPath}`);
  console.log(`SHA-256: ${checksum}`);

  try {
    // dumpにはパスワードハッシュ・OAuthトークン等の機密情報が含まれる。
    // Unix系のマルチユーザー環境では、通常の作成時権限(0o644)のままだと
    // 他のローカルユーザーからも読み取れてしまうため、所有者のみ読み取り可能な
    // 0o400（読み取り専用かつ他ユーザーはアクセス不可）へ変更する。
    chmodSync(dumpPath, 0o400);
    console.log(`dumpファイルを所有者のみ読み取り可能にしました（0o400）: ${dumpPath}`);
  } catch (err) {
    console.warn(`⚠ dumpファイルの権限変更に失敗しました（続行します）: ${String(err)}`);
  }
}

main();
