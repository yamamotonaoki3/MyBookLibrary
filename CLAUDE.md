# MyBookLibrary — Claude Code ワークフロールール

## 絶対に守るルール

1. **作業は必ずイシューから始める**
   - コード変更・機能追加・バグ修正・ドキュメント更新、いかなる作業も GitHub Issue を先に作成する。
   - Issue なしにブランチを切ってはいけない。

2. **main ブランチへの直接プッシュ禁止**
   - `git push origin main` は禁止。GitHub 側でも強制されている。
   - 必ず作業ブランチから PR を作成し、マージで取り込む。

3. **PR はレビュー・動作確認後にマージする**
   - 自分でセルフレビューを行い、チェックリストを埋めてからマージする。
   - CI（整備後）が通っていることを確認する。

---

## ブランチ命名規則

```
<prefix>/#<issue番号>-<英語の概要>
```

| プレフィックス | 用途 |
|---|---|
| `feature` | 機能追加 |
| `fix` | 不具合修正 |
| `chore` | リファクタ・設定変更・依存更新 |
| `docs` | ドキュメントのみの変更 |

**例:**
- `feature/#1-add-book-entity`
- `fix/#5-search-filter-error`
- `chore/#3-update-dependencies`
- `docs/#2-add-requirements`

---

## 作業フロー（毎回この順番で）

```
1. GitHub で Issue を作成（テンプレートを使う）
2. ブランチを切る: git checkout -b feature/#<番号>-<概要>
3. 実装
4. 品質チェックを実行する（/品質チェック スキルを使う）
5. ユーザーがブラウザで動作確認する（← ここで一度止まる）
6. コミット: git commit
7. git push origin <ブランチ名>
8. GitHub で PR を作成（テンプレートを使う・Closes #<番号> を記載）
9. セルフレビュー → マージ
10. ブランチ削除
```

---

## コミットメッセージ規則

```
<種別>: <変更内容の要約>（日本語可）

例:
feat: 本の登録機能を追加
fix: 検索フィルターのバグを修正
chore: 依存パッケージを更新
docs: 要件定義書を追加
```

---

## 技術スタック

| 役割 | 技術 |
| --- | --- |
| フロントエンド | Next.js 16 (React 19) + TypeScript |
| バックエンド | Next.js API Routes（同一プロジェクト内） |
| データベース | MySQL 8.4 |
| ORM | Prisma 7 |
| スタイリング | Tailwind CSS v4 |
| コンテナ | Docker |
| 認証 | 未定（NextAuth.js 候補） |
| 外部API | 楽天ブックスAPI（候補） |
| デプロイ | 未定（Vercel 候補） |

## アプリ起動手順

```bash
# 1. データベース起動
docker compose up -d

# 2. 開発サーバー起動（app/ ディレクトリで）
cd app
npm run dev
```
