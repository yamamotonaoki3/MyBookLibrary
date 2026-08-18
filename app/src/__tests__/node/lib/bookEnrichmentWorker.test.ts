jest.mock("@/lib/prisma");
// normalizeAuthor/normalizeTitle は isPlausibleMatch が実際に利用するため実装を残す
jest.mock("@/lib/rakuten", () => ({
  ...jest.requireActual("@/lib/rakuten"),
  searchBooks: jest.fn(),
  searchBooksByIsbn: jest.fn(),
}));
jest.mock("@/lib/ndl", () => ({
  ...jest.requireActual("@/lib/ndl"),
  searchBooksNdl: jest.fn(),
  searchBookByIsbn: jest.fn(),
}));
jest.mock("@/lib/auditLog", () => ({
  ...jest.requireActual("@/lib/auditLog"),
  recordAuditEvent: jest.fn().mockResolvedValue(undefined),
}));

import { prismaMock } from "../../helpers/prismaMock";
import { processEnrichmentJob } from "@/lib/bookEnrichmentWorker";
import { searchBooks, searchBooksByIsbn } from "@/lib/rakuten";
import { searchBooksNdl, searchBookByIsbn } from "@/lib/ndl";

const mockedSearchBooks = searchBooks as jest.Mock;
const mockedSearchBooksByIsbn = searchBooksByIsbn as jest.Mock;
const mockedSearchBooksNdl = searchBooksNdl as jest.Mock;
const mockedSearchBookByIsbn = searchBookByIsbn as jest.Mock;

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
  });
  prismaMock.bookEnrichmentItem.updateMany.mockResolvedValue({ count: 1 });
  prismaMock.bookEnrichmentJob.update.mockResolvedValue({});
  prismaMock.bookEnrichmentItem.findFirst
    .mockResolvedValueOnce(item)
    .mockResolvedValue(null);
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
});

describe("processEnrichmentJob", () => {
  it("タイトル+著者検索で候補が単一かつ実在確認（グリーン）できた場合は自動でBookを更新する", async () => {
    setupJobRun(baseItem);
    mockedSearchBooks.mockResolvedValue([
      {
        title: "対象タイトル",
        author: "対象著者",
        isbn: "9784000000001",
        largeImageUrl: "https://example.com/cover.jpg",
        salesDate: "2000年01月",
        publisherName: "",
        size: "単行本",
      },
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
      data: { status: "done" },
    });
    expect(prismaMock.bookEnrichmentJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { doneCount: { increment: 1 }, successCount: { increment: 1 } },
      })
    );
    // 単行本・文庫など同一タイトル・著者の複数版を候補として残すため、
    // 楽天検索は重複排除なし(dedupe:false)で呼ばれている必要がある
    expect(mockedSearchBooks).toHaveBeenCalledWith(
      expect.objectContaining({ dedupe: false })
    );
  });

  it("タイトル+著者検索で候補が複数見つかった場合はneeds_reviewとして候補一覧を記録する", async () => {
    setupJobRun(baseItem);
    mockedSearchBooks.mockResolvedValue([
      {
        title: "対象タイトル",
        author: "対象著者",
        isbn: "9784000000001",
        largeImageUrl: "",
        salesDate: "2000年01月",
        publisherName: "",
        size: "単行本",
      },
      {
        title: "対象タイトル",
        author: "対象著者",
        isbn: "9784000000002",
        largeImageUrl: "",
        salesDate: "2010年01月",
        publisherName: "",
        size: "文庫",
      },
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
            { title: "対象タイトル", author: "対象著者", isbn: "9784000000001", lamp: "green" },
            { title: "対象タイトル", author: "対象著者", isbn: "9784000000002", lamp: "green" },
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

  it("候補のISBNがNDLで実在確認できない場合（レッド）はneeds_reviewとして記録する", async () => {
    setupJobRun(baseItem);
    mockedSearchBooks.mockResolvedValue([
      {
        title: "対象タイトル",
        author: "対象著者",
        isbn: "9784000000001",
        largeImageUrl: "",
        salesDate: "2000年01月",
        publisherName: "",
        size: "単行本",
      },
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
            { title: "対象タイトル", author: "対象著者", isbn: "9784000000001", lamp: "red" },
          ],
        },
      },
    });
  });
});
