import { prisma } from "@/lib/prisma";
import type { PrismaMock, PrismaModelMock } from "@/lib/__mocks__/prisma";

export type { PrismaMock, PrismaModelMock };

/**
 * 型付きの Prisma モック。
 *
 * 使い方（テストファイルの先頭）:
 *
 * ```ts
 * jest.mock("@/lib/prisma");
 * import { prismaMock } from "../helpers/prismaMock";
 *
 * prismaMock.user.findUnique.mockResolvedValue({ id: 1 });
 * expect(prismaMock.user.update).toHaveBeenCalledWith({ ... });
 * ```
 *
 * モデル・メソッドは初回アクセス時に自動生成されるため、事前の宣言は不要。
 * `$transaction` はコールバックに同じモックを渡すので、トランザクション内の
 * 呼び出しも `prismaMock.user.deleteMany` で検証できる。
 */
export const prismaMock = prisma as unknown as PrismaMock;

// jest.mock("@/lib/prisma") を書き忘れると本物の PrismaClient が読み込まれ、
// 「なぜかDBに繋ごうとする」わかりにくい失敗になる。ここで早期に気づけるようにする。
if (typeof prismaMock.$connect?.mockClear !== "function") {
  throw new Error(
    "prismaMock を使うテストファイルには jest.mock(\"@/lib/prisma\") が必要です。"
  );
}
