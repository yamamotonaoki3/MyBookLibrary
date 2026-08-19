jest.mock("@/lib/prisma");
jest.mock("@/lib/rakuten", () => ({
  ...jest.requireActual("@/lib/rakuten"),
  searchBooksByIsbn: jest.fn(),
}));
jest.mock("@/lib/ndl", () => ({
  ...jest.requireActual("@/lib/ndl"),
  searchBooksNdl: jest.fn(),
  searchBookByIsbn: jest.fn(),
}));
jest.mock("@/lib/editionResolver", () => ({
  ...jest.requireActual("@/lib/editionResolver"),
  collectEditionCandidates: jest.fn(),
}));
jest.mock("@/lib/auditLog", () => ({
  ...jest.requireActual("@/lib/auditLog"),
  recordAuditEvent: jest.fn().mockResolvedValue(undefined),
}));

import { prismaMock } from "../../helpers/prismaMock";
import { processEnrichmentJob } from "@/lib/bookEnrichmentWorker";
import { searchBooksByIsbn } from "@/lib/rakuten";
import { searchBooksNdl, searchBookByIsbn } from "@/lib/ndl";
import { collectEditionCandidates } from "@/lib/editionResolver";

const mockedSearchBooksByIsbn = searchBooksByIsbn as jest.Mock;
const mockedSearchBooksNdl = searchBooksNdl as jest.Mock;
const mockedSearchBookByIsbn = searchBookByIsbn as jest.Mock;
const mockedCollectEditionCandidates = collectEditionCandidates as jest.Mock;

const baseBook = {
  id: 1,
  isbn: null as string | null,
  title: "対象タイトル",
  coverImageUrl: null as string | null,
  publishedAtUnknown: false,
  author: { name: "対象著者" },
};

const baseItem = {
  id: 10,
  jobId: 1,
  bookId: 1,
  status: "pending",
  book: baseBook,
};

function setupJobRun(item: typeof baseItem | null) {
  prismaMock.bookEnrichmentJob.findUnique.mockResolvedValue({
    id: 1,
    status: "running",
    cancelRequested: false,
  });
  prismaMock.bookEnrichmentItem.updateMany.mockResolvedValue({ count: 1 });
  prismaMock.bookEnrichmentJob.update.mockResolvedValue({});
  prismaMock.bookEnrichmentItem.findFirst
    .mockResolvedValueOnce(item)
    .mockResolvedValue(null);
  prismaMock.bookEnrichmentItem.findMany.mockResolvedValue([]);
  prismaMock.bookEnrichmentItem.count.mockResolvedValue(0);
  prismaMock.bookEnrichmentJob.updateMany.mockResolvedValue({ count: 1 });
  prismaMock.bookEnrichmentJob.findUniqueOrThrow.mockResolvedValue({
    id: 1,
    startedByUserId: 1,
    successCount: 0,
    failCount: 0,
    reviewCount: 0,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  // NDL titleAndAuthor 厳密検索は既定でヒットなしとする
  mockedSearchBooksNdl.mockResolvedValue({ items: [], totalPages: 0 });
  mockedCollectEditionCandidates.mockResolvedValue([]);
});

describe("processEnrichmentJob", () => {
  it("候補が単一（楽天由来）かつ実在確認（グリーン）できた場合は自動でBookを更新する", async () => {
    setupJobRun(baseItem);
    mockedCollectEditionCandidates.mockResolvedValue([
      { title: "対象タイトル", author: "対象著者", isbn: "9784000000001", isLikelyHardcover: true, origin: "rakuten" },
    ]);
    mockedSearchBookByIsbn.mockResolvedValue({
      title: "対象タイトル",
      author: "対象著者",
      publisher: "",
      pubdate: "2000-01-01",
    });
    mockedSearchBooksByIsbn.mockResolvedValue(null);
    prismaMock.book.update.mockResolvedValue({});
    prismaMock.bookEnrichmentItem.update.mockResolvedValue({});

    await processEnrichmentJob(1);

    expect(prismaMock.book.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: expect.objectContaining({ isbn: "9784000000001" }),
    });
    expect(prismaMock.bookEnrichmentItem.update).toHaveBeenCalledWith({
      where: { id: 10 },
      data: { status: "done", resultDetail: expect.objectContaining({ updatedFields: expect.any(Array) }) },
    });
    expect(prismaMock.bookEnrichmentJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { doneCount: { increment: 1 }, successCount: { increment: 1 } },
      })
    );
    expect(mockedCollectEditionCandidates).toHaveBeenCalledWith({
      title: "対象タイトル",
      author: "対象著者",
    });
  });

  it("候補が単一（NDL単行本由来）の場合、NDL実在確認を再度行わずグリーン扱いで自動反映する", async () => {
    setupJobRun(baseItem);
    mockedCollectEditionCandidates.mockResolvedValue([
      { title: "対象タイトル", author: "対象著者", isbn: "9784000000099", isLikelyHardcover: true, origin: "ndl" },
    ]);
    mockedSearchBooksByIsbn.mockResolvedValue(null);
    prismaMock.book.update.mockResolvedValue({});
    prismaMock.bookEnrichmentItem.update.mockResolvedValue({});

    await processEnrichmentJob(1);

    expect(prismaMock.book.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: expect.objectContaining({ isbn: "9784000000099" }),
    });
    // NDL由来候補は検索時点で実在確認済みのため、追加のsearchBookByIsbn呼び出しは発生しない
    expect(mockedSearchBookByIsbn).not.toHaveBeenCalled();
  });

  it("候補が複数見つかった場合はneeds_reviewとして候補一覧を記録する", async () => {
    setupJobRun(baseItem);
    mockedCollectEditionCandidates.mockResolvedValue([
      { title: "対象タイトル", author: "対象著者", isbn: "9784000000001", isLikelyHardcover: true, origin: "rakuten" },
      { title: "対象タイトル", author: "対象著者", isbn: "9784000000002", isLikelyHardcover: false, origin: "rakuten" },
    ]);
    mockedSearchBookByIsbn.mockResolvedValue({
      title: "対象タイトル",
      author: "対象著者",
      publisher: "",
      pubdate: "2000-01-01",
    });
    prismaMock.bookEnrichmentItem.update.mockResolvedValue({});

    await processEnrichmentJob(1);

    expect(prismaMock.book.update).not.toHaveBeenCalled();
    expect(prismaMock.bookEnrichmentItem.update).toHaveBeenCalledWith({
      where: { id: 10 },
      data: {
        status: "needs_review",
        resultDetail: {
          candidates: [
            { title: "対象タイトル", author: "対象著者", isbn: "9784000000001", lamp: "green", isLikelyHardcover: true },
            { title: "対象タイトル", author: "対象著者", isbn: "9784000000002", lamp: "green", isLikelyHardcover: false },
          ],
        },
      },
    });
    expect(prismaMock.bookEnrichmentJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { doneCount: { increment: 1 }, reviewCount: { increment: 1 } },
      })
    );
  });

  it("単行本（NDL）と文庫（楽天）が両方見つかった場合もneeds_reviewとして両方を記録する", async () => {
    setupJobRun(baseItem);
    mockedCollectEditionCandidates.mockResolvedValue([
      { title: "対象タイトル", author: "対象著者", isbn: "9784000000010", isLikelyHardcover: true, origin: "ndl" },
      { title: "対象タイトル", author: "対象著者", isbn: "9784000000011", isLikelyHardcover: false, origin: "rakuten" },
    ]);
    mockedSearchBookByIsbn.mockResolvedValue({
      title: "対象タイトル",
      author: "対象著者",
      publisher: "",
      pubdate: "2000-01-01",
    });
    prismaMock.bookEnrichmentItem.update.mockResolvedValue({});

    await processEnrichmentJob(1);

    expect(prismaMock.book.update).not.toHaveBeenCalled();
    expect(prismaMock.bookEnrichmentItem.update).toHaveBeenCalledWith({
      where: { id: 10 },
      data: {
        status: "needs_review",
        resultDetail: {
          candidates: [
            { title: "対象タイトル", author: "対象著者", isbn: "9784000000010", lamp: "green", isLikelyHardcover: true },
            { title: "対象タイトル", author: "対象著者", isbn: "9784000000011", lamp: "green", isLikelyHardcover: false },
          ],
        },
      },
    });
    // NDL由来候補ぶんはsearchBookByIsbnを呼ばず、楽天由来候補の1件のみ確認する
    expect(mockedSearchBookByIsbn).toHaveBeenCalledTimes(1);
  });

  it("候補のISBNがNDLで実在確認できない場合（レッド）はneeds_reviewとして記録する", async () => {
    setupJobRun(baseItem);
    mockedCollectEditionCandidates.mockResolvedValue([
      { title: "対象タイトル", author: "対象著者", isbn: "9784000000001", isLikelyHardcover: true, origin: "rakuten" },
    ]);
    mockedSearchBookByIsbn.mockResolvedValue(null);
    prismaMock.bookEnrichmentItem.update.mockResolvedValue({});

    await processEnrichmentJob(1);

    expect(prismaMock.book.update).not.toHaveBeenCalled();
    expect(prismaMock.bookEnrichmentItem.update).toHaveBeenCalledWith({
      where: { id: 10 },
      data: {
        status: "needs_review",
        resultDetail: {
          candidates: [
            { title: "対象タイトル", author: "対象著者", isbn: "9784000000001", lamp: "red", isLikelyHardcover: true },
          ],
        },
      },
    });
  });

  it("中断リクエストがある場合、未処理アイテムをcancelledにしジョブをcancelledで完了する", async () => {
    prismaMock.bookEnrichmentJob.findUnique.mockResolvedValue({
      id: 1,
      status: "running",
      cancelRequested: true,
    });
    prismaMock.bookEnrichmentItem.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.bookEnrichmentJob.update.mockResolvedValue({});
    prismaMock.bookEnrichmentItem.findMany.mockResolvedValue([]);
    prismaMock.bookEnrichmentJob.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.bookEnrichmentJob.findUniqueOrThrow.mockResolvedValue({
      id: 1,
      startedByUserId: 1,
      successCount: 0,
      failCount: 0,
      reviewCount: 0,
    });

    await processEnrichmentJob(1);

    expect(prismaMock.bookEnrichmentItem.updateMany).toHaveBeenCalledWith({
      where: { jobId: 1, status: { in: ["pending", "processing"] } },
      data: { status: "cancelled" },
    });
    expect(prismaMock.bookEnrichmentJob.updateMany).toHaveBeenCalledWith({
      where: { id: 1, status: "running" },
      data: expect.objectContaining({ status: "cancelled" }),
    });
    expect(prismaMock.bookEnrichmentItem.findFirst).not.toHaveBeenCalled();
  });
});
