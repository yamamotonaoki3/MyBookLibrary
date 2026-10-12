/**
 * integration-d1 project 専用の setupFiles。アプリの DB 接続先を D1 に切り替える。
 * DB_PROVIDER・D1_RUNTIME はモジュール読み込み時に評価される（src/lib/prisma.ts・prismaD1.ts）ため、
 * prisma を import するどのテストより先に実行される setupFiles で設定する。
 */
process.env.DB_PROVIDER = "d1";
process.env.D1_RUNTIME = "node";
