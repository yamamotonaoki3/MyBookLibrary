jest.mock("@/lib/prisma");

import { readFile } from "node:fs/promises";
import path from "node:path";
import { getRecentReads } from "@/backend/dashboard/recentReads";
import { prismaMock } from "../../../helpers/prismaMock";

describe("getRecentReads", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns the dashboard's recent reading records as UI-facing data", async () => {
    prismaMock.readingStatus.findMany.mockResolvedValue([
      {
        id: 10,
        status: "reading",
        bookId: 20,
        book: {
          title: "境界の本",
          isbn: "9780000000000",
          coverImageUrl: null,
          publishedAt: new Date("2024-01-02T00:00:00.000Z"),
          author: { name: "著者" },
        },
      },
    ]);

    await expect(getRecentReads(1)).resolves.toEqual([
      {
        id: 10,
        status: "reading",
        book: {
          id: 20,
          title: "境界の本",
          authorName: "著者",
          isbn: "9780000000000",
          coverImageUrl: null,
          publishedAt: "2024-01-02T00:00:00.000Z",
        },
      },
    ]);

    expect(prismaMock.readingStatus.findMany).toHaveBeenCalledWith({
      where: { userId: 1, status: { in: ["reading", "read"] } },
      orderBy: { updatedAt: "desc" },
      include: { book: { include: { author: true } } },
    });
  });

  it("keeps the client card independent from Prisma and backend code", async () => {
    const source = await readFile(
      path.join(process.cwd(), "src/frontend/dashboard/RecentReadCard.tsx"),
      "utf8"
    );

    expect(source).not.toMatch(/from ["']@\/(backend|lib\/prisma)/);
    expect(source).toContain('from "@/shared/dashboard"');
  });

  it("marks the Prisma-backed use case as server-only", async () => {
    const source = await readFile(
      path.join(process.cwd(), "src/backend/dashboard/recentReads.ts"),
      "utf8"
    );

    expect(source).toContain('import "server-only"');
  });
});
