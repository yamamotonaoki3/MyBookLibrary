/**
 * 実DB統合テスト。おすすめ著者・おすすめユーザーの生 SQL を検証する。
 *
 * D1（SQLite）への移行に備え、MySQL と SQLite のどちらでも同じ結果になる書き方にしてある
 * （整数除算の切り捨て、GROUP_CONCAT の方言を避ける）。
 * このテストは MySQL に対して実行される。SQLite 側の確認は P2-3（両 DB の結合テスト基盤）で自動化する。
 * docs/archive/cloudflare-d1-migration-plan.md §5-4
 */
import { testPrisma, resetDb } from "../helpers/dbTest";
import { prisma } from "@/lib/prisma";
import { getRecommendedAuthors } from "@/lib/recommendations";
import { getRecommendedUsers } from "@/lib/userRecommendations";

afterAll(async () => {
  await testPrisma.$disconnect();
  await prisma.$disconnect();
});

beforeEach(async () => {
  await resetDb();
});

async function seed() {
  const [me, b, c, d] = await Promise.all(
    ["自分", "ユーザーB", "ユーザーC", "ユーザーD"].map((name, i) =>
      testPrisma.user.create({ data: { name, email: `rec${i}@example.com`, role: "user" } })
    )
  );
  const authors = {
    x: await testPrisma.author.create({ data: { name: "著者X" } }),
    y: await testPrisma.author.create({ data: { name: "著者Y" } }),
    z: await testPrisma.author.create({ data: { name: "著者Z" } }),
    w: await testPrisma.author.create({ data: { name: "著者W" } }),
  };
  const likes: [typeof me, (keyof typeof authors)[]][] = [
    [me, ["x", "y"]],
    [b, ["x", "y", "z"]],
    [c, ["x", "z"]],
    [d, ["w"]],
  ];
  for (const [user, keys] of likes) {
    for (const key of keys) {
      await testPrisma.favoriteAuthor.create({ data: { userId: user.id, authorId: authors[key].id } });
    }
  }
  return { me, b, c, d, authors };
}

describe("getRecommendedAuthors", () => {
  it("Jaccard 係数を小数で計算し、未登録の著者だけをスコア降順で返す", async () => {
    const { me, authors } = await seed();

    const result = await getRecommendedAuthors(me.id);

    // 著者Z: X との共起 2 人 → 2/(3+2-2)=0.6667、Y との共起 1 人 → 1/(2+2-1)=0.3333。最大の 0.6667 を採用
    expect(result.map((r) => r.authorId)).toEqual([authors.z.id]);
    expect(result[0].name).toBe("著者Z");
    expect(result[0].score).toBeCloseTo(2 / 3, 3);
    expect(typeof result[0].score).toBe("number");
  });

  it("共起がなければ空配列", async () => {
    const { d } = await seed();
    expect(await getRecommendedAuthors(d.id)).toEqual([]);
  });

  it("limit で件数を絞れる", async () => {
    const { me, authors } = await seed();
    // 著者W も、自分以外の B が X と W を登録していれば候補になる
    const bUser = await testPrisma.user.findFirstOrThrow({ where: { name: "ユーザーB" } });
    await testPrisma.favoriteAuthor.create({ data: { userId: bUser.id, authorId: authors.w.id } });

    expect(await getRecommendedAuthors(me.id, 5)).toHaveLength(2);
    expect(await getRecommendedAuthors(me.id, 1)).toHaveLength(1);
  });
});

describe("getRecommendedUsers", () => {
  it("共通著者数の多い順に返し、共通著者名は名前順で連結せず配列で返す", async () => {
    const { me, b, c } = await seed();

    const result = await getRecommendedUsers(me.id);

    expect(result.map((r) => [r.userId, r.commonAuthorCount])).toEqual([
      [b.id, 2],
      [c.id, 1],
    ]);
    expect(result[0].commonAuthorNames).toEqual(["著者X", "著者Y"]);
    expect(result[1].commonAuthorNames).toEqual(["著者X"]);
  });

  it("既にフォロー中のユーザーは除外する", async () => {
    const { me, b, c } = await seed();
    await testPrisma.follow.create({ data: { followerId: me.id, followingId: b.id } });

    const result = await getRecommendedUsers(me.id);

    expect(result.map((r) => r.userId)).toEqual([c.id]);
  });

  it("共通著者名は表示上限（3件）に絞るが、共通著者数は全体件数を保つ", async () => {
    const { me, b } = await seed();
    const extra = await Promise.all(
      ["著者P", "著者Q"].map((name) => testPrisma.author.create({ data: { name } }))
    );
    for (const author of extra) {
      await testPrisma.favoriteAuthor.createMany({
        data: [
          { userId: me.id, authorId: author.id },
          { userId: b.id, authorId: author.id },
        ],
      });
    }

    const result = await getRecommendedUsers(me.id);
    const top = result.find((r) => r.userId === b.id)!;

    expect(top.commonAuthorCount).toBe(4);
    expect(top.commonAuthorNames).toHaveLength(3);
  });

  it("共通の著者がいなければ空配列", async () => {
    const { d } = await seed();
    expect(await getRecommendedUsers(d.id)).toEqual([]);
  });
});
