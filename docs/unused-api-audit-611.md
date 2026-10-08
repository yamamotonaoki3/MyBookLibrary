# 未使用 API 監査記録（#611）

使用されていない Route Handler を、静的解析と読み取り専用のブラウザ通信確認で判定するための記録。確定した 6 件は [#612](https://github.com/yamamotonaoki3/MyBookLibrary/issues/612) で削除済み。

> **方針変更（2026-10-08）**: AWS 無料枠の終了に伴い本番環境を停止したため、通信確認は現行 AWS 本番ではなく、**main 最新（`2d3a4ae`）をローカル起動した環境**で実施した。削除対象のコードそのものを検証できる。Cloudflare 移行 [#609](https://github.com/yamamotonaoki3/MyBookLibrary/issues/609) の完了は待たない。

## 判定方法

1. アプリ本体、`app/src/__tests__/`、`app/e2e/`、ドキュメントを候補 API の完全パスで検索する。
2. 動的 URL、Cron、外部起点は個別に確認し、文字列検索だけで未使用とは判定しない。
3. 一般ユーザー（架空のテストデータ）でローカル環境へログインし、更新・登録・削除・管理者機能を使わずに対象画面を閲覧する。ブラウザの Network から `/api/*` の**パスだけ**を確認する。Cookie、認証情報、個人データ、レスポンス本文は記録しない。
4. 1 と 3 が一致した API だけを削除対象に確定する。片方でも根拠が不足する API は維持する。

> 読み取り専用の画面操作は「現在の通常 UI が呼ばない」ことを確認するものであり、過去の外部利用や未知のクライアントがないことを単独で証明するものではない。

## 静的解析結果（2026-09-23）

| 候補 API | 現行画面のデータ取得 | アプリ本体・テストの Route 呼び出し | 仕様・計画上の参照 | 仮判定 |
| --- | --- | --- | --- | --- |
| `GET /api/awards/[id]/books` | `app/src/app/awards/_components/BookList.tsx` が Prisma から受賞作と読書状態を取得 | なし | `requirements.md`、`features/awards.md`、`test-plan.md` | 削除済み（#612） |
| `GET /api/awards/progress` | `app/src/app/page.tsx` が Prisma から読書進捗を計算 | なし | `requirements.md`、`api-spec.md`、`features/awards.md`、`test-plan.md` | 削除済み（#612） |
| `GET /api/favorite-authors/[authorId]/books` | `app/src/app/favorite-authors/[authorId]/page.tsx` が `searchBooks` と Prisma を直接利用 | なし | `requirements.md`、`features/favorite-authors.md`、`test-plan.md` | 削除済み（#612） |
| `GET /api/favorite-authors/recommendations` | `app/src/app/favorite-authors/page.tsx` が `getRecommendedAuthors` を直接利用 | なし | `requirements.md` | 削除済み（#612） |
| `GET /api/follows/recommendations` | `app/src/app/settings/follows/page.tsx` が `getRecommendedUsers` を直接利用 | なし | `requirements.md`、`features/follow.md`、`test-plan.md` | 削除済み（#612） |
| `GET /api/reviews/stats` | `app/src/app/page.tsx` が Prisma から受領いいね数を直接取得 | なし | `requirements.md`、`features/reviews.md`、`test-plan.md` | 削除済み（#612） |

`app/src/app/api/**/route.ts` 自身を除外した完全パス検索では、`app/src/` に候補 API を呼ぶコードは見つからなかった。`app/src/__tests__/` と `app/e2e/` にも候補 API の完全パス参照はない。

### 現行 AWS のソース確認（2026-09-23）

AWS の EC2 は起動時に GitHub `main` の ZIP を取得してビルドする。稼働中インスタンスの起動時点での `main` はローカル HEAD の `f82e431b432f7f51c076870cc80452aac1cd57ae` であり、その後に `main` のコミットはない。

ただし、このデプロイ方式はコミット SHA を EC2 に保存しない。対象ファイルの読み取り専用ハッシュ照合では、候補に直接関係する Route Handler と一部画面は一致した一方、ダッシュボードとお気に入り著者一覧の内容ハッシュには差があった。改行コードだけでは説明できない差のため、**本番とローカルが完全に同一コミットであるとは断定しない**。

それでも本番の実ソースを検索した結果、候補 API の URL は対象画面から参照されず、次の直接取得が確認できた。

- ダッシュボード: `prisma.award.findMany` と `prisma.like.count`
- 受賞作品一覧: `prisma.awardEntry.findMany`
- お気に入り著者一覧: `getRecommendedAuthors`
- お気に入り著者詳細: `searchBooks` と `prisma.book.findMany`
- フォロー管理: `getRecommendedUsers`

これは「本番の現在の画面実装も候補 API を呼ばない」根拠になるが、ブラウザ通信確認および本番とローカルの完全一致確認を代替するものではない。

### 外部起点の確認

- 現行 AWS の定期実行は `/api/cron/check-new-books` であり、6候補とは別 Route である。
- 動的 Route の利用箇所は、候補以外の `/api/users/[id]/favorite-authors`、管理 API、レビューのいいね・通報などで確認する。今回の完全パス検索結果だけを理由に、それらを未使用と扱わない。
- 現時点で候補 6 API を外部公開 API として維持する契約・利用者はリポジトリ内に記録されていない。本番環境は停止済みで、外部クライアントの有無は通信確認では確認できない。外部公開 API として維持する要件がないこと（#611 前提）を根拠に削除する。

## ローカル環境での読み取り専用通信確認（2026-10-08）

main 最新（`2d3a4ae`）を `npm run dev` で起動し、`@example.com` の架空の一般ユーザーでログインして、Playwright（Chromium）で対象画面を閲覧した。更新・登録・削除・管理者機能は操作していない。記録したのは `/api/*` の**パスのみ**で、Cookie、認証情報、個人データ、レスポンス本文は記録していない。

| 確認画面 | 操作範囲 | 記録された `/api/*` | 候補 API |
| --- | --- | --- | --- |
| ダッシュボード | 表示のみ | `/api/notifications`、`/api/auth/session` | 呼ばれていない |
| 受賞作品一覧 | 絞り込みの選択肢を順に切り替え（表示のみ） | `/api/notifications`、`/api/auth/session` | 呼ばれていない |
| お気に入り著者一覧 | 表示のみ | `/api/notifications`、`/api/auth/session` | 呼ばれていない |
| お気に入り著者詳細 | 既存著者の表示のみ | `/api/notifications`、`/api/auth/session` | 呼ばれていない |
| フォロー管理 | 3タブ（フォロー・フォロワー・おすすめ）を順に切り替え | `/api/notifications`、`/api/auth/session` | 呼ばれていない |
| マイレビュー | 表示のみ | `/api/notifications`、`/api/auth/session` | 呼ばれていない |

- 各画面が正しく表示されたこと（ログイン画面へリダイレクトされていないこと、見出しが想定どおりであること）を確認している。
- ログイン処理自体の `/api/auth/*` は対象外。
- ローカル DB はレビュー 0 件・フォロー 0 件の状態であり、データ量が多い場合の挙動までは検証していない。ただし、候補 API を呼ぶコードが画面に存在しないことは静的解析で確認済み。
- 注意: 管理画面（`app/src/app/admin/page.tsx`）が使う `/api/admin/follows/recommendations` は、候補の `/api/follows/recommendations` とは**別の Route** であり、削除対象ではない。部分一致で誤って削除しないこと。

## 削除手順（#612）

1. 通信確認と静的解析が一致した候補だけを削除対象として確定する。
2. 各 Route Handler を削除し、今回の候補だけを対象に `docs/requirements.md`、`docs/api-spec.md`、機能別定義書、`docs/test-plan.md` の参照を更新する。
3. 各画面が Server Component または既存共通関数から同じデータを取得し続けることを確認する。
4. 対象画面の E2E が表示と利用者操作を検証しているか確認し、不足があれば追加する。
5. 型チェック、lint、関連 Jest、対象 E2E、Cloudflare 対応ビルドを実行する。

## 削除確定の条件

- 対象画面を読み取り専用で操作した通信記録に候補 API が現れない（ローカル環境で確認済み）。
- 静的解析でアプリ本体、テスト、Cron・外部起点に利用がない。
- 外部利用または用途不明の根拠が出ていない。

上記のいずれかを満たさない API は削除せず、理由をこの文書と Issue に記録する。
