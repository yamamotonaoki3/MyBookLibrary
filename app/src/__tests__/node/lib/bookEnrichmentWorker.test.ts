jest.mock("@/lib/prisma");
jest.mock("@/lib/rakuten", () => ({
  ...jest.requireActual("@/lib/rakuten"),
  searchBooksByIsbn: jest.fn(),
}));
jest.mock("@/lib/ndl", () => ({
  ...jest.requireActual("@/lib/ndl"),
  searchBooksNdl: jest.fn(),
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
import { searchBooksNdl } from "@/lib/ndl";
import { collectEditionCandidates } from "@/lib/editionResolver";

const mockedSearchBooksByIsbn = searchBooksByIsbn as jest.Mock;
const mockedSearchBooksNdl = searchBooksNdl as jest.Mock;
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
  // 書影フォールバック検索は既定で候補なしとする
  prismaMock.bookIsbn.findMany.mockResolvedValue([]);
});

describe("processEnrichmentJob", () => {
  it("候補が単一（楽天由来）の場合は確認なしで自動でBookを更新する", async () => {
    setupJobRun(baseItem);
    mockedCollectEditionCandidates.mockResolvedValue([
      { title: "対象タイトル", author: "対象著者", isbn: "9784000000001", isLikelyHardcover: true, origin: "rakuten" },
    ]);
    mockedSearchBooksByIsbn.mockResolvedValue(null);
    prismaMock.book.update.mockResolvedValue({});
    prismaMock.bookEnrichmentItem.update.mockResolvedValue({});
    prismaMock.bookIsbn.findMany.mockResolvedValue([{ isbn: "9784000000001" }]);

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

  it("候補が単一で自動反映された場合、BookIsbnにも代表ISBNとして登録される", async () => {
    setupJobRun(baseItem);
    mockedCollectEditionCandidates.mockResolvedValue([
      { title: "対象タイトル", author: "対象著者", isbn: "9784000000001", isLikelyHardcover: true, origin: "rakuten" },
    ]);
    mockedSearchBooksByIsbn.mockResolvedValue(null);
    prismaMock.book.update.mockResolvedValue({});
    prismaMock.bookEnrichmentItem.update.mockResolvedValue({});
    prismaMock.bookIsbn.create.mockResolvedValue({});
    prismaMock.bookIsbn.findUnique.mockResolvedValue({ bookId: 1, isbn: "9784000000001" });
    prismaMock.bookIsbn.updateMany.mockResolvedValue({});
    prismaMock.bookIsbn.update.mockResolvedValue({});
    prismaMock.bookIsbn.findMany.mockResolvedValue([{ isbn: "9784000000001" }]);

    await processEnrichmentJob(1);

    // 単一候補（1b経路）の登録と、代表ISBN確定時の同期登録の2回呼ばれる
    expect(prismaMock.bookIsbn.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ bookId: 1, isbn: "9784000000001" }) })
    );
    expect(prismaMock.bookIsbn.update).toHaveBeenCalledWith({
      where: { isbn: "9784000000001" },
      data: { isPrimary: true },
    });
  });

  it("候補が単一（NDL単行本由来）の場合も自動反映する", async () => {
    setupJobRun(baseItem);
    mockedCollectEditionCandidates.mockResolvedValue([
      { title: "対象タイトル", author: "対象著者", isbn: "9784000000099", isLikelyHardcover: true, origin: "ndl" },
    ]);
    mockedSearchBooksByIsbn.mockResolvedValue(null);
    prismaMock.book.update.mockResolvedValue({});
    prismaMock.bookEnrichmentItem.update.mockResolvedValue({});
    prismaMock.bookIsbn.findMany.mockResolvedValue([{ isbn: "9784000000099" }]);

    await processEnrichmentJob(1);

    expect(prismaMock.book.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: expect.objectContaining({ isbn: "9784000000099" }),
    });
  });

  it("複数候補が見つかった場合は確認を挟まず全件BookIsbnへ登録し、hardcover優先の1件を代表ISBNとして自動反映する", async () => {
    setupJobRun(baseItem);
    mockedCollectEditionCandidates.mockResolvedValue([
      { title: "対象タイトル", author: "対象著者", isbn: "9784000000001", isLikelyHardcover: false, origin: "rakuten" },
      { title: "対象タイトル", author: "対象著者", isbn: "9784000000002", isLikelyHardcover: true, origin: "ndl" },
    ]);
    mockedSearchBooksByIsbn.mockResolvedValue(null);
    prismaMock.book.update.mockResolvedValue({});
    prismaMock.bookEnrichmentItem.update.mockResolvedValue({});
    prismaMock.bookIsbn.create.mockResolvedValue({});
    prismaMock.bookIsbn.findMany.mockResolvedValue([
      { isbn: "9784000000001" },
      { isbn: "9784000000002" },
    ]);

    await processEnrichmentJob(1);

    // 両候補ともBookIsbnへ登録される
    expect(prismaMock.bookIsbn.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ bookId: 1, isbn: "9784000000001", source: "rakuten" }) })
    );
    expect(prismaMock.bookIsbn.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ bookId: 1, isbn: "9784000000002", source: "ndl" }) })
    );
    // isLikelyHardcoverがtrueの候補が代表ISBNとしてBook.isbnに採用される
    expect(prismaMock.book.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: expect.objectContaining({ isbn: "9784000000002" }),
    });
    // 確認を挟まず即座にdoneとして完了する
    expect(prismaMock.bookEnrichmentItem.update).toHaveBeenCalledWith({
      where: { id: 10 },
      data: { status: "done", resultDetail: expect.objectContaining({ updatedFields: expect.any(Array) }) },
    });
    expect(prismaMock.bookEnrichmentJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { doneCount: { increment: 1 }, successCount: { increment: 1 } },
      })
    );
  });

  it("hardcover候補が無い場合は先頭候補を代表ISBNとして自動反映する", async () => {
    setupJobRun(baseItem);
    mockedCollectEditionCandidates.mockResolvedValue([
      { title: "対象タイトル", author: "対象著者", isbn: "9784000000001", isLikelyHardcover: false, origin: "rakuten" },
      { title: "対象タイトル", author: "対象著者", isbn: "9784000000002", isLikelyHardcover: false, origin: "rakuten" },
    ]);
    mockedSearchBooksByIsbn.mockResolvedValue(null);
    prismaMock.book.update.mockResolvedValue({});
    prismaMock.bookEnrichmentItem.update.mockResolvedValue({});
    prismaMock.bookIsbn.create.mockResolvedValue({});
    prismaMock.bookIsbn.findMany.mockResolvedValue([
      { isbn: "9784000000001" },
      { isbn: "9784000000002" },
    ]);

    await processEnrichmentJob(1);

    expect(prismaMock.book.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: expect.objectContaining({ isbn: "9784000000001" }),
    });
  });

  it("代表ISBNで書影が見つからない場合、他の候補ISBNへフォールバックして書影を取得する", async () => {
    setupJobRun(baseItem);
    mockedCollectEditionCandidates.mockResolvedValue([
      { title: "対象タイトル", author: "対象著者", isbn: "9784000000001", isLikelyHardcover: true, origin: "rakuten" },
    ]);
    // 代表ISBNでは見つからず、フォールバック候補で見つかる
    mockedSearchBooksByIsbn
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ largeImageUrl: "https://example.com/fallback.jpg" });
    prismaMock.bookIsbn.findMany
      .mockResolvedValueOnce([{ isbn: "9784000000001" }])
      .mockResolvedValueOnce([{ isbn: "9784000000003" }]);
    prismaMock.book.update.mockResolvedValue({});
    prismaMock.bookEnrichmentItem.update.mockResolvedValue({});
    prismaMock.bookIsbn.create.mockResolvedValue({});

    await processEnrichmentJob(1);

    expect(mockedSearchBooksByIsbn).toHaveBeenCalledWith("9784000000001");
    expect(mockedSearchBooksByIsbn).toHaveBeenCalledWith("9784000000003");
    expect(prismaMock.book.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: expect.objectContaining({ coverImageUrl: "https://example.com/fallback.jpg" }),
    });
  });

  it("hardcover代表候補が他Bookと衝突した場合、登録に成功した次点候補を採用する", async () => {
    setupJobRun(baseItem);
    mockedCollectEditionCandidates.mockResolvedValue([
      { title: "対象タイトル", author: "対象著者", isbn: "9784000000001", isLikelyHardcover: true, origin: "ndl" },
      { title: "対象タイトル", author: "対象著者", isbn: "9784000000002", isLikelyHardcover: false, origin: "rakuten" },
    ]);
    mockedSearchBooksByIsbn.mockResolvedValue(null);
    prismaMock.book.update.mockResolvedValue({});
    prismaMock.bookEnrichmentItem.update.mockResolvedValue({});
    prismaMock.bookIsbn.create
      .mockRejectedValueOnce(new Error("Unique constraint failed"))
      .mockResolvedValueOnce({});
    prismaMock.bookIsbn.findMany.mockResolvedValue([{ isbn: "9784000000002" }]);

    await processEnrichmentJob(1);

    expect(prismaMock.book.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: expect.objectContaining({ isbn: "9784000000002" }),
    });
    expect(prismaMock.bookEnrichmentItem.update).toHaveBeenCalledWith({
      where: { id: 10 },
      data: { status: "done", resultDetail: expect.objectContaining({ updatedFields: expect.any(Array) }) },
    });
  });

  it("既にISBNが確定済みでBookIsbnが0件の本は、他版ISBNを遡って収集しBookIsbnへ登録する", async () => {
    const bookWithIsbn = {
      ...baseBook,
      isbn: "9784000000099",
      coverImageUrl: "https://example.com/cover.jpg",
    };
    setupJobRun({ ...baseItem, book: bookWithIsbn });
    prismaMock.bookIsbn.count.mockResolvedValue(0);
    mockedCollectEditionCandidates.mockResolvedValue([
      { title: "対象タイトル", author: "対象著者", isbn: "9784000000099", isLikelyHardcover: true, origin: "ndl" },
      { title: "対象タイトル", author: "対象著者", isbn: "9784000000100", isLikelyHardcover: false, origin: "rakuten" },
    ]);
    prismaMock.bookEnrichmentItem.update.mockResolvedValue({});
    prismaMock.bookIsbn.create.mockResolvedValue({});
    prismaMock.bookIsbn.findUnique.mockResolvedValue({ bookId: 1, isbn: "9784000000099" });
    prismaMock.bookIsbn.updateMany.mockResolvedValue({});
    prismaMock.bookIsbn.update.mockResolvedValue({});

    await processEnrichmentJob(1);

    // 書影は既に設定済み・出版年も不明でないため、Book本体の更新は発生しない
    expect(prismaMock.book.update).not.toHaveBeenCalled();
    // 収集した2件がBookIsbnへ登録される
    expect(prismaMock.bookIsbn.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ bookId: 1, isbn: "9784000000099" }) })
    );
    expect(prismaMock.bookIsbn.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ bookId: 1, isbn: "9784000000100" }) })
    );
    // 元々のISBNが代表として同期される
    expect(prismaMock.bookIsbn.update).toHaveBeenCalledWith({
      where: { isbn: "9784000000099" },
      data: { isPrimary: true },
    });
    // 遡及登録のみでも成功（done）として扱われる
    expect(prismaMock.bookEnrichmentItem.update).toHaveBeenCalledWith({
      where: { id: 10 },
      data: {
        status: "done",
        resultDetail: expect.objectContaining({ updatedFields: ["複数版ISBN"] }),
      },
    });
  });

  it("既にISBNが確定済みでBookIsbnが既にある本は、他版ISBNの再収集を行わない", async () => {
    const bookWithIsbn = { ...baseBook, isbn: "9784000000099" };
    setupJobRun({ ...baseItem, book: bookWithIsbn });
    prismaMock.bookIsbn.count.mockResolvedValue(1);
    mockedSearchBooksByIsbn.mockResolvedValue(null);
    prismaMock.bookEnrichmentItem.update.mockResolvedValue({});

    await processEnrichmentJob(1);

    expect(mockedCollectEditionCandidates).not.toHaveBeenCalled();
    expect(prismaMock.bookEnrichmentItem.update).toHaveBeenCalledWith({
      where: { id: 10 },
      data: {
        status: "error",
        errorMessage: expect.stringContaining("書影"),
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
