// `node:sqlite`（Node.js 22.13 以降）の型。依存している @types/node（v20）にはまだ含まれないため、
// D1 マイグレーションの検査スクリプト（prisma/scripts/d1-migration.ts）が使う範囲だけを宣言する。
// @types/node を 22 以降へ更新したら、このファイルは削除する。
declare module "node:sqlite" {
  export class DatabaseSync {
    constructor(path: string);
    exec(sql: string): void;
    close(): void;
  }
}
