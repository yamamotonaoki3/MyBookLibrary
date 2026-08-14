/**
 * 手動登録本（source="manual", createdByUserId=null）の所有者推定ロジック。
 * docs/data-migration-spec-481.md の「dry-run → 人手承認 → 承認分のみ本更新」運用を
 * 支えるための純粋関数群（DB接続を持たない）。
 */

export interface ManualBookWithStatuses {
  bookId: number;
  readingStatuses: { id: number; userId: number }[];
}

export interface BackfillCandidate {
  bookId: number;
  /** 最古のReadingStatusのユーザーIDによる推定。ReadingStatusが1件も無い場合はnull（推定不能）。 */
  estimatedUserId: number | null;
}

/**
 * 「その本への最古のReadingStatusのユーザー」を登録者と推定する。
 * ReadingStatusが1件も無い書籍は推定不能として `estimatedUserId: null` を返す
 * （呼び出し側はこれを更新対象に含めてはならない）。
 */
export function computeBackfillCandidates(
  books: ManualBookWithStatuses[]
): BackfillCandidate[] {
  return books.map((book) => {
    if (book.readingStatuses.length === 0) {
      return { bookId: book.bookId, estimatedUserId: null };
    }
    const earliest = [...book.readingStatuses].sort((a, b) => a.id - b.id)[0];
    return { bookId: book.bookId, estimatedUserId: earliest.userId };
  });
}

export interface ApprovedEntry {
  bookId: number;
  userId: number;
}

/**
 * 承認済みファイル（JSON.parseした直後の値）が `ApprovedEntry[]` として妥当かを検証する。
 *
 * dry-run候補ファイル（`candidates.json`、`estimatedUserId`という項目名を持つ）を
 * 誤ってそのまま承認ファイルとして渡してしまった場合、`userId`が存在せず
 * `undefined`のまま更新処理に流れ込み、「更新した」と表示されるのに実際には
 * 何も変わらない、という気づきにくい失敗につながる。そのため、配列であること・
 * 各要素の`bookId`/`userId`がどちらも整数であることを1件ずつ確認し、
 * 不正な形式があれば早期に明確なエラーで中止する。
 */
export function parseApprovedEntries(raw: unknown): ApprovedEntry[] {
  if (!Array.isArray(raw)) {
    throw new Error(
      "承認ファイルの形式が不正です。トップレベルは配列である必要があります " +
        '（例: [{ "bookId": 1, "userId": 5 }]）。'
    );
  }

  return raw.map((entry, index) => {
    if (
      typeof entry !== "object" ||
      entry === null ||
      Array.isArray(entry) ||
      !("bookId" in entry) ||
      !("userId" in entry)
    ) {
      throw new Error(
        `承認ファイルの${index}番目の要素が不正です。"bookId"と"userId"を持つ` +
          `オブジェクトである必要があります。dry-runの候補ファイル（candidates.json、` +
          `"estimatedUserId"という項目名を使う）を誤ってそのまま渡していないか確認してください。`
      );
    }

    const { bookId, userId } = entry as { bookId: unknown; userId: unknown };
    if (!Number.isInteger(bookId)) {
      throw new Error(`承認ファイルの${index}番目の要素の"bookId"が整数ではありません: ${JSON.stringify(bookId)}`);
    }
    if (!Number.isInteger(userId)) {
      throw new Error(`承認ファイルの${index}番目の要素の"userId"が整数ではありません: ${JSON.stringify(userId)}`);
    }

    return { bookId, userId } as ApprovedEntry;
  });
}

/**
 * 人手承認済みファイル（`ApprovedEntry[]`）の内容だけを本更新の対象とする。
 * dry-runで所有者を推定できた候補に無いbookIdや、承認ファイルに含まれないbookIdは
 * 更新対象から除外する（未承認・推定不能の書籍を更新しないための歯止め）。
 */
export function filterApprovedUpdates(
  candidates: BackfillCandidate[],
  approved: ApprovedEntry[]
): ApprovedEntry[] {
  const candidateBookIds = new Set(
    candidates
      .filter((candidate) => candidate.estimatedUserId !== null)
      .map((candidate) => candidate.bookId)
  );
  const approvedMap = new Map(approved.map((entry) => [entry.bookId, entry.userId]));

  return approved
    .filter((entry) => candidateBookIds.has(entry.bookId))
    .map((entry) => ({ bookId: entry.bookId, userId: approvedMap.get(entry.bookId)! }));
}
