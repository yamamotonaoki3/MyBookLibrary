/**
 * ステージング D1 に入れる、本番相当の件数の架空データ（SQL）を生成する。
 * 目的: Prisma のメジャー更新などを、本番の件数で動かして確認する（D1 は 1 クエリの変数が 100 個まで、など）。
 *
 * - 実データ・個人情報は使わない。すべて架空で、名前に「PERF」を含む。
 * - 識別: 追加する行の id は、すべて ID_BASE（100000）以上。cleanup.sql が、この条件だけで削除する。
 * - このスクリプトは SQL ファイルを書くだけで、DB には接続しない。
 *   適用は、環境を明示して行う: npx wrangler d1 execute mybooklibrary-staging-db --remote --env staging --file <出力先>
 *   （本番 D1 には適用しないこと。出力ファイルの先頭にも、その旨を書く）
 *
 * 使い方: node prisma/scripts/staging-volume/generate-seed.mjs <出力先.sql> [reviewerUserId]
 *   reviewerUserId: 読書ステータスを付ける、ステージングのテスト用ユーザーの id（既定: 2）
 */
import { writeFileSync } from "node:fs";

const ID_BASE = 100000;
const [, , outPath, reviewerArg] = process.argv;
if (!outPath) {
  console.error("出力先の SQL ファイルを指定してください");
  process.exit(1);
}
const reviewerUserId = Number(reviewerArg ?? 2);

// 本番の件数（2026-11-10 時点。テーブルごとの件数のみを読み取り専用で数えた値）
const COUNTS = { authors: 1393, awards: 4, books: 3016, bookIsbns: 1699, awardEntries: 3035, readingStatuses: 65, jobs: 4, items: 5561 };

const pad = (n, w = 5) => String(n).padStart(w, "0");
const q = (s) => `'${String(s).replaceAll("'", "''")}'`;
const lines = ["-- ステージング専用の架空データ。本番 D1 には適用しないこと。cleanup.sql で削除できる（id >= 100000）。"];

function insert(table, columns, rows) {
  for (let i = 0; i < rows.length; i += 50) {
    const chunk = rows.slice(i, i + 50).map((r) => `(${r.join(", ")})`).join(",\n  ");
    lines.push(`INSERT INTO ${table} (${columns.join(", ")}) VALUES\n  ${chunk};`);
  }
}

// authors
insert("authors", ["id", "name"],
  Array.from({ length: COUNTS.authors }, (_, i) => [ID_BASE + i, q(`PERF著者${pad(i + 1)}`)]));

// awards
insert("awards", ["id", "name"],
  Array.from({ length: COUNTS.awards }, (_, i) => [ID_BASE + i, q(`PERF賞${i + 1}`)]));

// books（著者は順に割り当てる）。isbn は 999 で始まる架空の 13 桁。
const bookRows = Array.from({ length: COUNTS.books }, (_, i) => {
  const year = 1990 + (i % 36);
  const month = 1 + (i % 12);
  return [
    ID_BASE + i,
    ID_BASE + (i % COUNTS.authors),
    q(`[PERF_TEST] 本${pad(i + 1)}`),
    q(`999${pad(i + 1, 10)}`),
    q(`${year}-${pad(month, 2)}-01T00:00:00.000+00:00`),
    0,
    "NULL",
    q("rakuten"),
  ];
});
insert("books", ["id", "author_id", "title", "isbn", "published_at", "published_at_unknown", "cover_image_url", "source"], bookRows);

// book_isbns（本の一部に、予備の ISBN を付ける）
insert("book_isbns", ["id", "book_id", "isbn", "is_primary", "source", "created_at"],
  Array.from({ length: COUNTS.bookIsbns }, (_, i) => [
    ID_BASE + i, ID_BASE + (i % COUNTS.books), q(`998${pad(i + 1, 10)}`), 0, q("manual"), q("2026-01-01T00:00:00.000+00:00"),
  ]));

// award_entries（本 × 賞 × 年が重複しないようにする。2周目以降は年を 10 年ずらす）
const awardEntryYear = (i) => 1990 + (i % 7) + Math.floor(i / COUNTS.books) * 10;
insert("award_entries", ["id", "book_id", "award_id", "year", "type"],
  Array.from({ length: COUNTS.awardEntries }, (_, i) => [
    ID_BASE + i, ID_BASE + (i % COUNTS.books), ID_BASE + (i % COUNTS.awards), awardEntryYear(i), q(i % 5 === 0 ? "winner" : "nominee"),
  ]));

// reading_statuses
const statuses = ["unread", "reading", "read"];
insert("reading_statuses", ["id", "user_id", "book_id", "status", "updated_at"],
  Array.from({ length: COUNTS.readingStatuses }, (_, i) => [
    ID_BASE + i, reviewerUserId, ID_BASE + i, q(statuses[i % 3]), q("2026-11-01T00:00:00.000+00:00"),
  ]));

// book_enrichment_jobs / items（完了済みの履歴として入れる）
insert("book_enrichment_jobs", ["id", "status", "total_count", "done_count", "success_count", "fail_count", "created_at"],
  Array.from({ length: COUNTS.jobs }, (_, i) => {
    const total = Math.ceil(COUNTS.items / COUNTS.jobs);
    return [ID_BASE + i, q("completed"), total, total, total, 0, q("2026-10-20T00:00:00.000+00:00")];
  }));
insert("book_enrichment_items", ["id", "job_id", "book_id", "status", "updated_at"],
  Array.from({ length: COUNTS.items }, (_, i) => [
    ID_BASE + i, ID_BASE + (i % COUNTS.jobs), ID_BASE + (i % COUNTS.books), q("done"), q("2026-10-20T00:00:00.000+00:00"),
  ]));

// award_entries の一意制約（book, award, year）を、生成した値で事前に検証する
const keys = new Set();
for (let i = 0; i < COUNTS.awardEntries; i++) {
  const key = `${i % COUNTS.books}-${i % COUNTS.awards}-${awardEntryYear(i)}`;
  if (keys.has(key)) {
    console.error(`award_entries の (book, award, year) が重複しています: ${key}`);
    process.exit(1);
  }
  keys.add(key);
}

writeFileSync(outPath, lines.join("\n") + "\n", "utf8");
console.log(`書き出しました: ${outPath}（${lines.length - 1} 文）`);
