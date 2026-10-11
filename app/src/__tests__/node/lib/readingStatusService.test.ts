jest.mock("@/repositories/readingStatusRepository");
jest.mock("@/lib/mutualFollows");
jest.mock("@/lib/bookIsbn");
jest.mock("@/lib/editionResolver", () => ({
  ...jest.requireActual("@/lib/editionResolver"),
  resolvePreferringHardcover: jest.fn(),
  collectEditionCandidates: jest.fn(),
}));

import { saveReadingStatus } from "@/lib/readingStatusService";
import {
  resolvePreferringHardcover,
  collectEditionCandidates,
  BACKGROUND_COLLECT_OPTIONS,
  USER_FACING_RESOLVE_OPTIONS,
} from "@/lib/editionResolver";
import { getMutualFollowerIds } from "@/lib/mutualFollows";
import { addIsbns } from "@/lib/bookIsbn";
import * as repo from "@/repositories/readingStatusRepository";

const repoMock = jest.mocked(repo);
const resolveMock = jest.mocked(resolvePreferringHardcover);
const collectMock = jest.mocked(collectEditionCandidates);
const mutualMock = jest.mocked(getMutualFollowerIds);

const baseInput = {
  userId: 1,
  status: "reading" as const,
  title: "[TEST] テスト本",
  author: "testuser_author",
  isbn: "9780000000001",
};

const author = { id: 10, name: "testuser_author" };
const existingBook = { id: 100, title: "[TEST] テスト本", isbn: "9780000000001" };
const resolved = {
  title: "[TEST] テスト本",
  author: "testuser_author",
  isbn: "9780000000002",
  source: "ndl_hardcover" as const,
};

beforeEach(() => {
  jest.resetAllMocks();
  repoMock.findOrCreateAuthorByName.mockResolvedValue(author as never);
  repoMock.upsertReadingStatus.mockResolvedValue({ id: 1, status: "reading", bookId: 100 } as never);
  repoMock.findReadingStatusValue.mockResolvedValue(null as never);
  mutualMock.mockResolvedValue([]);
});

describe("saveReadingStatus", () => {
  it("DBに本がある場合は外部APIを呼ばず、応答後の処理も登録しない", async () => {
    repoMock.findBookByIsbn.mockResolvedValue(existingBook as never);

    const result = await saveReadingStatus(baseInput);

    expect(resolveMock).not.toHaveBeenCalled();
    expect(result.afterResponse).toBeUndefined();
    expect(repoMock.upsertReadingStatus).toHaveBeenCalledWith(1, 100, "reading");
  });

  it("未登録の本は時間制限付きで版を解決して登録し、版ISBN収集は応答後の処理として返す", async () => {
    repoMock.findBookByIsbn.mockResolvedValue(null as never);
    repoMock.findBookByTitleAndAuthor.mockResolvedValue(null as never);
    resolveMock.mockResolvedValue(resolved);
    repoMock.createBookOrReuseExisting.mockResolvedValue({ id: 101, title: resolved.title, isbn: resolved.isbn } as never);
    collectMock.mockResolvedValue([]);

    const result = await saveReadingStatus(baseInput);

    // ユーザー操作用の時間制限（NDL 4秒など）を渡している
    expect(resolveMock).toHaveBeenCalledWith(expect.anything(), USER_FACING_RESOLVE_OPTIONS);
    expect(repoMock.createBookOrReuseExisting).toHaveBeenCalledTimes(1);
    // 応答前には他版ISBNを収集しない
    expect(collectMock).not.toHaveBeenCalled();
    expect(result.afterResponse).toBeInstanceOf(Function);

    await result.afterResponse!();
    expect(collectMock).toHaveBeenCalledWith(
      { title: resolved.title, author: resolved.author },
      BACKGROUND_COLLECT_OPTIONS
    );
    expect(addIsbns).toHaveBeenCalledWith(101, [], { primaryIsbn: resolved.isbn });
  });

  it("他版ISBNの収集に失敗しても、応答後の処理は例外を投げない", async () => {
    repoMock.findBookByIsbn.mockResolvedValue(null as never);
    repoMock.findBookByTitleAndAuthor.mockResolvedValue(null as never);
    resolveMock.mockResolvedValue(resolved);
    repoMock.createBookOrReuseExisting.mockResolvedValue({ id: 101, title: resolved.title, isbn: resolved.isbn } as never);
    collectMock.mockRejectedValue(new Error("NDL timeout"));

    const result = await saveReadingStatus(baseInput);

    await expect(result.afterResponse!()).resolves.toBeUndefined();
    expect(addIsbns).not.toHaveBeenCalled();
  });

  it("解決したISBNが既存の本と一致する場合は新規作成せず、その本を使う", async () => {
    repoMock.findBookByIsbn
      .mockResolvedValueOnce(null as never) // 渡されたISBN
      .mockResolvedValueOnce({ id: 200, title: "既存", isbn: resolved.isbn } as never); // 解決したISBN
    repoMock.findBookByTitleAndAuthor.mockResolvedValue(null as never);
    resolveMock.mockResolvedValue(resolved);

    const result = await saveReadingStatus(baseInput);

    expect(repoMock.createBookOrReuseExisting).not.toHaveBeenCalled();
    expect(result.afterResponse).toBeUndefined();
    expect(repoMock.upsertReadingStatus).toHaveBeenCalledWith(1, 200, "reading");
  });

  it("status=unread は読書ステータスを削除し、bookId を返す", async () => {
    repoMock.findBookByIsbn.mockResolvedValue(existingBook as never);

    const result = await saveReadingStatus({ ...baseInput, status: "unread" });

    expect(repoMock.deleteReadingStatus).toHaveBeenCalledWith(1, 100);
    expect(repoMock.upsertReadingStatus).not.toHaveBeenCalled();
    expect(result.body).toEqual({ status: "unread", bookId: 100 });
  });

  describe("相互フォローへの通知（応答前に完了する）", () => {
    beforeEach(() => {
      repoMock.findBookByIsbn.mockResolvedValue(existingBook as never);
      repoMock.findUserName.mockResolvedValue({ name: "testuser_001" } as never);
    });

    it("「読みたい」に変更したとき、相互フォロー全員に通知を作る", async () => {
      mutualMock.mockResolvedValue([2, 3]);

      await saveReadingStatus({ ...baseInput, status: "want_to_read" });

      expect(repoMock.createNotifications).toHaveBeenCalledTimes(1);
      const data = repoMock.createNotifications.mock.calls[0][0];
      expect(data.map((n) => n.userId)).toEqual([2, 3]);
    });

    it("既に「読みたい」の場合は通知しない", async () => {
      mutualMock.mockResolvedValue([2]);
      repoMock.findReadingStatusValue.mockResolvedValue({ status: "want_to_read" } as never);

      await saveReadingStatus({ ...baseInput, status: "want_to_read" });

      expect(repoMock.createNotifications).not.toHaveBeenCalled();
    });

    it("通知の作成に失敗しても保存は成功する", async () => {
      mutualMock.mockResolvedValue([2]);
      repoMock.createNotifications.mockRejectedValue(new Error("db error"));

      const result = await saveReadingStatus({ ...baseInput, status: "want_to_read" });

      expect(result.body).toMatchObject({ status: "reading" });
    });
  });
});
