/**
 * 移行前に作成された手動登録本(source="manual", createdByUserId=null)について、
 * その本に対する最古のReadingStatusのユーザーを登録者と推定し、承認済みのものだけ
 * createdByUserIdへ反映する（docs/data-migration-spec-481.md 3章の運用に対応）。
 *
 * 自動実行はしない。必ず --dry-run で対応表を出力し、人手で1件ずつ確認・承認した
 * うえで、承認済みファイルを作り --apply-from に渡して本更新する。
 *
 *   # 1. dry-run: 対応表をJSONで出力する（DBは更新しない）
 *   cd app && npx tsx prisma/scripts/backfill-book-owner.ts --dry-run --out ./candidates.json
 *
 *   # 2. candidates.json を人手で確認し、承認したエントリだけを残した
 *   #    approved.json（[{ "bookId": 1, "userId": 5 }, ...] 形式）を作成する。
 *   #    推定できない(estimatedUserId=null)ものや、不審な推定は承認ファイルに含めない。
 *
 *   # 3. 承認済みファイルの内容だけを本更新する
 *   cd app && npx tsx prisma/scripts/backfill-book-owner.ts --apply-from ./approved.json
 */
import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";
import { PrismaClient } from "@/generated/prisma";
import {
  computeBackfillCandidates,
  filterApprovedUpdates,
  parseApprovedEntries,
  type ManualBookWithStatuses,
} from "@/lib/migration/backfillBookOwner";
import { assertMigrationTargetDatabaseUrl } from "./migration/migrationGuard";

const prisma = new PrismaClient();

type CliOptions =
  | { mode: "dry-run"; outPath?: string }
  | { mode: "apply-from"; approvedFilePath: string };

function parseArgs(argv: string[]): CliOptions {
  const dryRun = argv.includes("--dry-run");
  const applyFromIndex = argv.indexOf("--apply-from");
  const outIndex = argv.indexOf("--out");
  const outPath = outIndex >= 0 ? argv[outIndex + 1] : undefined;

  if (dryRun && applyFromIndex >= 0) {
    throw new Error("--dry-run と --apply-from は同時に指定できません。");
  }

  if (dryRun) {
    return { mode: "dry-run", outPath };
  }

  if (applyFromIndex >= 0) {
    const approvedFilePath = argv[applyFromIndex + 1];
    if (!approvedFilePath) {
      throw new Error("--apply-from には承認済みファイルのパスを指定してください。");
    }
    return { mode: "apply-from", approvedFilePath };
  }

  throw new Error(
    "実行モードを指定してください。まず --dry-run で対応表を出力し、人手で承認したうえで " +
      "--apply-from <承認済みファイル> を指定してください（無条件の全件更新はできません）。"
  );
}

async function loadManualBooksWithStatuses(): Promise<ManualBookWithStatuses[]> {
  const targets = await prisma.book.findMany({
    where: { source: "manual", createdByUserId: null },
    select: { id: true },
  });

  return Promise.all(
    targets.map(async (book) => {
      const statuses = await prisma.readingStatus.findMany({
        where: { bookId: book.id },
        select: { id: true, userId: true },
      });
      return { bookId: book.id, readingStatuses: statuses };
    })
  );
}

async function runDryRun(outPath: string | undefined): Promise<void> {
  const books = await loadManualBooksWithStatuses();
  const candidates = computeBackfillCandidates(books);
  const output = JSON.stringify(candidates, null, 2);

  if (outPath) {
    writeFileSync(outPath, output, "utf-8");
    console.log(`対応表を出力しました: ${outPath}`);
  } else {
    console.log(output);
  }

  const estimable = candidates.filter((c) => c.estimatedUserId !== null).length;
  console.log(
    `\n対象 ${candidates.length} 件（推定可能: ${estimable} 件、推定不能: ${candidates.length - estimable} 件）。` +
      "この対応表はDBを更新していません。内容を人手で確認し、妥当と承認したエントリだけを" +
      "含む承認ファイルを作成したうえで --apply-from に渡してください。"
  );
}

async function runApplyFrom(approvedFilePath: string): Promise<void> {
  const approvedRaw = readFileSync(approvedFilePath, "utf-8");
  const approved = parseApprovedEntries(JSON.parse(approvedRaw));

  const books = await loadManualBooksWithStatuses();
  const candidates = computeBackfillCandidates(books);
  const toApply = filterApprovedUpdates(candidates, approved);

  // 全ての手動登録本（source='manual'）について、更新前の状態を記録しておく。
  // これにより、更新後に「今回承認した書籍だけが変化し、それ以外は一切変化していない」
  // ことを検証できる（過去の実行や手動操作で既に設定済みの値を、今回の実行で
  // 誤って上書きしてしまっていないかも合わせて検出する）。
  const beforeManualBooks = await prisma.book.findMany({
    where: { source: "manual" },
    select: { id: true, createdByUserId: true },
  });
  const beforeByBookId = new Map(beforeManualBooks.map((book) => [book.id, book.createdByUserId]));

  // 1件でも失敗したら全体をロールバックする。for文で1件ずつ更新すると、
  // 途中で失敗した場合に前半分だけコミット済みのまま処理が中断し、
  // 再実行時にそれらの書籍が createdByUserId!=null のため対象から漏れてしまうため。
  await prisma.$transaction(
    toApply.map((entry) =>
      prisma.book.update({
        where: { id: entry.bookId },
        data: { createdByUserId: entry.userId },
      })
    )
  );

  // 更新後、対象になりうる全ての手動登録本（今回のtoApplyに限らない）を再取得し、
  // 承認したbookIdはそのuserIdに更新され、それ以外は更新前の値から一切変化していない
  // ことを完全に確認する（docs/data-migration-spec-481.md 3章の要件）。
  const approvedByBookId = new Map(toApply.map((entry) => [entry.bookId, entry.userId]));
  const afterManualBooks = await prisma.book.findMany({
    where: { source: "manual" },
    select: { id: true, createdByUserId: true },
  });

  const mismatches = afterManualBooks
    .map((book) => ({
      bookId: book.id,
      expected: approvedByBookId.get(book.id) ?? beforeByBookId.get(book.id) ?? null,
      actual: book.createdByUserId,
    }))
    .filter((entry) => entry.expected !== entry.actual);

  if (mismatches.length > 0) {
    throw new Error(
      "更新後のDB状態が承認内容と一致しません（承認していない書籍のcreatedByUserIdが" +
        "変化している、または承認したはずの値が反映されていない可能性があります）: " +
        JSON.stringify(mismatches) +
        "。トランザクションは完了していますが、内容を確認してください。"
    );
  }

  console.log(
    `承認ファイル ${approved.length} 件中、dry-run候補と一致した ${toApply.length} 件を本更新しました。` +
      "更新後のDB状態が承認内容と完全に一致することを確認済みです。"
  );
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  // restore-to-target.ts / verify-migration.ts と同様、誤って本番DBへ接続・
  // 書き込みしないことを、DBへアクセスする前に必ず確認する
  // （--apply-from時はcreatedByUserIdへの書き込みを伴うため特に重要）。
  assertMigrationTargetDatabaseUrl();

  if (options.mode === "dry-run") {
    await runDryRun(options.outPath);
  } else {
    await runApplyFrom(options.approvedFilePath);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
