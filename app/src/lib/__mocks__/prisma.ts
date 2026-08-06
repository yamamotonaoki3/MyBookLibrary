/**
 * `@/lib/prisma` の手動モック（Jest manual mock）。
 *
 * テストファイルで `jest.mock("@/lib/prisma")` と1行書くだけでこのファイルが使われる。
 * モデルとメソッドは Proxy で遅延生成するため、テストごとに
 * 「使うモデル・メソッドを列挙する」ボイラープレートが不要になり、
 * schema.prisma にモデルが増えても追従不要になる。
 *
 * テスト側からは型付きの `prismaMock`（`src/__tests__/helpers/prismaMock.ts`）を
 * 経由して参照する。
 */

/** モデル1つ分のモック。`findMany` などの任意のメソッドが `jest.Mock` として生える。 */
export interface PrismaModelMock {
  [method: string]: jest.Mock;
}

/**
 * PrismaClient のモック。
 * `prisma.user.findMany` のようなモデル経由のアクセスと、
 * `prisma.$queryRaw` のようなルート直下のメソッドの両方を1つの型で扱う。
 */
export interface PrismaMock {
  [key: string]: PrismaModelMock & jest.Mock;
}

/** PrismaClient のルート直下にあり、モデルではないメソッド。 */
const ROOT_METHODS = new Set([
  "$connect",
  "$disconnect",
  "$queryRaw",
  "$queryRawUnsafe",
  "$executeRaw",
  "$executeRawUnsafe",
  "$on",
  "$use",
  "$extends",
]);

/**
 * Proxy の get は、テストコードからの参照だけでなく
 * `await` の解決や jest の等値比較・整形の過程でも呼ばれる。
 * これらに `jest.Mock` を返すと「`await prisma` が解決しない」「差分表示が壊れる」
 * といった事故になるため、メンバーではないものとして `undefined` を返す。
 */
const NOT_A_MEMBER = new Set([
  "then",
  "catch",
  "finally",
  "constructor",
  "prototype",
  "toJSON",
  "toString",
  "valueOf",
  "inspect",
  "asymmetricMatch",
  "$$typeof",
  "nodeType",
  "tagName",
  "_isMockFunction",
  "mock",
]);

function isMember(prop: string | symbol): prop is string {
  return typeof prop === "string" && !NOT_A_MEMBER.has(prop);
}

/** モデル1つ分のモックを作る。メソッドは初回アクセス時に生成してキャッシュする。 */
function createModelMock(): PrismaModelMock & jest.Mock {
  const methods = new Map<string, jest.Mock>();

  return new Proxy({} as PrismaModelMock & jest.Mock, {
    get(_target, prop) {
      if (!isMember(prop)) return undefined;
      let method = methods.get(prop);
      if (!method) {
        method = jest.fn();
        methods.set(prop, method);
      }
      return method;
    },
    // `expect(...).toHaveProperty` や in 演算子のために存在を主張する
    has: () => true,
  });
}

/**
 * `$transaction` の既定実装。
 *
 * - コールバック形式 `$transaction(async (tx) => ...)` … tx にルートと**同一の**モックを渡す。
 *   これによりトランザクション内の呼び出しも `prismaMock.user.update` で検証できる。
 * - 配列形式 `$transaction([p1, p2])` … `Promise.all` で解決する。
 *
 * `jest.clearAllMocks()` は呼び出し履歴のみを消し実装は残すため、この既定実装は維持される
 * （`jest.resetAllMocks()` を使うと消えるので注意）。
 */
function createTransactionMock(getRoot: () => PrismaMock): jest.Mock {
  return jest.fn(async (arg: unknown) => {
    if (typeof arg === "function") {
      return await (arg as (tx: PrismaMock) => unknown)(getRoot());
    }
    if (Array.isArray(arg)) {
      return await Promise.all(arg);
    }
    return undefined;
  });
}

/** PrismaClient のモックを新規に作る。 */
export function createPrismaMock(): PrismaMock {
  const members = new Map<string, PrismaModelMock & jest.Mock>();

  const root: PrismaMock = new Proxy({} as PrismaMock, {
    get(_target, prop) {
      if (!isMember(prop)) return undefined;

      let member = members.get(prop);
      if (!member) {
        if (prop === "$transaction") {
          member = createTransactionMock(() => root) as PrismaModelMock & jest.Mock;
        } else if (ROOT_METHODS.has(prop)) {
          member = jest.fn() as PrismaModelMock & jest.Mock;
        } else {
          member = createModelMock();
        }
        members.set(prop, member);
      }
      return member;
    },
    has: () => true,
  });

  return root;
}

/** `jest.mock("@/lib/prisma")` したテストファイルが受け取るモックインスタンス。 */
export const prisma = createPrismaMock();
