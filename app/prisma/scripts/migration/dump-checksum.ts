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
    // Windows/Unix双方で「書き込み不可」を意味する権限（0o444）へ変更する。
    // 権限変更に失敗しても致命的ではないため、警告に留める。
    chmodSync(dumpPath, 0o444);
    console.log(`dumpファイルを読み取り専用化しました: ${dumpPath}`);
  } catch (err) {
    console.warn(`⚠ dumpファイルの読み取り専用化に失敗しました（続行します）: ${String(err)}`);
  }
}

main();
