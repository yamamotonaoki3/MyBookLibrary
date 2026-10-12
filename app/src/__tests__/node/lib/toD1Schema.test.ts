import { readFileSync } from "node:fs";
import path from "node:path";
import { findUnsupportedForD1, toD1Schema } from "@/lib/schema/toD1Schema";

const SAMPLE = `generator client {
  provider = "prisma-client-js"
  output   = "../src/generated/prisma"
}

datasource db {
  provider = "mysql"
  url      = env("DATABASE_URL")
}

model Review {
  id        Int      @id @default(autoincrement())
  body      String   @db.Text
  postedOn  DateTime @map("posted_on") @db.Date
  title     String   @db.VarChar(191)
  detail    Json?

  @@index([title])
  @@map("reviews")
}
`;

describe("toD1Schema", () => {
  const output = toD1Schema(SAMPLE);

  it("datasource を sqlite にし、MySQL の接続設定を残さない", () => {
    expect(output).toContain('provider = "sqlite"');
    expect(output).not.toContain('provider = "mysql"');
    expect(output).not.toContain("DATABASE_URL");
  });

  it("generator の出力先を D1 用に分ける", () => {
    expect(output).toContain('output     = "../../src/generated/prisma-d1"');
    expect(output).toContain('engineType = "client"');
    expect(output.match(/^generator /gm)).toHaveLength(1);
  });

  it("MySQL のネイティブ型属性（@db.*）を取り除く", () => {
    expect(output).not.toMatch(/@db\./);
    expect(output).toMatch(/body\s+String\s*$/m);
    expect(output).toMatch(/postedOn\s+DateTime\s+@map\("posted_on"\)\s*$/m);
    expect(output).toMatch(/title\s+String\s*$/m);
  });

  it("モデル・フィールド・インデックスは変えない", () => {
    expect(output).toContain("model Review {");
    expect(output).toContain("id        Int      @id @default(autoincrement())");
    expect(output).toContain("detail    Json?");
    expect(output).toContain("@@index([title])");
    expect(output).toContain('@@map("reviews")');
  });

  it("先頭に自動生成であることを示す注意書きがある", () => {
    expect(output.startsWith("// このファイルは自動生成です。")).toBe(true);
  });

  it("文字列リテラルやコメントの中の @db.* は変えない", () => {
    const schema = `model Memo {
  id   Int    @id
  note String @default("memo @db.Text") @db.Text // @db.Text を使う
}
`;
    const out = toD1Schema(schema);
    expect(out).toContain('@default("memo @db.Text")');
    expect(out).toContain("// @db.Text を使う");
    expect(out).not.toMatch(/\)\s+@db\.Text\s+\/\//);
  });

  it("同じ入力から常に同じ出力を返す（冪等）", () => {
    expect(toD1Schema(SAMPLE)).toBe(output);
  });
});

describe("findUnsupportedForD1", () => {
  it("D1 で使えない記述を検出する", () => {
    expect(findUnsupportedForD1("model A {\n  id Int @id\n}\nenum Role {\n  USER\n}\n")).toHaveLength(1);
    expect(findUnsupportedForD1("model A {\n  id Int @id\n  t String\n  @@fulltext([t])\n}\n")).toHaveLength(1);
    expect(findUnsupportedForD1("model A {\n  id Int @id\n  price Decimal\n}\n")).toHaveLength(1);
  });

  it("コメントや文字列リテラルの中の語では誤検出しない", () => {
    const schema = `model A {
  id    Int    @id
  note  String @default("price Decimal")
  // @@fulltext は使用しない。enum Role も使わない
}
`;
    expect(findUnsupportedForD1(schema)).toEqual([]);
  });

  it("問題のないスキーマでは空", () => {
    expect(findUnsupportedForD1(SAMPLE)).toEqual([]);
  });
});

describe("実際のスキーマ（ドリフト検査）", () => {
  const read = (relative: string) =>
    readFileSync(path.resolve(process.cwd(), relative), "utf8").replace(/\r\n/g, "\n");

  it("prisma/d1/schema.prisma は prisma/schema.prisma から生成した内容と一致する", () => {
    expect(read("prisma/d1/schema.prisma")).toBe(toD1Schema(read("prisma/schema.prisma")));
  });

  it("本アプリのスキーマに D1 で使えない記述がない", () => {
    expect(findUnsupportedForD1(read("prisma/schema.prisma"))).toEqual([]);
  });

  it("MySQL 版と D1 版でモデル名とフィールド名の一覧が同一", () => {
    const names = (schema: string) =>
      [...schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)].map(([, model, body]) => [
        model,
        body
          .split("\n")
          .map((line) => line.trim().split(/\s+/)[0])
          .filter((token) => token && !token.startsWith("@@") && !token.startsWith("//")),
      ]);
    expect(names(read("prisma/d1/schema.prisma"))).toEqual(names(read("prisma/schema.prisma")));
  });
});
