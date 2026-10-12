# Cloudflare Workers + D1 移行計画（Issue #609）

AWS（EC2 / RDS / CloudFront）の費用が発生するようになったため、MyBookLibrary を Cloudflare Workers と D1 へ移行する計画。実装は含まず、**調査結果・採用案・検証ゲート・データ移行手順・切替手順・後続 Issue 分割**までを定める。

- 作成日: 2026-10-11 / 対象 Issue: #609 / 関連: #497（AWS 本番更新。本計画により不要になる見込み）、#607（秘密情報）、#608（管理者デモ廃止）
- 凡例: ✅ 公式ドキュメント等で確認済み（2026-10-11 時点）／ ⚠️ 未確認・推測を含む（**Phase 0 の検証で確定させる**）

---

## 0. 要点

1. 移行先の有力案は「**OpenNext アダプタで Next.js 16 を Workers に載せ、DB は D1（Prisma アダプタ）**」。ただし現時点で**確定できない前提が複数ある**ため、いきなり移行せず、まず捨てる前提の**検証（Phase 0）で Go/No-Go を判断**する。
2. 最大の論点は2つ。**(a) Workers Free の CPU 10ms/リクエスト**（Next.js の描画・bcrypt（cost 12）はほぼ確実に超える見込み。Workers Paid は月 $5〜）、**(b) Prisma の D1 アダプタが Preview で、トランザクション非対応**（本アプリは `$transaction` を11箇所で使用）。
3. データは **ID・日時・bcrypt ハッシュ・日本語を保ったまま、アプリ層（Prisma 経由）で移す ETL** とし、件数・主キー・外部キー・列ごとのハッシュで照合する。AWS は現在停止中のため、**書込み凍結が不要になる代わりに、「旧 DB の保全」と「ロールバック」の考え方が変わる**（§9）。
4. **MySQL（RDS）は捨てずに併存させる**（2026-10-12 のユーザー決定）。D1 へ移行した後も、**MySQL 用と D1 用のスキーマ・マイグレーションの両方を維持**し、必要になれば AWS（RDS）で再開できる状態を保つ（§4-4）。このため、DB 依存の変更は常に「両方で動く」ことが条件になる。

---

## 1. 現状

| 項目 | 内容 |
| --- | --- |
| アプリ | Next.js 16.2.6（App Router / React 19）、`output: "standalone"`、ビルドは `next build --webpack`（`@ducanh2912/next-pwa` のため） |
| DB | MySQL 8.4 / Prisma 6.19.3（`prisma-client-js`、`src/generated/prisma`）。21 モデル、マイグレーション 25 件 |
| 認証 | NextAuth.js v5 beta（JWT セッション）＋ Credentials（bcryptjs cost 12）＋ Google OAuth（`@auth/prisma-adapter`）。`src/proxy.ts`（Next 16 の proxy）で `auth` を実行 |
| 定期実行 | AWS EventBridge ＋ Lambda が `GET /api/cron/check-new-books`（Bearer 認証）を毎日 UTC 00:00 に呼ぶ |
| 画像 | `next/image`（`sharp`）、`remotePatterns` は `https://**` |
| ログ | `pino`（本番は JSON 出力） |
| 外部 API | 楽天ブックス、NDL サーチ、カーリル（すべて fetch） |
| ドメイン | 独自ドメインなし（CloudFront の既定ドメイン） |
| 現在の稼働状態 | **AWS 環境は費用のため削除済み**（RDS インスタンスは存在しない。利用者向けには公開されていない）。**残っているのは RDS の手動スナップショット `mybooklibrary-final-before-destroy-20261008`（2026-10-08 21:01 JST 作成、20GB）のみ**。Terraform コード（`terraform/`）とデプロイ文書はリポジトリに**残す**（再構築の記録として保持。削除しない） |
| 本番データの規模（2026-10-11 のダンプで確認） | users 3（admin 1・user 2。メールは小文字化しても重複なし。パスワードは全員 bcrypt `$2b$`）／accounts・sessions・reviews・likes・follows 0／authors 1,393／books 3,014（すべて `source=rakuten`、手動登録なし）／book_isbns 1,699／awards 4／award_entries 3,035／reading_statuses 65／book_enrichment_items 5,561／適用済みマイグレーション 24 件（リポジトリは 25 件） |

---

## 2. 調査結果

### 2-1. Cloudflare プラットフォームの制限・料金

| 項目 | Workers Free | Workers Paid | 備考 |
| --- | --- | --- | --- |
| 月額 | 無料 | **最低 $5 / アカウント** | ✅ |
| CPU 時間 / リクエスト | **10 ms** | 既定 30 秒（最大 5 分） | ✅ |
| 含まれる量 | 10万リクエスト/日 | 月 1,000 万リクエスト・月 3,000 万 CPU ms | ✅ 超過は 100万リクエスト $0.30、100万 CPU ms $0.02 |
| サブリクエスト / 呼び出し | 50 | 10,000 | ✅ D1 クエリもこの数に含まれる（1 呼び出し 50 クエリまで） |
| Worker サイズ | ⚠️ 文書間で食い違い | ⚠️ | Workers 制限ページは「64 MiB（非圧縮）」、OpenNext ページは「Free 3 MiB / Paid 10 MiB（圧縮後）」。**実際にデプロイして確認する** |
| Cron Triggers | 5 / アカウント | 250 | ✅ |
| D1 無料枠 | 読み取り 500万行/日、書き込み 10万行/日、保存 5 GB（DB 1つ 500 MB まで） | 読み取り 250億行/月、書き込み 5,000万行/月込み | ✅ 読み取りは「スキャンした行数」で数える（インデックス設計が課金に効く） |
| D1 の制約 | 1 クエリ 30 秒、バインドパラメータ 100 個、1 文 100 KB、行 2 MB | 同左 | ✅ |

**含意**: ポートフォリオ規模なら D1 は無料枠で収まる見込み。一方 **Workers 本体は Free の CPU 10ms を満たせない可能性が高い**（§4 の G0）。その場合の最小コストは **Workers Paid の月 $5**（他は無料枠内の見込み）。

### 2-2. Next.js を Workers で動かす方式

| 方式 | 状況 |
| --- | --- |
| **OpenNext（`@opennextjs/cloudflare`）** | ✅ 公式ガイドに「Next.js 16 の全マイナー/パッチをサポート」。✅ Node.js ミドルウェア（15.2〜）は**未サポート**。⚠️ Next 16 の `proxy.ts` への対応は公式に明記なし（第三者情報では未対応）。既存アプリの維持向けと位置づけられている |
| **vinext**（Cloudflare 製、Vite 上に Next の API を再実装） | ✅ Cloudflare が「Workers で Next.js を動かす既定の方法」として推奨。Next 16 対象、`proxy.ts`・Server Actions・ISR 対応。✅ ただし「Next.js の完全な代替にはまだなっていない」と明記（開発中）。⚠️ next-auth・Prisma・PWA プラグインへの対応は記載なし。Turbopack/webpack 設定は使えない |

### 2-3. Prisma の D1 対応

- ✅ 公式ドキュメントで **Preview**（GA ではない）。Prisma 7 を前提とした手順で、アダプタは `@prisma/adapter-d1`、データソースは `sqlite`。
- ✅ **トランザクション非対応**（暗黙・明示とも無視され、個別クエリとして実行される。ACID が保証されない）。
- ✅ マイグレーションは `wrangler d1 migrations` と `prisma migrate diff` の組み合わせ（`prisma migrate deploy` の利用可否は記載なし）。
- ⚠️ 本リポジトリは Prisma 6.19.3。Prisma 7 への更新が前提になる可能性が高い（`prisma-client` ジェネレータ・`prisma.config.ts` 等の変更）。Json（SQLite）の扱いは 6 系で対応済みと認識しているが未確認。

### 2-4. Hyperdrive（外部の PostgreSQL／MySQL へ接続する代替経路）

- ✅ **Hyperdrive** は、Workers から外部のデータベースへ接続プール経由でつなぐ仕組み。**PostgreSQL と MySQL（MySQL 互換を含む）に対応**（MySQL 対応は 2025 年 4 月に提供開始。料金は Postgres と同じ）。AWS・Google Cloud・Azure 上の DB のほか Neon・PlanetScale 等につなげる。
- ✅ **Workers Free でも利用可**。Free は **1 日 10 万クエリ**まで、Paid は無制限。**接続プールとクエリキャッシュ、データ転送に追加料金はない**。設定数は Free 10／Paid 25。クエリの最大実行時間は 60 秒。
- ✅ Prisma は PostgreSQL では**公式手順あり**（`pg`（8.13.0 超）＋ `@prisma/adapter-pg`、`prisma generate --no-engine`）。Workers では**リクエストごとに新しい接続（プール）を作る**必要がある（使い回しは不可）。
- ⚠️ **MySQL を Hyperdrive 経由で Prisma から使う公式手順は見つかっていない**（Cloudflare の例は `mysql2` と `disableEval: true`）。Workers で動くドライバ（`@prisma/adapter-mariadb` 等）の検証が必要（#645）。
- ⚠️ Hyperdrive のクエリが **Workers のサブリクエスト数（Free: 50）に数えられるか**は公式ページに記載がない（#645 で実測）。
- 含意: **D1 の弱点は「`$transaction` 非対応」**（§5-3 の検証で確認）であり、Hyperdrive 経由の PostgreSQL／MySQL は**本物のトランザクションが使える**ため、この問題がなくなる。一方、**Workers 側の制限（CPU 10ms など）は DB を替えても変わらない**。

---

## 3. 互換性マトリクス（本アプリの要素別）

| 要素 | 現状 | Workers/D1 での扱い | 判定 |
| --- | --- | --- | --- |
| Next.js 実行 | standalone（Node） | OpenNext または vinext | ⚠️ G1 |
| `src/proxy.ts`（NextAuth `auth`） | Node ランタイム | OpenNext: `middleware.ts`（Edge）へ戻す必要の可能性。`auth.config.ts` が Prisma 非依存のため移せる見込み | ⚠️ G3 |
| NextAuth v5 beta（JWT） | 動作中 | Workers で動作例は多いが、Prisma Adapter（Google OAuth の Account/Session 保存）は D1 アダプタ経由になる | ⚠️ G3 |
| bcryptjs（cost 12） | 純 JS | **CPU 負荷が大きい**（1 回 数百 ms の見込み）。Free の 10ms は不可能、Paid なら許容 | ⚠️ G0 |
| `sharp` / `next/image` 最適化 | 動作中 | Workers では `sharp` 不可。Cloudflare Images（有料枠の可能性）か最適化なし（`unoptimized`）に変更 | 要変更 |
| `@ducanh2912/next-pwa` | webpack ビルドで SW 生成 | OpenNext なら `next build --webpack` を維持できる見込み。vinext（Vite）では使えない | ⚠️ G1 |
| `pino` | JSON ログ | Node 前提の機能あり。Workers では `console` ベースの薄いラッパーへ置換 | 要変更 |
| Cron | EventBridge + Lambda | **Cron Trigger**（`scheduled` ハンドラ）。OpenNext 標準では scheduled を持たないため、カスタム Worker エントリ（または別 Worker から API を呼ぶ）が必要 | 要設計 |
| `next: { revalidate }` の fetch キャッシュ（`rakuten.ts`） | Node の Data Cache | OpenNext ではキャッシュ用バインディング（KV/R2 等）が必要になる可能性。無くても動くが無効化される | ⚠️ |
| 環境変数・秘密情報 | SSM / `.env` | Worker secrets（`wrangler secret`）、ローカルは `.dev.vars`（gitignore）。#607 の方針に従う | 要設計 |
| Prisma Client | `prisma-client-js`、MySQL | `@prisma/adapter-d1`（Preview）、Prisma 7 の可能性 | ⚠️ G2 |
| `$transaction` | 11 箇所（§5-3） | D1 アダプタでは非原子的 | **要対応（G2）** |
| `$queryRaw` | 4 箇所（§5-4） | MySQL 方言（`FOR UPDATE`、`GROUP_CONCAT ... SEPARATOR`、除算の型）を書き換え | **要対応** |
| Json 列 | 2 列 | SQLite では Prisma が文字列で保存。読み書きの互換を検証 | ⚠️ |

---

## 4. 採用案と検証ゲート

### 4-1. 採用案（暫定）

> **Next.js 16（現行構成のまま）＋ OpenNext（`@opennextjs/cloudflare`）＋ Cloudflare D1 ＋ Prisma（D1 アダプタ）。Workers Paid（月 $5）を前提に検証し、Free で収まる場合のみ Free とする。**

**vinext でなく OpenNext を第一候補にする理由**: 本番データと既存利用者を持つアプリであり、(1) Next.js 16 を公式にサポートしている、(2) ビルド・PWA・NextAuth の現行構成を維持できる見込みが高い、(3) 移行リスクを「インフラ層の差し替え」に限定できるため。vinext は Cloudflare 推奨だが、開発中で、next-auth・Prisma・PWA の互換が未確認。Phase 0 で**両方を最小構成で検証**し、結果で最終決定する。

**併存方針（§4-4）**: 採用案は D1 を主系にするが、MySQL（RDS）の定義・マイグレーション・AWS 構成（Terraform 等）も維持し、どちらでも動かせる構成にする。

### 4-2. 代替案との比較

| 案 | 内容 | 長所 | 短所 |
| --- | --- | --- | --- |
| **A（採用案）** | OpenNext ＋ D1 ＋ Prisma（D1 アダプタ） | 現行コードの変更が最小。Repository 層（#613）の分離が効く | Prisma D1 が Preview・トランザクション非対応。Prisma 7 更新が必要な可能性 |
| B | vinext ＋ D1 ＋ Prisma | Cloudflare 推奨。proxy.ts 対応 | 開発中。next-auth・PWA 互換が未確認。ビルド系の置換が大きい |
| C | OpenNext ＋ D1 ＋ **Drizzle**（Prisma を置換） | D1 のネイティブ機能（`batch` による原子的実行）を使える。Prisma Preview のリスクを回避 | Repository 層・auth アダプタ・テスト基盤の書き換えが大きい |
| **E** | OpenNext ＋ **Hyperdrive ＋ 外部の PostgreSQL または MySQL**（D1 を使わない） | **本物のトランザクション**が使え、`$transaction` 11 箇所の置換が不要。MySQL を選べば**現行のスキーマ・SQL・マイグレーションをほぼそのまま使える**（併存問題〈§4-4〉も単純化）。Prisma の PostgreSQL 手順は公式にある | 外部 DB のホスティング費用・無料枠の制約（Neon Free は自動停止の起動待ち、Supabase Free は 1 週間無操作で停止）。**PostgreSQL は 3 つ目の方言**で、スキーマ・SQL の書き換えが生じる。MySQL の Prisma＋Hyperdrive は公式手順が未確認。Workers 側の CPU 制限は解消しない |
| D | 現状維持（AWS を再構築）／他クラウドへ移転 | 移行リスクなし。Terraform コードが残っているため再構築は可能 | 費用が発生する（本計画の前提を満たさない） |

**推奨**: A を第一候補とし、**G2（トランザクション）が許容できない場合は C（Drizzle）または E（Hyperdrive）に切り替える**。C は D1 のネイティブ機能（`batch`）を活かせるが書き換えが大きく、E は DB を外部に置くことでトランザクション問題自体をなくせる（費用と運用先が増える）。判断は Phase 0 の結果で行う。

### 4-3. 検証ゲート（Phase 0 で判定する Go/No-Go）

| ID | 検証内容 | 合格基準 | 不合格時の対応 |
| --- | --- | --- | --- |
| **G0** | **CPU・費用**: 最小構成の Worker で、ログイン（bcrypt）・一覧ページ・API の CPU 時間を実測（Free と Paid） | 主要操作が Free の 10ms 内に収まる、または Paid（月 $5）を許容する判断をユーザーが行う | Paid 前提で進める／（コスト不可なら）案 D を再検討 |
| **G1** | **ビルド・サイズ**: OpenNext で本アプリがビルド・デプロイでき、Worker サイズ上限（Free/Paid）に収まる。PWA（SW・manifest）が配信される | 起動・主要画面表示・SW 配信が成功 | vinext を試す／依存の削減 |
| **G2** | **Prisma D1 とトランザクション**: D1 アダプタで CRUD・`upsert`・`createMany`・Json が動き、§5-3 の各箇所を「単一文化／`batch` 化／競合を許容」のどれで置き換えるか判断できる | 11 箇所すべてに置換方針が付き、整合性要件を満たす | 案 C（Drizzle）または案 E（Hyperdrive ＋ PostgreSQL／MySQL。#645）へ切替 |
| **G3** | **認証**: Credentials ログイン、Google OAuth、JWT セッション、`proxy`（または `middleware`）による保護が Workers で動く | ログイン〜保護ページ表示〜ログアウトが通る | `middleware.ts`（Edge）化／認証周りの調整 |
| **G4** | **Cron**: Cron Trigger から `/api/cron/check-new-books` を実行できる | スケジュール実行で通知が作成される | カスタム Worker エントリ／別 Worker から呼び出し |

### 4-4. DB の併存方針（MySQL〈RDS〉と D1 の両対応を維持）

**方針**: D1 へ移行した後も、**MySQL 用と D1 用の 2 つのデータベース定義を残し**、アプリは `DB_PROVIDER`（`mysql` / `d1`）で切り替えて動かせるようにする。D1 専用に作り替えて MySQL を捨てることはしない。AWS で再開する場合は、Terraform とデプロイ手順で環境を再構築し、データは §7 の逆 ETL で戻す。

| 項目 | 内容 |
| --- | --- |
| スキーマ定義 | `app/prisma/mysql/schema.prisma`（現行）と `app/prisma/d1/schema.prisma`（`sqlite` プロバイダ）の **2 つ**。モデル定義の**正は MySQL 版**とし、D1 版は MySQL 版から**生成スクリプトで作る**（`@db.*` の除去等の差分だけを機械的に適用）。手書きで両方を直さない |
| ドリフト検査 | CI で「MySQL 版から生成した D1 版が、コミット済みの D1 版と一致する」ことを検査し、定義のずれを防ぐ |
| マイグレーション | MySQL: `prisma migrate`（現行の 25 件を維持）。D1: `wrangler d1 migrations`（`prisma migrate diff` で生成）。**スキーマ変更の PR は、両方のマイグレーションをセットで追加**する（PR チェックリストに追加） |
| クライアント | 生成クライアントを 2 つ出力し（出力先を分ける）、`src/lib/prisma.ts` が `DB_PROVIDER` で選ぶ。Repository 層は共通の型で書き、DB 方言の差は Repository／生 SQL の内部に閉じる（#613 の責務分離を活用） |
| 恒久ルール | 新規・変更コードは**両方の DB で動くこと**が条件。`FOR UPDATE` など MySQL 固有の機能は使わず、`$transaction` は §5-3 の原子化パターン（両 DB で成立する形）に統一する。方言が避けられない生 SQL は、方言別の実装を Repository に持たせてテストで両方を縛る |
| 実行基盤 | AWS（Node／standalone／Docker）と Workers の**両方でビルドできる状態を保つ**。`sharp`・`pino` など実行基盤に依存する部分は抽象化して差し替え可能にする（P1-5・P1-6） |
| テスト | 結合テストは **CI で両 DB に対して実行**（matrix）。E2E は主系（D1／Workers プレビュー）で実行し、MySQL 構成はスモーク（起動・ログイン・主要 API）で確認する |
| AWS の維持 | Terraform・デプロイ文書・Dockerfile は削除せず残し、「**未稼働だが再開できる**」ことを維持する。再開手順書（runbook）を用意し、MySQL 構成のビルド・起動確認を CI で常時行う（再開時に初めて壊れていると気づく事態を防ぐ） |
| データの往復 | MySQL → D1 の ETL（§7）に加え、**D1 → MySQL の逆 ETL**と、D1 の定期エクスポート（バックアップ）を用意する。これにより、運用中の最新データを使って RDS へ戻せる |

**トレードオフ**: スキーマ変更・テスト・CI の負荷が増え、機能追加のたびに 2 つの DB での動作確認が必要になる。軽減策は、(1) スキーマの正を 1 つにして生成する、(2) CI で自動検査する、(3) DB 依存を Repository に閉じ込める、の 3 点。**併存の保守負荷が過大になった場合は、併存を見直すかをユーザーと再検討する**（見直しのトリガー: 両 DB 対応が原因の開発遅延が続く、D1 のみで運用できる実績が十分に積み上がった、など）。

**実装メモ（#661・B1）**: MySQL 版は従来の場所（`prisma/schema.prisma`）のまま正とし、D1 版は `prisma/d1/schema.prisma` に生成する（計画の `prisma/mysql/` への移動は、設定・CI・文書への影響が大きく利点が小さいため行わない）。生成は `npm run schema:d1`、検査は `npm run schema:d1:check`（生成結果との一致と `prisma validate`。CI で実行）。変換は `@db.*` の除去と generator／datasource の差し替えのみで、D1 で使えない記述（enum・`@@fulltext`・`Unsupported`・`Decimal`・`BigInt`）が MySQL 版に入ると生成が失敗する。**スキーマを変えるときは MySQL 版を編集し、`npm run schema:d1` を実行して D1 版もコミットする。D1 版を直接編集しない。** D1 用クライアントの出力先は `src/generated/prisma-d1`（`npx prisma generate --schema prisma/d1/schema.prisma`）。注意: `@db.Date`（`books.published_at`）は D1 では日時の文字列になるため、日付だけを扱う比較は B5 の結合テストで確認する。

**実装メモ（#662・B2: D1 マイグレーション運用）**: 既存の MySQL マイグレーション 25 件は変換せず、**現在のスキーマから D1 のベースラインを 1 本作る**（`prisma/d1/migrations/0001_baseline.sql`。本番データは ETL で移すため）。形式は `wrangler d1 migrations` の `NNNN_名前.sql`、設定は `app/wrangler.jsonc`（`migrations_dir`。D1 の実 ID は P3-2 で設定）。

- スキーマ変更の手順: ①MySQL 版 `prisma/schema.prisma` を編集 → ②`npm run schema:d1` → ③`npm run d1:migration:new -- <名前>`（D1 版との差分から次の番号のマイグレーションを作成）→ ④MySQL 側も `prisma migrate dev` でマイグレーションを作る。
- 検査: `npm run d1:migration:check`（マイグレーションを順に適用した結果が D1 版スキーマと一致するか。CI で実行）。
- ローカル適用: `npm run d1:migrate:local`（Windows でパスが長い場合は `--persist-to C:/tmp/...` を付ける）。
- 注意: Prisma が SQLite のテーブル再作成（`PRAGMA foreign_keys=OFF` を含む）を出した場合、D1 では `PRAGMA defer_foreign_keys = on;` に置き換える（`new` が警告する）。
- 構造の同等性の確認（ベースライン適用後）: テーブル 21 件、索引 24 件（一意性を含む）、外部キー 26 件（削除時の動作を含む）が MySQL 版と一致。MySQL が外部キーのために自動作成する索引 14 件は SQLite では不要。

**実装メモ（#663・B3: Prisma クライアントの DB 切替）**: `src/lib/prisma.ts` が `DB_PROVIDER`（`mysql`〔既定〕／`d1`）で接続先を選ぶ。値はビルド時に `next.config.ts` の `env` で埋め込まれ、使わない側（D1 なら `prismaD1.ts`・`@prisma/adapter-d1`・D1 用クライアント）は MySQL 向けのバンドルに含まれない（本番ビルドで確認）。D1 は `getD1Binding()`（Workers では OpenNext が設定するグローバルのコンテキストの `env.DB`、Node のスクリプト／テストでは `registerD1Binding` で登録）から取得し、`createPerBindingProxy` が `prisma.xxx` へのアクセスのたびにバインディングを解決して、同じバインディングならクライアントを使い回し、変われば作り直す。D1 用クライアントは `src/generated/prisma-d1`（`postinstall` と `npm run prisma:generate:d1` で生成）。2 つの生成クライアントの型は相互に代入できないため、共通の型（MySQL 版の `PrismaClient`）へのキャストは `prismaD1.ts` の 1 か所に集約した。ローカルの D1（miniflare）に対する検証では、作成・取得・一意制約違反（`P2002`）・include・日本語と絵文字・DateTime・upsert・Json・外部キー制約が動作した。Workers 上での動作は Phase 0 で確認済みで、ビルドへの組み込みは B8 で行う。

**実装メモ（#666・B5: 両 DB の結合テスト）**: 結合テスト（`*.itest.ts`）を、MySQL（`npm run test:integration`）と D1（`npm run test:integration:d1`。Jest の `integration-d1` project）の両方で実行する。D1 版は `DB_PROVIDER=d1`・`D1_RUNTIME=node` でアプリを切り替え、`jest.global-setup.integration-d1.ts` が一時ディレクトリにローカル D1（miniflare）を作って D1 マイグレーションを適用し、各テストファイルが `getPlatformProxy` で接続する（`.dev.vars` の読み込みが Jest 上で失敗するため、空の `.dev.vars` を置いた設定ディレクトリを使う）。`resetDb` は D1 では全テーブルを 1 回の batch（外部キー検査を遅延）で空にし、採番も戻す。MySQL 固有の検証は `itFor(["mysql"])` / `describeFor` で除外する。CI は `integration-d1` ジョブを `test` ジョブと並行して実行する。初回の実行で、既存の結合テスト 50 件のうち 49 件が D1 でもそのまま通った（生 SQL・条件付き削除・統合・email 正規化を含む）。残る 1 件は `atomically` の原子性で、D1 の `batch` 化（#664）まで MySQL 限定にしている。

**実装メモ（#664・B4a: `atomically` の D1 実装）**: `atomically(steps)` は、各書き込みを `{ prisma, d1 }` の組（MySQL では Prisma の操作、D1 では**同じ意味の SQL**）で受け取り、MySQL は `$transaction` の配列形式、D1 は D1 の `batch`（1 つでも失敗すれば全体を取り消す）で実行して影響行数を返す。Prisma は D1 の複数文を原子化できず、操作から SQL を取り出す公式の手段もないため、SQL は手書きし、**両 DB の結合テスト（B5）で 2 つの表現が同じ結果になること**を担保する。Prisma を直接呼ぶ処理は repositories に置いた（`followRepository`・`passwordResetRepository`・`reviewModerationRepository`・`awardEntryRepository`・`manualBookRepository`・`userDeletionRepository`）。D1 の日時は ISO 8601 の文字列（Prisma と同じ形式）で保存する。ESLint の `no-restricted-syntax` で、`atomically.ts` 以外での `$transaction` の利用をエラーにしている（D1 で非原子的に実行されるため）。

**実装メモ（#665・B4b: `skipDuplicates`）**: `createMany({ skipDuplicates: true })` は SQLite（D1）で使えないため、2 箇所を書き換えた。①CSV インポートの著者の一括作成は、`authors.name` に一意制約がなく `skipDuplicates` が実質的に効いていなかったため、指定を外した（挙動は不変）。②いいねの通知は、`notificationRepository.createNotificationIfAbsent`（作成して、一意制約違反〔P2002〕なら無視する。既存の通知は変更しない）に置き換えた。P2002 の判定は `isUniqueConstraintError`（`src/lib/prismaErrors.ts`。MySQL 用・D1 用どちらの生成クライアントのエラーも `code` で判定）に共通化した。

**実装メモ（#667・B6: 認証の D1 対応）**: Credentials ログインは Prisma 経由のため D1 でそのまま動く（B5 の結合テストで確認）。Google ログイン用の NextAuth アダプタ（`createAdapter`）も、結合テストを MySQL・D1 の両方で実行して同じ結果になることを確認した（ユーザー作成〔メール小文字化〕、メール検索、連携、アカウントからの取得、更新、削除のカスケード）。この検証で、`getUserByAccount` だけユーザー ID が数値のまま返る既存の不整合が見つかり、他の関数と同じく文字列にそろえた。`proxy.ts` の `matcher` から `api/auth` を除外した（OpenNext では proxy の Cookie がルートの Cookie の後ろに付き、`MissingCSRF` になるため。`api/auth` は認証不要の公開パスで、AWS 側の挙動は変わらない。除外の範囲は単体テストで固定）。ESM 専用の `@auth/prisma-adapter` を Jest で読み込むため、このパッケージだけ CommonJS へ変換する設定を `jest.config.ts` に追加した。

**環境変数と再ログイン（Workers）**: `AUTH_SECRET`（Worker の secret。**変更すると既存の JWT セッションがすべて無効になり、全員が再ログインになる**）、`AUTH_TRUST_HOST`（`true`。Workers ではホスト名を信頼する）、Google ログインを使う場合は `AUTH_GOOGLE_ID`・`AUTH_GOOGLE_SECRET`（Worker の secret。Google Cloud のリダイレクト URI に `https://<ドメイン>/api/auth/callback/google` を登録）。セッションの Cookie 名は https で `__Secure-authjs.*`／`__Host-authjs.csrf-token` になり、**配信ドメインを変える（例: `*.workers.dev` → 独自ドメイン）と Cookie が共有されず、全員が再ログインになる**。**Google の実機でのログイン確認は、検証用の OAuth クライアントが必要なため #641 で行う**（アダプタ側の D1 動作は上記のとおり確認済み）。

**実装メモ（#668・B7: Cron の Worker 対応）**: Cron Trigger の `scheduled` ハンドラを `src/lib/cronScheduler.ts`（`createScheduledHandler`）に実装した。`CRON_SECRET`（Worker の secret）を Bearer にして、Worker 内の `fetch` ハンドラを直接呼び、`GET /api/cron/check-new-books` を内部呼び出しする（HTTP を介さない）。`CRON_SECRET` 未設定、API の 2xx 以外・例外は、実行を失敗として扱う（ダッシュボードで見える）。Cloudflare の Cron は自動再試行しないが、API は重複通知を作らない冪等な作りのため、失敗は次の定時実行で回復する。ログに `CRON_SECRET` の値は出さない。カスタムエントリは `app/worker/index.mjs`（OpenNext の `worker.js` の `fetch` と Durable Object のクラスを再エクスポートし、`scheduled` を足す。wrangler の `main` への設定とビルドは P3-1）。スケジュールは `wrangler.jsonc` の `triggers.crons`（`0 0 * * *` = UTC 00:00 = JST 09:00、AWS の EventBridge と同じ）。内部リクエストの origin は変数 `CRON_TARGET_ORIGIN`（未設定なら `http://localhost`。P3-2 で設定）。AWS 側の EventBridge + Lambda（Terraform）は併存のため変更しない。

- ローカルでの手動実行: `wrangler dev --test-scheduled` で起動し、`curl "http://localhost:8787/__scheduled?cron=0+0+*+*+*"`。`CRON_SECRET` は `.dev.vars`（git 管理外）に書く。**実際に wrangler で起動して確認済み**（Bearer 認証で 200、secret はログに出ない）。
- 検証: 単体テスト（ハンドラ）と、MySQL・D1 の結合テスト（scheduled ハンドラ → 実際のルート → DB。楽天 API はスタブ）。再実行しても通知が重複しないこと、1 週間より前の本・通知 OFF の著者は対象外、新刊が 35 件でも全件作成されることを確認。
- D1 の制約への対処: D1 は 1 回のクエリのバインドパラメータが 100 個までのため、通知の一括作成は 10 件ずつに分けた。**同じ制約を受ける他の箇所（CSV インポートの著者の一括作成、大量の `IN` 句など）は別途対応が必要**（フォローアップの Issue を起票）。

**実装メモ（#679: Next.js の更新）**: OpenNext（`@opennextjs/cloudflare` 1.20.x）の要件（Next.js 16.3.8 以上）のため、`next` と `eslint-config-next` を 16.2.6 から **16.3.8** に更新した（固定バージョン）。リリースノート（16.3.0〜16.3.8）に本アプリへ影響する破壊的変更はなく（TypeScript 設定の既定値・実験的設定の非推奨が中心。`middleware` の非推奨警告は、本アプリが `proxy` を使うため該当しない）、単体・結合（MySQL・D1）・E2E（77 件）・本番ビルドがすべて通ることを確認した。E2E は 1 回目に 1 件が失敗（読書ステータスの検索結果カード。単独実行 3 回と全体の再実行は成功のため、負荷時の不安定さと判断）。`next dev` が生成する `AGENTS.md` の注意書きの更新を含む。

**実装メモ（#669・B8: Worker のビルド）**: `npm run build:worker`（`scripts/build-worker.mjs`）が、`DB_PROVIDER=d1`・`D1_RUNTIME=workers` で OpenNext（`open-next.config.ts`）によるビルドを行い、Prisma の wasm を Worker に同梱する後処理をする。①`next.config.ts` の webpack `externals` が `*.wasm` を処理対象から外す（D1 ビルドのみ。MySQL 向けのビルドは変わらない）。②ビルド後に `handler.mjs` の wasm への絶対パスの import を相対パスに書き換え、`query_compiler_bg.wasm` を同じ場所へコピーする。③wrangler（`wrangler.jsonc` の `main` = `worker/index.mjs`、`assets` = `.open-next/assets`）が `CompiledWasm` として同梱する。書き換え対象がなければビルドを失敗させる（OpenNext の出力形式が変わったときに気づくため）。サイズは約 13.7 MiB（gzip 約 3.0 MiB）で、Paid の上限（10 MiB）に収まる（Free の 3 MiB は超える）。

**スモークテスト（`npm run smoke:worker`）**: ビルドした Worker をローカルの D1（miniflare）と `wrangler dev --local` で起動し、画面の表示、proxy による未認証のリダイレクト、Prisma（D1 アダプタ + wasm）経由の Credentials ログイン・セッション・保護ページ、失敗時の D1 への書き込み、Cron Trigger → 新刊チェック API、ログに秘密情報が出ないこと（計 10 項目）を確認する。認証情報は実行ごとにランダムに生成する。ローカルの http でも `AUTH_URL` を https にして Cookie の種類をそろえる（Workers は常に https として扱われ、OpenNext の proxy がセッションの Cookie 名を https で決めるため）。CI に `worker` ジョブ（ビルド → サイズ確認 → スモークテスト）を追加した。Windows でのビルドは OpenNext が公式にはサポートしないため、CI（Linux）で検証する（ローカルの Windows でも動作は確認済み）。

### 4-5. 案 E（Hyperdrive ＋ 外部 DB）の概要と費用

| 項目 | 内容 |
| --- | --- |
| 構成 | Workers（OpenNext）→ Hyperdrive → 外部の PostgreSQL／MySQL。D1 は使わない |
| 費用（月額の目安） | **Workers**: Free なら $0、CPU 時間で足りなければ Paid の **$5〜**（Hyperdrive は Free/Paid とも**追加料金なし**）。**DB**: Neon Free **$0**（0.5GB・月 100 CU 時間・アイドル 5 分で自動停止）、Supabase Free **$0**（**1 週間無操作で停止**するためポートフォリオには不向き。Pro は月 $25）。マネージド MySQL は候補の料金を要確認。→ **Neon Free ルートなら $0〜$5**で、D1 案とほぼ同等 |
| 注意（費用の数値） | Neon・Supabase の数値は**第三者記事を含み、情報が食い違う項目がある**（Paid の最低料金、エグレス等）。契約前に公式の料金ページで確認する（#645） |
| PostgreSQL を選ぶ場合 | 第 3 の方言になる。Json→`jsonb`、`GROUP_CONCAT`→`string_agg`、`mode: "insensitive"` の扱い、日時・`@db.Date`、自動採番の移行（`sequence` の更新）等の書き換えと、ETL（MySQL→PostgreSQL）が必要。**大文字小文字を区別する点は SQLite と同じ**なので、`email` の小文字正規化（P1-2）は流用できる |
| MySQL を選ぶ場合 | スキーマ・マイグレーション・生 SQL（`FOR UPDATE` を含む）を**ほぼそのまま**使える。**MySQL と D1 の併存（§4-4）は不要**になり、RDS への復帰も同じスキーマで済む。ただし Workers で動く Prisma のドライバ構成が未確認 |
| 向かないケース | Workers の **CPU 時間（Free 10ms）が問題の場合**は、DB を替えても解決しない（Paid が必要）。また接続ドライバ分の CPU が加わる可能性がある |
| 検証 | #645（G2 不合格時のみ実施） |

### 4-6. Phase 0 の検証結果（#639: G0・G1）

実際の Cloudflare アカウントへ、本アプリのコピー（使い捨て）を OpenNext でデプロイして計測した（詳細は #639 のコメント）。

| 項目 | 結果 |
| --- | --- |
| **G1 ビルド・サイズ・PWA** | ✅ ビルド成功（約 35 秒）。Worker は**非圧縮 約 11.5 MiB／gzip 約 2.3 MiB**でデプロイ成功、PWA（`sw.js`・`manifest.json`）も配信される。`proxy.ts`（Node ミドルウェア）は Workers 上で動作（OpenNext は experimental と警告）。**ただし最新の OpenNext アダプタ（1.20.10）は Next.js ≥ 16.3.8 が必須**（現行 16.2.6 は更新が必要）。Windows では「完全には互換でない」警告があるため、ビルド・デプロイは CI（Linux）で行う |
| **G0 CPU 時間** | ❌ **Workers Free の 10 ms/リクエストでは動かせない**。コールドスタート 158〜286 ms、ログインの bcrypt（cost 12）305〜800 ms、`/login` の描画 13〜178 ms（中央値 99）、D1 直接アクセス 4〜16 ms。**Workers Paid（月 $5〜）が必須**（ユーザー確認: 現在のアカウントは **Free プラン**。検証では 10ms 超過でも打ち切られなかったが公式制限に依存しない。**本番は Paid 前提**）。Paid の含有量（月 3,000 万 CPU ms）は、平均 100 ms/リクエストで**約 30 万リクエスト/月**に相当し、個人利用の規模では**月 $5 の固定費のみ**になる見込み |
| 追加の課題 | `createMany({ skipDuplicates })` は SQLite で不可（2 箇所）。Prisma を OpenNext でバンドルする wasm 設定は §4-7 で**解決**（後処理が必要）。bcrypt が最大の CPU 消費だが、Paid の含有量内に収まるため WebCrypto 系（PBKDF2 等）への段階移行（ログイン時に平文から新方式で再ハッシュし、`$2b$` 接頭辞で方式を判定）は**任意の最適化**とし、実測で体感が悪い場合のみ着手する。PBKDF2 は Workers で反復回数の上限（10万回）があり強度が下がる点も要確認 |

**結論（G0）**: 案 A・E のどちらも **Workers Paid が前提**になる（CPU 制限は DB を替えても変わらない）。D1 は費用面で有利だが、費用の最小値は「Workers Paid 月 $5」で、案 E でも同額。したがって **§11 の D1 は「月 $5 を許容するか」の判断が実質の分岐点**になる。

### 4-7. Phase 0 の検証結果（#640 続報・#641: G3・#642: G4）

#639 と同じ使い捨て Worker（`mbl-verify-app`、D1 は `mbl-verify-db`、架空データのみ）で追加検証した。

| 項目 | 結果 |
| --- | --- |
| **Prisma（D1 アダプタ）の Workers 上での動作** | ✅ 解決。原因は、Prisma の query compiler（wasm）が OpenNext のビルドで Worker に同梱されず、webpack が `fs` 読み込みに変換していたこと。**対処**: ①`next.config` の webpack `externals` で `*.wasm` を処理対象から外す、②ビルド後に `handler.mjs` の wasm 参照を相対パスへ置換して `query_compiler_bg.wasm` を同じ場所へコピーする、③`wrangler deploy` が `CompiledWasm` として同梱する。この後処理は**ビルドスクリプト化が必要**（Phase 2）。同梱で **gzip が約 3.1 MiB に増え**、Free の上限（3 MiB）を超える（Paid の 10 MiB 内）。 |
| **G3 Credentials ログイン** | ✅ ログイン → セッション取得 → 保護ページ表示（200）→ ログアウト → 保護ページがログインへリダイレクト、誤パスワードは `CredentialsSignin`。JWT・D1（Prisma）経由のユーザー取得と失敗カウント更新も動作 |
| **`proxy.ts`** | ✅ 動作（OpenNext は experimental 警告）。**ただし要対応**: `proxy` の `auth` が付ける Cookie（CSRF 等）が、OpenNext では**ルートハンドラの Cookie の後ろに付加**され、`/api/auth/csrf` のトークンと Cookie が食い違い `MissingCSRF` になる。**対処**: `proxy.ts` の `matcher` から `api/auth` を除外（Auth.js のルートは自前で認証するため保護の低下はない）。Phase 2 で本流に反映し、E2E で再確認する |
| **Google OAuth** | ⏳ 未検証。検証用の OAuth クライアント（Google Cloud でリダイレクト URI に `https://<worker>/api/auth/callback/google` を登録）の用意が必要で、**ユーザー作業**。環境変数は `AUTH_GOOGLE_ID`・`AUTH_GOOGLE_SECRET` |
| 環境変数 | `AUTH_SECRET`・`AUTH_TRUST_HOST`（Worker の secret）。`AUTH_SECRET` を変えると既存セッション（JWT）は全て無効になり再ログインが必要 |
| **G4 Cron** | ✅ 通過。OpenNext の `worker.js` を import する**カスタムエントリ**（`fetch` は OpenNext のものを委譲、`scheduled` を追加）で、Cron Trigger → `/api/cron/check-new-books` を Bearer 付きで内部呼び出し → 200、通知 1 件作成（楽天 API は `RAKUTEN_API_BASE` を Worker 内の架空スタブへ向けて実 API に負荷をかけず検証）。`CRON_SECRET` は Worker secret で渡し、値はログに出していない。初回（コールド）の CPU は約 450 ms |
| ローカル手動実行 | `wrangler dev --test-scheduled` 後、`curl "http://localhost:8787/__scheduled?cron=*+*+*+*+*"`（未実施。公式手順） |

**結論（G3・G4）**: 認証・Cron とも、Workers 上で実現できる見通しが立った。残る不確定は、Google OAuth の実機確認（ユーザー作業）と、Prisma wasm 同梱の後処理をビルドに組み込むことの保守性。

### 4-8. Go/No-Go 判断資料（#644）

#### ゲートの合否（2026-10-12 時点）

| ゲート | 判定 | 根拠（要約） |
| --- | --- | --- |
| G0 CPU・費用 | ⚠️ 条件付き（**Paid 必須**） | Free の 10ms は不可（§4-6）。Paid 月 $5 の含有量で個人利用は収まる |
| G1 ビルド・サイズ・PWA | ✅ | ビルド成功。gzip 約 3.1 MiB（Prisma wasm 同梱後）は Paid の上限内（Free の 3 MiB は超過）。PWA 配信 OK |
| G2 Prisma D1・トランザクション | ⚠️ 条件付き | CRUD・upsert 等は OK。`$transaction` 11 箇所の置換が必須（§5-3）。Workers 上でも動作確認（§4-7） |
| G3 認証 | ✅（Google OAuth のみ未検証） | Credentials 一式が動作。`proxy` の `matcher` から `api/auth` を除外する対処が必要 |
| G4 Cron | ✅ | カスタム Worker エントリの `scheduled` で通知作成まで確認 |

#### 判断（推奨）: **Go ── 案 A（OpenNext ＋ Prisma ＋ D1）、本番は Workers Paid 前提**

- **致命的な障害は見つからなかった**。残る課題はいずれも「実装して潰せる」性質（`$transaction` の置換、wasm 同梱の後処理、`proxy` の matcher、`skipDuplicates` の書き換え）。
- **案 E（Hyperdrive ＋ 外部 DB）は採らない**（#645 は実施しない）。理由: Workers 側の費用（Paid）は D1 案と同額で、案 E の利点は `$transaction` 不要のみ。一方で外部 DB の費用・自動停止・方言の追加が加わる。`$transaction` 11 箇所は、条件付き単一文／`batch`／冪等化で置換できる見通し（§5-3）で、その作業は MySQL 上でも先に入れられる（P1-4）。**P1-4 で想定外の置換不能が見つかった場合のみ、案 E を再検討する**。
- **vinext（#643）は後回し**（OpenNext で通ったため必須ではない）。OpenNext の experimental 要素（Node 版 proxy）が将来問題になった場合に比較する。
- **Prisma 7 への更新は不要**（Prisma 6.19 ＋ D1 アダプタで動作）。P1-1 は起票しない。

#### リスクと緩和

| リスク | 緩和 |
| --- | --- |
| `$transaction` 置換の漏れによる無警告の不整合（D1 は配列形式を非原子的に実行） | 置換が済むまで D1 アダプタを本流に混ぜない。D1 ビルドでは `$transaction` を例外化するラッパーまたは lint で検出。両 DB の結合テスト（P2-3） |
| Prisma D1 アダプタが Preview | 利用箇所を Repository に閉じ込める（責務分離ルール）。不具合時は Repository 単位で D1 バインディング直呼びに切替可能 |
| OpenNext の Node 版 proxy が experimental | E2E を Workers プレビューで実行（P3-3）。問題時は `middleware.ts`（Edge）化か vinext |
| wasm 同梱の後処理がビルド依存で壊れやすい | ビルドスクリプト化し、CI で「Worker 起動＋ DB 読み取り」のスモークテストを必須にする |
| Windows でのビルドが非公式 | ビルド・デプロイは CI（Linux）で行う |
| bcrypt の CPU（約 0.3〜0.8 秒/回） | Paid の含有量内。体感が悪い場合のみ WebCrypto 移行（任意の最適化） |
| Free アカウントのまま運用すると上限に当たる | 本番切替前に Paid へ変更（P3-1 の前提） |

#### ユーザーの決定が必要な事項（§11）

- **D1（費用）**: Workers Paid 月 $5（約 750 円）を許容するか。**許容しない場合は No-Go 側**（案 D: Cloudflare 以外、または AWS 継続）になる。
- **D3（保全期間）**・**D4（URL・独自ドメイン）**: 未決定のまま Phase 1 は開始できる（Phase 4 までに決める）。
- **Google OAuth の実機確認**: 検証用 OAuth クライアントを用意するか、Phase 2（P2-4）の確認に回すか。
- **D5（Phase 0 の進め方）**: 解決済み（P0-1〜P0-4 を実施）。

#### Go の場合の次の一手

Phase 1 の Issue を起票する（P1-2 email 正規化、P1-3 生 SQL の DB 非依存化、P1-4 トランザクション置換、P1-5 logger、P1-6 画像最適化の依存除去）。いずれも **MySQL のまま本番に影響せず先にマージできる**。P1-4 を最初に着手して、置換可否を早期に確定する。Phase 0 の使い捨て Worker／D1（`mbl-verify-*`）は、Go/No-Go 確定後に削除する。

---

## 5. コード・スキーマの変換（MySQL → D1/SQLite）

### 5-1. 型対応表

| Prisma / MySQL | D1（SQLite） | 注意 |
| --- | --- | --- |
| `Int @id @default(autoincrement())` | `INTEGER PRIMARY KEY AUTOINCREMENT` | ID は**移行元の値を保持**する。移行後に `sqlite_sequence` を最大値へ更新 |
| `String`（VARCHAR(191)） | `TEXT` | 長さ制限なし。UTF-8（絵文字・日本語）をそのまま保存 |
| `String @db.Text` | `TEXT` | **`@db.Text` / `@db.Date` はスキーマから削除**（`sqlite` プロバイダでは未対応） |
| `DateTime`（DATETIME(3)） | Prisma の SQLite 表現（⚠️ 整数 ms／ISO 文字列のいずれか） | **表現はアプリ層（Prisma）で書き込んで揃える**（§7-1）。タイムゾーンは UTC |
| `DateTime @db.Date`（`Book.publishedAt`） | 通常の `DateTime` | 日付のみの意味は UTC 0 時で保持（`parseSalesDateToUtcDate` と整合）。取り扱いを検証 |
| `Boolean` | `INTEGER`（0/1）。Prisma が変換 | |
| `Json`（`AuditLog.detail`、`BookEnrichmentItem.resultDetail`） | `TEXT`（JSON 文字列） | ⚠️ Prisma の SQLite Json 対応を G2 で確認 |
| 外部キー `onDelete: Cascade` / `SetNull` | 同じ（`PRAGMA foreign_keys` は D1 が有効） | 投入順序（親→子）を守る |
| `@@unique` / `@@index` | 同じ | NULL 同士は SQLite でも別値扱い（MySQL と同じ。`Notification` の `(userId, type, bookIsbn)` の挙動は維持） |
| 照合順序 | MySQL: 大文字小文字を区別しない（既定の `_ci`） | **SQLite は区別する**。§5-2 参照 |

### 5-2. 挙動差（テーブル定義以外）

| 項目 | MySQL | SQLite / D1 | 対応 |
| --- | --- | --- | --- |
| `email` の一意性 | 大文字小文字を区別しない | 区別する | 移行前に重複・表記ゆれを検査し、**保存時に小文字へ正規化**（ログイン検索も同様）。既存データの変換は ETL で実施 |
| 文字列検索（`contains` 等） | `_ci` で大文字小文字を無視 | `LIKE` は ASCII のみ無視 | 検索 API の結果差を E2E で確認 |
| 日本語の照合（かな・全半角） | `_ai_ci` の挙動 | バイナリ比較 | `Author.name` 等の等価比較・重複判定を、リハーサルで MySQL と突き合わせて検証 |
| 整数除算 | `/` は小数を返す | `/` は整数除算 | `recommendations.ts` の `co_cnt / (ac_a.cnt + ...)` は `CAST(... AS REAL)` が必要（スコアが 0 になる） |
| `COUNT` の型 | bigint 等で返る | 整数 | 既存の `Number()` 変換は維持できる |

**対応済み（#651）**: `normalizeEmail`（`src/lib/email.ts`）で、登録・ログイン・パスワード再設定・残り試行回数・Google ログイン（アダプタ含む）・シードの全入口を小文字に統一した。既存データはマイグレーション `20261012000000_lowercase_user_emails` で小文字化する（MySQL では大文字小文字違いの重複は一意制約で防がれているため、更新は衝突しない）。事前検査用に読み取り専用の `npm run audit:email-normalization`（件数のみ出力。前後の空白だけが違う重複も検出する）を追加した。D1 への ETL（P4-1）でも同じ正規化を適用すること。

### 5-3. `$transaction` の棚卸し（11 箇所）— 置換方針は G2 で確定

| # | ファイル | 内容 | 想定する置換方針（要確認） |
| --- | --- | --- | --- |
| 1 | `api/user/delete/route.ts` | 本人退会: 関連データ 9 テーブルの削除＋ユーザー削除（配列形式） | 外部キーの `Cascade`／`SetNull` を整理して**ユーザー行の削除 1 文に寄せる**か、D1 の `batch` で原子的に実行 |
| 2 | `api/follows/route.ts` | フォロー解除＋相互通知の削除 | 2 文の `batch`（読み取りが無いため原子化しやすい） |
| 3 | `lib/bookIsbn.ts`（`setPrimaryIsbn`） | 主 ISBN の付け替え（検証→2 更新） | 単一 `UPDATE ... SET is_primary = (isbn = ?)` で原子化 |
| 4 | `api/admin/users/[id]/route.ts`（降格） | `SELECT COUNT(*) ... FOR UPDATE` で最後の管理者降格を防止 | **単一 `UPDATE ... WHERE id=? AND (SELECT COUNT(*) FROM users WHERE role='admin') > 1`** のような条件付き更新で原子化（`FOR UPDATE` は使えない） |
| 5 | 同上（昇格） | 管理者数の上限チェック | 同様に条件付き更新 |
| 6 | `api/admin/users/[id]/reset-password/route.ts` | 一時パスワードの更新＋通知作成（片方だけ失敗するとロックアウトするため原子的に実行している。配列形式） | `batch`（読み取りを挟まない 2 文） |
| 7 | `api/admin/award-entries/[id]/route.ts` | 著者の findOrCreate ＋ 本・受賞の更新 | 管理者操作で競合頻度が低い。失敗時の再実行で許容、または `batch` |
| 8 | `api/admin/manual-books/merge/route.ts` | 本の統合（ループで読み書き） | 管理者操作・低頻度。ステップを冪等化して再実行可能にする |
| 9 | `api/admin/audit-logs/route.ts` | 一覧＋件数（配列形式） | 読み取りのみ。トランザクション不要（そのまま 2 クエリ） |
| 10 | `api/admin/reviews/[id]/route.ts` | 通知の upsert ＋ 感想削除 | `batch`（読み取り不要の 2 文） |
| 11 | `api/admin/users/[id]/route.ts`（ユーザー削除） | 管理者によるユーザー削除。関連データの削除後、`role: "user"` 条件付きでユーザーを削除し、0 件なら失敗（削除直前に昇格された管理者を消さないため） | #1 と同様に**カスケード整理 ＋ 条件付き削除 1 文**（`DELETE ... WHERE id=? AND role='user'`）に寄せる。ほかに暗黙の複数文更新（`upsert` 内部等）がないかは Phase 0 で網羅確認 |

**実装メモ（#647・#648）**: 読み取りを挟まない複数書き込みは `src/lib/atomically.ts` を唯一の入口とする（D1 対応時に `batch` へ差し替え）。管理者の昇降格（#4・#5）は条件付き単一 UPDATE（`src/repositories/userRoleRepository.ts`）にした。MySQL の実 DB で同時実行を検証した結果、**副問い合わせが同表を読むため MySQL ではデッドロックとして片方が中断される**（更新はされないので 0 人化・上限超過は起きない）。そのためデッドロック時に再試行する。D1（SQLite）は書き込みが直列化されるため再試行は不要。#11（管理者によるユーザー削除）は #1 と同じ外部キー整理が要るため A3（#649）へ移した。

**実装メモ（#649）**: ユーザー削除（#1・#11）は、外部キーを変更せず、`src/repositories/userDeletionRepository.ts` で「対象が今も一般ユーザーである」条件付きの削除を `atomically` で一括実行する形にした（昇格の競合時は何も削除されない）。手動登録本の統合（#8）は、重複行を事前に特定してから削除・付け替え・統合元削除を `atomically` で一括実行。受賞登録の更新（#7）は、衝突検査を伴う ISBN の置き換えを先に行い、著者の解決、本と受賞登録の更新（`atomically`）の順に分けた。ISBN の置き換え（`replaceIsbns`）自体は複数の書き込みを含むが、再実行で同じ結果に収束する冪等な処理として、トランザクションを要求しない。以上で §5-3 の 11 箇所のうち、コールバック形式の `$transaction` は残っていない。

原則: **(1) 読み取りを挟まない複数文は `batch`（D1 のネイティブ機能）、(2) 読み取り→判定→更新は条件付き単一文に畳む、(3) 管理者操作で競合頻度が低いものは冪等化して許容**。Prisma D1 アダプタで `batch` が使えない場合は、該当箇所だけ D1 バインディングの SQL を直接使う Repository を設ける。

**検証結果（#640 第 1 報、ローカル D1 ＋ Prisma 6.19.3 ＋ `@prisma/adapter-d1` 6.19.3）**:

- ✅ CRUD・`upsert`・一意制約違反（`P2002`）・日本語/絵文字・Json 列・`DateTime`（保存形式は ISO 8601 の TEXT）は動作。**Prisma 7 への更新は基本機能には不要**。
- ❌ **`$transaction` のコールバック形式は例外**（`D1 does not support interactive transactions`）。
- ❌ **`$transaction` の配列形式は、エラーにならず非原子的に実行される**（2 文目が失敗しても 1 文目が残る。警告ログのみ）。**無警告でデータ不整合になる**ため、置換が済むまで本流に混ぜない。
- ✅ D1 ネイティブの `batch` は**原子的**。ただし Prisma アダプタからは呼べない。✅ 条件付き単一 `UPDATE`（`WHERE ... AND (SELECT COUNT(*) ...) > 1`）で最後の管理者の降格防止を原子化できた。
- ⚠️ 整数除算（`3/5` が `0`）、`GROUP_CONCAT ... SEPARATOR` の構文エラー、`email` の完全一致が大文字小文字を区別する点は、§5-2・§5-4 のとおり。
- ✅（第 2 報）`createMany`（500 行）・`IN`（150 件）は Prisma が自動分割して成功。**生 SQL・D1 バインディング直接は 100 個超で失敗**するため、`IN (...)` は 100 個以内に分割する。明示 ID の挿入後も自動採番は最大 ID + 1 から続く。
- ✅（第 2 報）マイグレーションは `prisma migrate diff --from-schema-datamodel 旧 --to-schema-datamodel 新 --script` → `wrangler d1 migrations apply` で運用でき、**Prisma 6.19.3 のまま可能**。
- ✅（第 2 報）MySQL 用と D1 用の Prisma クライアントは同じコードベースで 2 つ生成できるが、**型は相互に代入できない**（`$transaction`・`createManyAndReturn` の差）。共通の型は `prisma.ts` の 1 か所で明示的にキャストして揃え、モデル定義の同一性はドリフト検査で担保する。
- 結論: G2 は**条件付きで合格**（`$transaction` 11 箇所の置換が必須。D1 バインディングを直接使う Repository が必要）。併存の保守コストと案 E（`$transaction` がそのまま使える）を #644 で比較して決める。詳細は #640 のコメント。
- 補足: 本スキーマは 12 の関係が `ON DELETE RESTRICT`（MySQL でも同じ）。ユーザー削除で関連行を手動削除しているのはこのため。「カスケード整理」（#1・#11）は、**MySQL 側のスキーマ変更（マイグレーション）を伴う**。

### 5-4. `$queryRaw`（MySQL 方言）の書き換え

| ファイル | 問題点 | 対応 |
| --- | --- | --- |
| `lib/recommendations.ts`（おすすめ著者） | CTE・`COUNT(DISTINCT)` は SQLite 可。**整数除算**でスコアが壊れる | `CAST(... AS REAL)` |
| `lib/userRecommendations.ts`（おすすめユーザー） | `GROUP_CONCAT(DISTINCT a.name ORDER BY a.name SEPARATOR '|')` は SQLite で不可（`SEPARATOR` 構文、DISTINCT と区切り文字の併用不可） | サブクエリで DISTINCT 化してから `GROUP_CONCAT(name, '\|')`、または取得後にアプリ側で結合 |
| `api/admin/users/[id]/route.ts`（2 箇所） | `FOR UPDATE` | §5-3 の #4・#5 |

**対応済み（#650）**: おすすめ著者は `co_cnt * 1.0 / (...)` で小数の除算にした（`CAST(... AS REAL)` は MySQL では書式が異なるため、両 DB で通る `* 1.0` を採用）。おすすめユーザーは `GROUP_CONCAT` を SQL から外し、共通著者名は別クエリ（Prisma の `findMany`）で取得して TypeScript 側で組み立てる形にした。`FOR UPDATE` の 2 箇所は #648 で解消済み。MySQL の実 DB に対する結合テストを追加し、SQLite は同じ SQL（アプリのソースから抽出）を `node:sqlite` で実行して同じ結果になることを確認した（SQLite 側の自動化は P2-3）。

テストは、**Prisma の MySQL 側と D1 側の両方で同じ入力・同じ結果になること**を結合テストで担保する（§8）。

---

## 6. Cloudflare 側の構成（設計）

| 要素 | 内容 |
| --- | --- |
| Worker | OpenNext が生成する Worker（`wrangler.jsonc`）。Static Assets バインディングで `_next/static`・`public/`（PWA の SW・manifest・アイコン）を配信 |
| D1 | データベース `mybooklibrary-db`（本番）と、リハーサル用・ステージング用を別 DB で用意。Prisma アダプタは `DB` バインディングを使用 |
| 環境変数 | `AUTH_SECRET`、`AUTH_URL`（または `trustHost`）、`GOOGLE_CLIENT_ID/SECRET`、`RAKUTEN_*`、`CALIL_*`、`CRON_SECRET` 等。**実値は Worker secrets と `.dev.vars`（gitignore）のみ**（#607）。`wrangler.jsonc` には変数名とバインディングだけを書く |
| Cron | Cron Trigger `0 0 * * *`（UTC 00:00 = JST 09:00）。`scheduled` ハンドラから `/api/cron/check-new-books` を内部呼び出し（Bearer 付き）。実装はカスタム Worker エントリ（G4） |
| ドメイン | 初期は `*.workers.dev`。独自ドメインは任意（取得費用が別途かかる）。**URL が変わるため Google OAuth のリダイレクト URI を追加**し、利用者は**再ログインが必要**（JWT Cookie のオリジンが変わる） |
| 画像 | `sharp` を外し、`images.unoptimized: true`（外部の書影 URL をそのまま表示）を基本とする。最適化が必要なら Cloudflare Images を別途検討（費用が発生しうる） |
| ログ | `pino` を `console` 出力の薄いラッパーに置換し、Workers Logs / `wrangler tail` で確認。redact（パスワード等）は維持 |
| 監視 | Workers のメトリクス（エラー率・CPU 時間）、D1 の使用量（読み書き行数）を週次で確認し、無料枠に対する余裕を記録 |

---

## 7. データ移行（ETL）計画

### 7-1. 方式

- **アプリ層（Prisma）で「MySQL から読み → D1 へ書く」ETL**とする。理由: (1) 日時・Boolean・Json の SQLite 上の表現を、Prisma 自身に書かせることで推測せずに揃えられる。(2) 規模が小さく（ポートフォリオ規模）、バッチ投入でも十分高速。(3) 既存の `prisma/scripts/migration/`（dump 取得・restore・`verify-migration`、`src/lib/migration/verify.ts`）の**照合ロジックを再利用**できる。
- MySQL の dump を直接 SQLite へ変換する方式（`mysqldump` → 変換 → `wrangler d1 execute`）は、型・エスケープ・日時の変換を自前で持つことになり、誤りが混入しやすいため採用しない。
- ID は**移行元の値をそのまま指定して作成**（`createMany` ＋ `id` 明示）。投入後に各テーブルの `sqlite_sequence` を最大 ID に合わせる。
- 投入順序は外部キーの親→子: `users` → `authors` → `books` → `book_isbns` → `awards` → `award_entries` → `accounts` / `sessions` / `verification_tokens` → `user_libraries` → `favorite_authors` → `follows` → `reading_statuses` → `reviews` → `likes` / `reports` → `notifications` → `contact_inquiries` → `audit_logs` → `book_enrichment_jobs` / `items`。バッチ分割は 1 文 100 KB・バインドパラメータ 100 個の制限に収まるよう調整する。

### 7-2. 保持を保証する項目

| 項目 | 方法 |
| --- | --- |
| 主キー・関連（外部キー） | ID をそのまま保持。投入後に孤児行（参照先なし）が 0 件であることを確認 |
| bcrypt ハッシュ | 文字列をそのままコピー（`$2a$`/`$2b$` と cost を変更しない）。投入後に先頭プレフィックスと長さを全件確認 |
| OAuth アカウント | `accounts` の `provider` / `providerAccountId` / トークン列（`TEXT`）を全件保持。ユーザーとの紐づけを確認 |
| 日本語・絵文字 | UTF-8 のまま。**正規化形（NFC/NFD）を変更しない**。列ごとのハッシュ比較で検出 |
| 日時 | UTC を保持。ミリ秒単位の一致を確認（`DATETIME(3)`） |
| `email` | 大文字小文字の重複検査（§5-2）。重複があれば移行前に人手で解消。**ETL で小文字化する**ため、照合（§7-3 の 4）は「小文字化した移行元」との比較にする |

### 7-3. 照合（リハーサル・本番とも同じ手順）

1. **件数**: 全 21 テーブルの行数が一致
2. **照合キーの集合**: 各テーブルの照合キーの集合が一致（欠落・余剰なし）。照合キーはテーブルごとに定義し、通常は主キー（`id`）、`id` を持たない `verification_tokens` は一意キー `(identifier, token)` を使う。ETL・検証ツールで同じ定義を共有し、行の突き合わせと下記 4 のハッシュ順序にも同じキーを使う
3. **外部キー**: 参照先なしの行が 0 件（`PRAGMA foreign_key_check`）
4. **列ごとのハッシュ**: テーブル×列で「照合キー順に連結した値の SHA-256」を MySQL・D1 の双方で計算して比較（日本語・ハッシュ・日時を含む）。**ETL が意図して変換する列は、検証側に「期待される変換」を定義し、変換後の移行元の値と比較する**（例: `users.email` は移行元を小文字化した値と D1 の値を比較。**変換対象外の列は完全一致**を要求する）。変換の種類と対象列は ETL・検証ツールの双方から参照できる 1 か所に定義し、想定外の差分は不合格とする
5. **代表データ**: 管理者・一般ユーザー・OAuth ユーザー・手動登録本・複数 ISBN の本・レビュー付き・相互フォロー等を抽出して目視と API で確認
6. **機能照合は、実データを入れた DB に対して自動テスト（E2E）を実行しない**。役割を分ける:
   - **リハーサル／ステージング**: スキーマと機能の確認は、**架空データだけの専用 D1**（`testuser_*` / `e2euser_*`、`@example.com`、`[E2E_TEST]` タグ。削除スクリプト付き）に対して E2E を実行する（§8）。実データを入れたリハーサル用 D1 は、**読み取り専用の照合（1〜5）**と、人手によるログイン確認（所有者本人のアカウントのみ）に限る。
   - **本番 D1**: 照合（1〜5）は読み取り専用。公開前の動作確認は所有者本人が自分のアカウントで行い、E2E など書き込みを伴う自動テストは接続しない（グローバルルール「本番 DB に接続しうる設定でテストを実行しない」）。

### 7-4. リハーサル（本番データを壊さない）

- **移行元は、取得済みの暗号化ダンプ（`dump_20261011T145445Z.sql.enc`）を復号し、ローカルの MySQL（Docker）へ復元したもの**を使う。AWS（RDS）への接続や再起動は不要で、本番相当のデータに対して**読み取り専用**で扱える。復号した平文のダンプ・復元先の DB は、作業後に削除する。
- 書込み先は**リハーサル専用の D1（本番とは別 DB）**。本番 D1 には最終投入まで触れない。
- 既存の `prisma/scripts/migration/migrationGuard.ts`（接続先の誤り検出）の考え方を D1 側にも適用し、「リハーサル DB でないものへの投入」を拒否するガードを設ける。
- テストデータは識別子付き（`testuser_%` / `[E2E_TEST]`）で、削除スクリプトをセットで用意する（グローバルルール）。
- **本番相当のデータを使う場合は、メールアドレス・氏名等を匿名化**してから共有・保管しない（個人情報の持ち込み禁止の原則）。リハーサルは読み取りと照合のみで、データのコピーを手元・リポジトリに残さない。

---

## 8. テスト戦略

| 層 | 方針 |
| --- | --- |
| 単体（`__mocks__/prisma`） | 変更なし。Repository 層の分離（#613）により、DB 方言の差は Repository／生 SQL に閉じ込める |
| 結合 | 現行は Docker の MySQL（3307）。**移行後も MySQL を維持**（§4-4）し、並行して D1 ローカル（`wrangler`/Miniflare の SQLite）向けの結合テストを追加。**同じテストを CI で両 DB に対して常時実行**して挙動差（§5-2・§5-4）を検出する |
| E2E（Playwright） | 現行は `next dev` ＋ スタブ（楽天・NDL・カーリル）。D1 構成では `opennextjs-cloudflare preview`（ローカルの Workers ランタイム）に対して実行できるか G1 で確認 |
| 移行ツール | `src/lib/migration/` の照合ロジックを D1 に対応させ、単体テストを追加（ダミーデータで件数・ハッシュ・孤児行を検出できること） |
| 性能・費用 | G0 の実測値（CPU ms・D1 読み書き行数）を記録し、無料枠・Paid 内に収まる試算を残す |

---

## 9. 切替・ロールバック・AWS の扱い

### 9-1. 前提の変化

- **AWS は現在停止中で、利用者への提供は止まっている**。したがって「書込み凍結 → 最終同期 → 切替」という通常の無停止移行ではなく、**「停止中の旧 DB から D1 へ移し、検証後に公開する」**形になる（書込み凍結は不要）。
- #609 の「切替失敗時に AWS 環境へ戻せる」前提は成り立たない（戻す先が停止中）。代わりに **「旧データの保全」と「Cloudflare 側の巻き戻し」**でロールバックを定義する。
- **RDS インスタンスは既に削除済み**のため、停止中 RDS の自動再起動や稼働費用の心配はない。残る AWS 費用は、手動スナップショットの保管料（20GB で月 $2 弱）のみ。
- **ダンプは取得・保全済み**（2026-10-11）。スナップショット（10/8）から一時 RDS へ復元して取得し、一時リソースは削除済み。暗号化（AES-256、パスフレーズはパスワードマネージャーで管理）して、この PC（gitignore 対象）と USB の 2 か所に保管。復号検証（元ダンプと SHA-256 一致）済み。

### 9-2. 手順

1. **旧データの保全**: RDS の手動スナップショットと、論理バックアップ（dump）を取得し、**暗号化して保管**（リポジトリには入れない）。保持期間を決める（移行後 N 日）。
2. **リハーサル**（§7-4）を最低 2 回。2 回目が照合を全項目クリアするまで繰り返す。
3. **本番 D1 の準備**: 空の D1 にスキーマ（マイグレーション）を適用し、Worker secrets・バインディング・Cron を設定。
4. **最終投入**: 旧 DB（スナップショットから）→ 本番 D1 へ ETL。§7-3 の照合をすべて通す。
5. **公開前確認**: 機能・Cron の手動実行・PWA の確認は、**架空データのステージング環境**で行う（§7-3 の 6）。本番 D1 では、所有者本人が自分のアカウントでログインして主要機能を手動確認する（自動テストは接続しない）。Google OAuth のリダイレクト URI を追加。
6. **公開**: README のライブデモ記載（#626）を更新。監視（エラー率・CPU 時間・D1 使用量）を最初の 1 週間は毎日確認。
7. **旧 AWS の整理**: 保全期間の満了後、**RDS 手動スナップショットを削除**する（インスタンス等は削除済み）。**Terraform コード・AWS デプロイ文書は削除せず残す**（再構築の記録。文書には「現在は未稼働」と注記する）。

### 9-3. ロールバック

| 状況 | 対応 |
| --- | --- |
| 公開後に Worker の不具合 | `wrangler rollback`（直前の Worker バージョンへ戻す）。DB スキーマ変更を伴う場合は事前に後方互換にする |
| D1 のデータ破損・誤更新 | **D1 Time Travel**（⚠️ 保持期間は Free/Paid で異なる。G0 で確認）で時点復元 |
| 移行データの致命的な不整合（**公開前**に判明） | 保全した RDS スナップショット／dump から、リハーサル用 D1 または初期化した本番 D1 へ再度 ETL し、§7-3 の照合をやり直す（AWS 本体は再開しない） |
| 移行データの不整合（**公開後**に判明） | **再 ETL による全置換はしない**（公開後に D1 へ登録されたユーザー・レビュー・読書進捗が失われる／ID が衝突する）。① 書込みを停止（メンテナンス表示）→ ② D1 をエクスポートして現状を保全 → ③ 原則は**前進修正**: 不整合の範囲を特定し、**該当行だけを修正する SQL（または補正 ETL）**を作成して適用する。時点復元（D1 Time Travel）が必要な場合は、②のエクスポートと復元後の DB を**照合キーで行単位に比較**し、**追加・更新・削除の 3 種類すべて**の差分を抽出して再適用する（新しい ID の行だけでは、パスワード変更・レビュー編集・読書進捗の更新・削除が失われる）。**再適用するのは、人手で承認した正当な変更だけ**とし、不整合の原因となった変更（誤更新・誤削除）は差分から除外する → ④ 復旧後の確認は、**移行元との全件照合（公開後の正当な変更で差が出る）ではなく**、「②で保全した状態＋承認した補正」を基準にした照合（件数・照合キー・列ハッシュ）に切り替え、移行元との比較は**公開後に変更されていないデータに限定**する。確認後に書込みを再開する。この復旧手順（前進修正と、行単位の差分再適用）は P4-3 のリハーサルで実際に試す |

| Cloudflare 構成を取りやめ、RDS（AWS）で再開する | §4-4 の併存方針により可能。① D1 をエクスポートして保全 → ② **逆 ETL（D1 → MySQL）**で最新データを MySQL へ復元（初期状態は保全した暗号化ダンプを使用）→ ③ Terraform で AWS 環境（EC2/RDS/CloudFront/Lambda）を再構築 → ④ MySQL 構成のアプリをデプロイ。**逆 ETL と再開手順書（P4-8・P4-9）が完成するまでは、この経路は未検証**（それまでの戻し先は、保全した暗号化ダンプからの再構築） |

**ロールバック条件（公開判断）**: 照合の不合格、ログイン不可、エラー率の恒常的な上昇、Free/Paid の上限接近のいずれか。

### 9-4. 利用者への影響

- **再ログインが必要**（URL＝Cookie のオリジンが変わるため）。パスワード・Google 連携は保持される。
- 公開 URL の変更の周知（README・ポートフォリオ掲載先）。
- 移行期間中はサービス停止中（現状と同じ）。

---

## 10. フェーズ分割と後続 Issue（単独レビュー可能な単位）

> 各 Issue は Issue 駆動（Issue → ブランチ → PR）で進める。バックエンドとフロントエンドを分けられるものは分ける。

### Phase 0: 検証（スパイク。成果物は調査結果の文書、コードは原則捨てる）

| # | 後続 Issue（案） | 内容 | 受け入れ基準 |
| --- | --- | --- | --- |
| P0-1（#639） | Workers 最小構成の実測（G0・G1） | OpenNext で本アプリ（または最小ページ＋bcrypt）をデプロイし、CPU 時間・サイズ・PWA 配信を Free/Paid で実測 | 実測表と、Free で可否・Paid 前提かの判定が文書化 |
| P0-2（#640） | Prisma D1 アダプタの検証（G2） | CRUD・upsert・createMany・Json・日時、`batch` の可否、§5-3 の置換方針の確定 | 11 箇所の置換方針表。Prisma 7 更新の要否を確定 |
| P0-3（#641） | 認証と proxy の検証（G3） | Credentials・Google OAuth・JWT・保護ルートを Workers で確認 | 動作可否と必要な変更が文書化 |
| P0-4（#642） | Cron の検証（G4） | Cron Trigger → API 内部呼び出し | スケジュール実行で通知作成 |
| P0-5（#643） | vinext の比較検証（任意） | 同じ最小構成を vinext で試し、OpenNext との比較を記録 | 比較表と最終選定 |
| P0-6（#645） | Hyperdrive ＋ PostgreSQL／MySQL の最小検証（案 E。G2 不合格時のみ） | 本物のトランザクション、MySQL の Prisma 構成、サブリクエスト数、DB ホスティングの料金・自動停止 | 案 E の採否判断の材料と費用比較表 |

→ **Phase 0 の結果で、本計画の採用案（A/B/C）と Free/Paid を確定し、本書を更新**する（Go/No-Go。#644）。

### Phase 1: MySQL のまま準備（本番に影響しない／D1 非依存で価値がある変更）

| # | 後続 Issue（案） | 内容 |
| --- | --- | --- |
| P1-1 | Prisma 7 へ更新（MySQL のまま） | 必要と判明した場合のみ。ジェネレータ・設定の更新と全テストの回帰確認 |
| P1-2 | `email` の小文字正規化 | 保存・検索の正規化と既存データの重複検査スクリプト |
| P1-3 | 生 SQL の DB 非依存化 | `recommendations` / `userRecommendations` の方言依存（整数除算・`GROUP_CONCAT`）を解消。MySQL・SQLite 双方で同結果の結合テスト |
| P1-4 | トランザクションの置換（§5-3） | 方針に従い、条件付き単一文／`batch` 可能な形へ（MySQL でも動作する形で先に入れる） |
| P1-5 | logger の抽象化（**#652 で対応済み**） | `Logger` 型（`src/lib/logging/types.ts`）にアプリを依存させ、pino 実装と `console` 実装（`LOG_DRIVER=console`、伏せ字・Error 整形つき）を差し替え可能にした。Workers 向けビルドで pino をバンドルから除く切替（ビルド時の alias 等）は Phase 3 で行う |
| P1-6 | 画像表示の最適化依存を外す（**#653 で対応済み**） | `next.config.ts` の `images.unoptimized: true` にし、`sharp` を依存から削除した。書影は外部 URL をそのまま表示する。E2E（77 件）で回帰なしを確認 |

### Phase 2: D1 対応（バックエンド）

| # | 後続 Issue（案） | 内容 |
| --- | --- | --- |
| P2-1 | D1 用スキーマ・マイグレーション（**MySQL と併存**） | MySQL 版を正として `prisma/mysql/` と `prisma/d1/` に分け、D1 版（`@db.*` 除去）を**生成スクリプト**で作る。`wrangler d1 migrations` を追加。**ドリフト検査**（生成結果とコミット済みの差分なし）を CI に追加。差分表を維持 |
| P2-2 | Prisma クライアントの DB 切替 | 生成クライアントを 2 つ出力し、`src/lib/prisma.ts` が `DB_PROVIDER`（`mysql`／`d1`）で選ぶ。D1 はバインディング経由（リクエストごとの生成） |
| P2-3 | 結合テストの両 DB 対応 | 同じ結合テストを **CI で MySQL と D1 の両方に対して実行**する基盤（matrix） |
| P2-4 | NextAuth の D1 対応 | Adapter・Credentials・proxy/middleware の調整（G3 の結果に従う） |
| P2-5 | Cron の Worker 対応 | `scheduled` ハンドラ実装と Cron Trigger 設定 |

### Phase 3: デプロイ基盤

| # | 後続 Issue（案） | 内容 |
| --- | --- | --- |
| P3-1 | OpenNext／Wrangler 導入 | `wrangler.jsonc`、ビルド・プレビュー・デプロイのスクリプト、CI からのデプロイ（トークンは secrets） |
| P3-2 | Worker secrets とステージング環境 | #607 の方針に沿った秘密情報の設定手順、ステージング Worker／D1 |
| P3-3 | E2E を Workers プレビューで実行 | Playwright を `opennextjs-cloudflare preview` に対して実行 |

### Phase 4: データ移行・切替

| # | 後続 Issue（案） | 内容 |
| --- | --- | --- |
| P4-1 | ETL ツールの実装 | §7-1 の MySQL→D1 ETL（ID 保持・バッチ・ガード） |
| P4-2 | 照合ツールの D1 対応 | §7-3 の 1〜4（件数・主キー・外部キー・列ハッシュ） |
| P4-3 | リハーサル（2 回以上） | §7-4。結果を文書化 |
| P4-4 | 旧データの保全（**大部分は完了**） | 暗号化ダンプの 2 か所保管は完了（2026-10-11）。残り: 3 か所目（別の場所）の保管、復元テスト、平文ダンプの削除、保持期間（D3）の決定 |
| P4-5 | 本番切替 | §9-2 の手順実行。README 更新（#626 の続き） |
| P4-6 | 旧 AWS の整理 | 保全期間満了後に RDS 手動スナップショットを削除。**Terraform コード・AWS 文書は残す**（「未稼働」の注記を追加）。**#497 をクローズ**（AWS 更新は不要になるため） |
| P4-7 | ドキュメント更新 | CLAUDE.md の技術スタック表（**主系: Cloudflare Workers + D1／予備: AWS + MySQL**）、`docs/requirements.md`、`docs/features/cron.md`、デプロイ手順書の更新（AWS 側は「未稼働・再開可能」と注記） |
| P4-8 | 逆 ETL（D1 → MySQL）と定期エクスポート | RDS 復帰用。D1 の状態を MySQL へ復元するツール（ID・日時・ハッシュ・日本語を保持）と、照合・リハーサル。D1 の定期エクスポート（バックアップ）手順 |
| P4-9 | AWS 再開手順書と常時ビルド確認 | Terraform による再構築と MySQL 構成のデプロイの runbook。MySQL／standalone 構成のビルド・起動確認を CI で常時実行し、再開リハーサルの手順を定める |

### 依存関係

```
P0-1〜P0-5 ──(Go/No-Go)──▶ Phase 1 ─▶ Phase 2 ─▶ Phase 3 ─▶ P4-1/2 ─▶ P4-3 ─▶ P4-4 ─▶ P4-5 ─▶ P4-6/7/8/9
                              │ （P1-x は D1 非依存。MySQL 上で先にマージ可能）
#608（管理者デモ削除）: 完了済み（本番データ移行前の前提を満たす）
#607（秘密情報）      : P3-2 の前提
```

---

## 11. 未解決事項・ユーザーの決定が必要な事項

| # | 事項 | 内容 |
| --- | --- | --- |
| D1 | **費用の許容** | Workers Free で動かない（CPU 10ms 超過）場合、**Workers Paid の月 $5（約 750 円）**を許容するか。G0 の実測後に最終判断。許容できない場合は案 D（Cloudflare 以外）の再検討 |
| D7 | **DB の選び方（D1 が不合格の場合）** | 案 E を採る場合の DB（Neon Free の PostgreSQL／マネージド MySQL）と、費用・自動停止の起動待ちを許容するか。#645 の結果を見て判断 |
| D6 | ~~MySQL（RDS）を残すか~~ | **決定済み（2026-10-12）**: MySQL 用と D1 用の両方のスキーマ・マイグレーションを維持し、RDS で再開できる状態を保つ（§4-4）。保守負荷が過大になった場合のみ再検討 |
| D2 | ~~停止中の AWS（RDS）の扱い~~ | **解決済み（2026-10-11）**: RDS は削除済み。ダンプを取得・暗号化し、PC と USB に保管。手動スナップショットは当面保持（月 $2 弱） |
| D3 | **旧データの保全期間** | 移行後、スナップショット／暗号化ダンプを何日保持するか（保持中は少額の保管費用）。暗号化ダンプの 3 か所目（別の場所）をどこにするか |
| D4 | **公開 URL・独自ドメイン** | 当面 `*.workers.dev` でよいか。独自ドメイン（別途費用）を使うか |
| D5 | ~~**Phase 0 の進め方**~~ **解決済み（2026-10-12）** | 次に P0-1〜P0-4 の Issue を作成して検証を始めてよいか（アカウント作成・Wrangler のログインはユーザー操作が必要） |

---

## 12. 参考リンク

- Cloudflare: [Workers の制限](https://developers.cloudflare.com/workers/platform/limits/)、[Workers の料金](https://developers.cloudflare.com/workers/platform/pricing/)、[D1 の制限](https://developers.cloudflare.com/d1/platform/limits/)、[Next.js ガイド](https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/)
- [OpenNext for Cloudflare](https://opennext.js.org/cloudflare)、[vinext](https://github.com/cloudflare/vinext)
- [Prisma ORM と Cloudflare D1](https://www.prisma.io/docs/orm/overview/databases/cloudflare-d1)
- 本リポジトリ: `app/prisma/schema.prisma`、`app/src/lib/prisma.ts`、`app/src/auth.ts`、`docs/aws-deploy-plan.md`、`docs/data-migration-spec-481.md`、`app/prisma/scripts/migration/`
