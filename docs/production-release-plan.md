# 本番反映（main → production）の計画

2026-10-29時点。Issue #798。本番への反映は、**別途の明示承認と、下記の確認を経て行う**。この文書の作成時点では、まだ行っていない。

## 現状

| 項目 | 状態 |
| --- | --- |
| 本番 | バージョンタグ `0.0.0-661e6b6`（#773 の認証更新まで。デプロイは 2026-10-23）。`production` ブランチの先頭は、PR #779 のマージ |
| ステージング | `0.0.0-f826762`（`main` の先頭、PR #797）。本番に出す候補と同一 |
| 差分 | `production` は `main` より、PR 14件（#780・#781・#783・#785・#786・#787・#788・#790・#791・#792・#793・#795・#796・#797）、33コミット、92ファイル遅れている |
| DBの変更 | **なし**（`app/prisma/d1` とマイグレーションに差分がない）。D1 のデータ・スキーマは、反映で変わらない |
| 設定の変更 | `app/wrangler.jsonc` のみ（本番に、毎分Cron `* * * * *` と `ENRICHMENT_MODE="cron"` を追加。ステージングは、確認のあと、Cronを無効にした） |

## 反映前に実施した作業

| 日時 | 作業 | 結果 |
| --- | --- | --- |
| 2026-10-29 | 本番の Worker の secret `ENRICHMENT_TICK_SECRET` を登録（ランダムな値。値は、チャット・ファイル・ログに出していない） | 登録済み。本番の secret は8件（`AUTH_GOOGLE_ID`・`AUTH_GOOGLE_SECRET`・`AUTH_SECRET`・`CALIL_API_KEY`・`CRON_SECRET`・`ENRICHMENT_TICK_SECRET`・`RAKUTEN_ACCESS_KEY`・`RAKUTEN_APP_ID`） |

secret の登録は、同じコードの新しい Worker バージョンを作る。本番のバージョンは次のとおり（コードは、どちらも `0.0.0-661e6b6`）。

| バージョンID | 作成 | 内容 |
| --- | --- | --- |
| `2fea040d-7bc6-4fc1-a0e5-16ab5fd66e4b` | 2026-10-23 | `0.0.0-661e6b6`（secret の登録前） |
| `4d5ce714-c7a1-47ad-bd33-c7e923746474` | 2026-10-29 06:04 UTC | 同じコード + `ENRICHMENT_TICK_SECRET`（現在の本番。ロールバックの戻し先の第一候補） |

## 本番に入る変更と、利用者への影響

| 変更 | 内容 | 影響・リスク |
| --- | --- | --- |
| #774 Next.js・OpenNext | Next.js 16.4.3、OpenNext Cloudflare 1.20.13 | フレームワークの更新。CI・Linux のビルドと疎通は確認済み。本番の実機は未確認 |
| #776 PWA | Service Worker が、画面・API・RSC をキャッシュしない。起動時に、旧い個人データのキャッシュを削除する | インストール済みのPWAは、更新を受ける。個人データが、端末に残らなくなる |
| #782・#784・#794 ログイン・ログアウト | 目印のCookie（`mbl_browser_session`、`mbl_signed_out`）を追加。「保持しない」は、ブラウザを閉じると未ログイン（タブ単位からブラウザ単位へ）。`/api/auth/session` も、ログアウト済みの目印を尊重する | **「ログイン状態を保持しない」でログインしていた利用者は、反映後、1回、再ログインが必要**（目印のCookieがないため）。保持ありの利用者には、影響しない |
| #696 書誌補完 | 毎分Cronが、補完ジョブを20秒の予算で分割して処理する。管理者の補完開始は、ジョブを作るだけで、処理は、Cronが行う | 本番の `ENRICHMENT_TICK_SECRET` が必要（登録済み）。毎分のCronが、実行中ジョブの確認（軽いクエリ）で、常時動く |
| #775・#789 ほか | 依存の更新（ビルド用ツール、Wrangler 4.153.0 など） | 本番の実行には、影響しない見込み |
| #777・#778・#772 | 依存の調査・記録（コード・依存の変更なし） | なし |

## 反映前のチェックリスト

- [x] 本番の `ENRICHMENT_TICK_SECRET` を登録した（上記）
- [ ] ステージングで、「保持あり」「保持なし」のログイン、ブラウザを閉じての再訪問、ログアウトを、ブラウザで確認した
- [ ] ステージングで、検索、本の登録、管理者画面を確認した
- [ ] PWAの更新（Service Worker）を確認した（可能なら）
- [ ] ステージングで `npm run smoke:remote` が通った（ステージング専用のテストユーザーの認証情報が必要。[手順](cloudflare-deploy.md#ステージングの疎通確認npm-run-smokeremote)）
- [ ] 反映の直前に、D1（`mybooklibrary-db`）の Time Travel のブックマークを取得した（`npx wrangler d1 time-travel info mybooklibrary-db`。読み取りのみ。DBは変更しないが、念のため）
- [ ] 反映の直前の、本番のバージョンID（`/api/version`）を控えた
- [ ] 本番の新刊チェックのCron（UTC 00:00 = JST 09:00）の直前を避けた

## 反映の手順

1. `main` から `production` への PR を作成してマージする（変更の一覧が記録に残るため、推奨）。または、`git push origin main:production`（早送り）。どちらも、**実行の前に、明示の承認が必要**。
2. Workers Builds が、`production` ブランチから、本番へ自動デプロイする。ビルドの成功を、Cloudflare のダッシュボードの「Deployments」で確認する。

## 反映後の確認

- [ ] `/api/version` のタグが、反映したコミットになっている
- [ ] `/login` が200で、ログイン・ログアウト・検索が動く（保持あり・保持なし）
- [ ] `npx wrangler tail`（読み取りのみ）で、2つのCronが `status: 200` で成功する（毎分の補完 `* * * * *` と、毎日の新刊チェック `0 0 * * *`）
- [ ] 管理者画面で、補完の画面が表示される（補完の開始は、必要なときだけ行う）
- [ ] 異常があれば、下記のロールバックを行う

## ロールバック

D1 は変更しないため、Worker のバージョンを戻すだけで、データへの影響はない（[手順](cloudflare-deploy.md#ロールバック)）。

```bash
# app/ で実行（本番は --env を付けない）
npx wrangler rollback 4d5ce714-c7a1-47ad-bd33-c7e923746474 -m "理由"
npx wrangler deployments status
```

- 戻し先は、現在の本番（`4d5ce714-...`）を、第一候補とする。反映の直前に、`/api/version` のIDを、あらためて確認する。
- ロールバックしたあとも、`production` に次のコミットが入ると、自動デプロイで、最新に戻る。不具合を直すまで、`production` への反映を止める。
- 戻す前のバージョンが、利用者のブラウザに置いたCookie（`mbl_browser_session`・`mbl_signed_out`）は、古いバージョンでは、読まれないだけで、害はない。

## デモ環境

デモ（`mybooklibrary-demo`）は、`demo` ブランチから、本番とは別にデプロイされる。本番の確認後に、別途、`main` に揃える（`git push origin origin/main:demo`）。デモの保護（#721）と、Cron の挙動に関わるため、[デモ環境の方針](demo-environment.md)と [demo-apply-runbook.md](demo-apply-runbook.md) に従う。

## 未確認のこと

- 本番の実機での、Next.js 16.4.3 の動作（ステージングでの確認は、ユーザーのブラウザでの確認が必要）
- 毎分Cronでの、時間・CPUの上限、処理量の実測（[書誌補完仕様](features/book-enrichment.md)）
- AWS 側のスナップショットが、いま存在すること（[AWS 構成](aws/README.md)。認証情報を使っておらず、未確認）
