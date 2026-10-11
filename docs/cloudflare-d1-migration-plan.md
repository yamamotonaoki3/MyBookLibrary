# Cloudflare Workers + D1 移行計画（Issue #609）

AWS（EC2 / RDS / CloudFront）の費用が発生するようになったため、MyBookLibrary を Cloudflare Workers と D1 へ移行する計画。実装は含まず、**調査結果・採用案・検証ゲート・データ移行手順・切替手順・後続 Issue 分割**までを定める。

- 作成日: 2026-10-11 / 対象 Issue: #609 / 関連: #497（AWS 本番更新。本計画により不要になる見込み）、#607（秘密情報）、#608（管理者デモ廃止）
- 凡例: ✅ 公式ドキュメント等で確認済み（2026-10-11 時点）／ ⚠️ 未確認・推測を含む（**Phase 0 の検証で確定させる**）

---

## 0. 3行で言うと

1. 移行先の有力案は「**OpenNext アダプタで Next.js 16 を Workers に載せ、DB は D1（Prisma アダプタ）**」。ただし現時点で**確定できない前提が複数ある**ため、いきなり移行せず、まず捨てる前提の**検証（Phase 0）で Go/No-Go を判断**する。
2. 最大の論点は2つ。**(a) Workers Free の CPU 10ms/リクエスト**（Next.js の描画・bcrypt（cost 12）はほぼ確実に超える見込み。Workers Paid は月 $5〜）、**(b) Prisma の D1 アダプタが Preview で、トランザクション非対応**（本アプリは `$transaction` を11箇所で使用）。
3. データは **ID・日時・bcrypt ハッシュ・日本語を保ったまま、アプリ層（Prisma 経由）で移す ETL** とし、件数・主キー・外部キー・列ごとのハッシュで照合する。AWS は現在停止中のため、**書込み凍結が不要になる代わりに、「旧 DB の保全」と「ロールバック」の考え方が変わる**（§9）。

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

### 4-2. 代替案との比較

| 案 | 内容 | 長所 | 短所 |
| --- | --- | --- | --- |
| **A（採用案）** | OpenNext ＋ D1 ＋ Prisma（D1 アダプタ） | 現行コードの変更が最小。Repository 層（#613）の分離が効く | Prisma D1 が Preview・トランザクション非対応。Prisma 7 更新が必要な可能性 |
| B | vinext ＋ D1 ＋ Prisma | Cloudflare 推奨。proxy.ts 対応 | 開発中。next-auth・PWA 互換が未確認。ビルド系の置換が大きい |
| C | OpenNext ＋ D1 ＋ **Drizzle**（Prisma を置換） | D1 のネイティブ機能（`batch` による原子的実行）を使える。Prisma Preview のリスクを回避 | Repository 層・auth アダプタ・テスト基盤の書き換えが大きい |
| D | 現状維持（AWS を再構築）／他クラウドへ移転 | 移行リスクなし。Terraform コードが残っているため再構築は可能 | 費用が発生する（本計画の前提を満たさない） |

**推奨**: A を第一候補とし、**G2（トランザクション）が許容できない場合は C に切り替える**。判断は Phase 0 の結果で行う。

### 4-3. 検証ゲート（Phase 0 で判定する Go/No-Go）

| ID | 検証内容 | 合格基準 | 不合格時の対応 |
| --- | --- | --- | --- |
| **G0** | **CPU・費用**: 最小構成の Worker で、ログイン（bcrypt）・一覧ページ・API の CPU 時間を実測（Free と Paid） | 主要操作が Free の 10ms 内に収まる、または Paid（月 $5）を許容する判断をユーザーが行う | Paid 前提で進める／（コスト不可なら）案 D を再検討 |
| **G1** | **ビルド・サイズ**: OpenNext で本アプリがビルド・デプロイでき、Worker サイズ上限（Free/Paid）に収まる。PWA（SW・manifest）が配信される | 起動・主要画面表示・SW 配信が成功 | vinext を試す／依存の削減 |
| **G2** | **Prisma D1 とトランザクション**: D1 アダプタで CRUD・`upsert`・`createMany`・Json が動き、§5-3 の各箇所を「単一文化／`batch` 化／競合を許容」のどれで置き換えるか判断できる | 11 箇所すべてに置換方針が付き、整合性要件を満たす | 案 C（Drizzle）へ切替 |
| **G3** | **認証**: Credentials ログイン、Google OAuth、JWT セッション、`proxy`（または `middleware`）による保護が Workers で動く | ログイン〜保護ページ表示〜ログアウトが通る | `middleware.ts`（Edge）化／認証周りの調整 |
| **G4** | **Cron**: Cron Trigger から `/api/cron/check-new-books` を実行できる | スケジュール実行で通知が作成される | カスタム Worker エントリ／別 Worker から呼び出し |

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

原則: **(1) 読み取りを挟まない複数文は `batch`（D1 のネイティブ機能）、(2) 読み取り→判定→更新は条件付き単一文に畳む、(3) 管理者操作で競合頻度が低いものは冪等化して許容**。Prisma D1 アダプタで `batch` が使えない場合は、該当箇所だけ D1 バインディングの SQL を直接使う Repository を設ける。

### 5-4. `$queryRaw`（MySQL 方言）の書き換え

| ファイル | 問題点 | 対応 |
| --- | --- | --- |
| `lib/recommendations.ts`（おすすめ著者） | CTE・`COUNT(DISTINCT)` は SQLite 可。**整数除算**でスコアが壊れる | `CAST(... AS REAL)` |
| `lib/userRecommendations.ts`（おすすめユーザー） | `GROUP_CONCAT(DISTINCT a.name ORDER BY a.name SEPARATOR '|')` は SQLite で不可（`SEPARATOR` 構文、DISTINCT と区切り文字の併用不可） | サブクエリで DISTINCT 化してから `GROUP_CONCAT(name, '\|')`、または取得後にアプリ側で結合 |
| `api/admin/users/[id]/route.ts`（2 箇所） | `FOR UPDATE` | §5-3 の #4・#5 |

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
| 結合 | 現行は Docker の MySQL（3307）。**移行完了までは MySQL を維持**し、並行して D1 ローカル（`wrangler`/Miniflare の SQLite）向けの結合テストを追加。**同じテストを両 DB で実行**して挙動差（§5-2・§5-4）を検出する |
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
| P0-1 | Workers 最小構成の実測（G0・G1） | OpenNext で本アプリ（または最小ページ＋bcrypt）をデプロイし、CPU 時間・サイズ・PWA 配信を Free/Paid で実測 | 実測表と、Free で可否・Paid 前提かの判定が文書化 |
| P0-2 | Prisma D1 アダプタの検証（G2） | CRUD・upsert・createMany・Json・日時、`batch` の可否、§5-3 の置換方針の確定 | 11 箇所の置換方針表。Prisma 7 更新の要否を確定 |
| P0-3 | 認証と proxy の検証（G3） | Credentials・Google OAuth・JWT・保護ルートを Workers で確認 | 動作可否と必要な変更が文書化 |
| P0-4 | Cron の検証（G4） | Cron Trigger → API 内部呼び出し | スケジュール実行で通知作成 |
| P0-5 | vinext の比較検証（任意） | 同じ最小構成を vinext で試し、OpenNext との比較を記録 | 比較表と最終選定 |

→ **Phase 0 の結果で、本計画の採用案（A/B/C）と Free/Paid を確定し、本書を更新**する（Go/No-Go）。

### Phase 1: MySQL のまま準備（本番に影響しない／D1 非依存で価値がある変更）

| # | 後続 Issue（案） | 内容 |
| --- | --- | --- |
| P1-1 | Prisma 7 へ更新（MySQL のまま） | 必要と判明した場合のみ。ジェネレータ・設定の更新と全テストの回帰確認 |
| P1-2 | `email` の小文字正規化 | 保存・検索の正規化と既存データの重複検査スクリプト |
| P1-3 | 生 SQL の DB 非依存化 | `recommendations` / `userRecommendations` の方言依存（整数除算・`GROUP_CONCAT`）を解消。MySQL・SQLite 双方で同結果の結合テスト |
| P1-4 | トランザクションの置換（§5-3） | 方針に従い、条件付き単一文／`batch` 可能な形へ（MySQL でも動作する形で先に入れる） |
| P1-5 | logger の抽象化 | `pino` 依存を薄いラッパーに閉じ込め、実装差し替え可能に |
| P1-6 | 画像表示の最適化依存を外す | `sharp`／`next/image` の最適化に依存しない構成（`unoptimized`）と見た目の回帰確認 |

### Phase 2: D1 対応（バックエンド）

| # | 後続 Issue（案） | 内容 |
| --- | --- | --- |
| P2-1 | D1 用スキーマ・マイグレーション | `sqlite` 用 Prisma スキーマ（`@db.*` 除去）と `wrangler d1 migrations`。MySQL スキーマとの差分表を維持 |
| P2-2 | Prisma クライアントの D1 切替 | `src/lib/prisma.ts` をバインディング経由に（リクエストごとの生成） |
| P2-3 | 結合テストの D1 対応 | 両 DB で同じ結合テストを実行できる基盤 |
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
| P4-7 | ドキュメント更新 | CLAUDE.md の技術スタック表（デプロイ）、`docs/requirements.md`、`docs/features/cron.md`、デプロイ手順書の差し替え |

### 依存関係

```
P0-1〜P0-5 ──(Go/No-Go)──▶ Phase 1 ─▶ Phase 2 ─▶ Phase 3 ─▶ P4-1/2 ─▶ P4-3 ─▶ P4-4 ─▶ P4-5 ─▶ P4-6/7
                              │ （P1-x は D1 非依存。MySQL 上で先にマージ可能）
#608（管理者デモ削除）: 完了済み（本番データ移行前の前提を満たす）
#607（秘密情報）      : P3-2 の前提
```

---

## 11. 未解決事項・ユーザーの決定が必要な事項

| # | 事項 | 内容 |
| --- | --- | --- |
| D1 | **費用の許容** | Workers Free で動かない（CPU 10ms 超過）場合、**Workers Paid の月 $5（約 750 円）**を許容するか。G0 の実測後に最終判断。許容できない場合は案 D（Cloudflare 以外）の再検討 |
| D2 | ~~停止中の AWS（RDS）の扱い~~ | **解決済み（2026-10-11）**: RDS は削除済み。ダンプを取得・暗号化し、PC と USB に保管。手動スナップショットは当面保持（月 $2 弱） |
| D3 | **旧データの保全期間** | 移行後、スナップショット／暗号化ダンプを何日保持するか（保持中は少額の保管費用）。暗号化ダンプの 3 か所目（別の場所）をどこにするか |
| D4 | **公開 URL・独自ドメイン** | 当面 `*.workers.dev` でよいか。独自ドメイン（別途費用）を使うか |
| D5 | **Phase 0 の進め方** | 次に P0-1〜P0-4 の Issue を作成して検証を始めてよいか（アカウント作成・Wrangler のログインはユーザー操作が必要） |

---

## 12. 参考リンク

- Cloudflare: [Workers の制限](https://developers.cloudflare.com/workers/platform/limits/)、[Workers の料金](https://developers.cloudflare.com/workers/platform/pricing/)、[D1 の制限](https://developers.cloudflare.com/d1/platform/limits/)、[Next.js ガイド](https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/)
- [OpenNext for Cloudflare](https://opennext.js.org/cloudflare)、[vinext](https://github.com/cloudflare/vinext)
- [Prisma ORM と Cloudflare D1](https://www.prisma.io/docs/orm/overview/databases/cloudflare-d1)
- 本リポジトリ: `app/prisma/schema.prisma`、`app/src/lib/prisma.ts`、`app/src/auth.ts`、`docs/aws-deploy-plan.md`、`docs/data-migration-spec-481.md`、`app/prisma/scripts/migration/`
