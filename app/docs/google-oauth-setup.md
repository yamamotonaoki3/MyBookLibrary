# Google OAuthログイン 設定手順書

## 概要

Google アカウントでのログインを有効にするには、Google Cloud Console でOAuthアプリを登録し、発行されたクライアントID・シークレットを `.env.local` に設定する。

---

## ステップ1：Google Cloud Console でプロジェクトを作成

1. [https://console.cloud.google.com/](https://console.cloud.google.com/) にアクセス（Google アカウントでログイン）
2. 画面上部のプロジェクト選択欄 → **「新しいプロジェクト」** をクリック
3. プロジェクト名を入力（例：`MyBookLibrary`）→ **「作成」**
4. 作成したプロジェクトを選択した状態にする

---

## ステップ2：OAuth 同意画面を設定

1. 左メニュー → **「APIとサービス」** → **「OAuth 同意画面」**
2. User Type は **「外部」** を選択 → **「作成」**
3. 以下を入力：
   - **アプリ名**：`MyBookLibrary`
   - **ユーザーサポートメール**：自分のGmailアドレス
   - **デベロッパーの連絡先**：自分のGmailアドレス
4. **「保存して次へ」** を3回クリックして完了

---

## ステップ3：OAuth クライアントIDを作成

1. 左メニュー → **「APIとサービス」** → **「認証情報」**
2. **「認証情報を作成」** → **「OAuth クライアント ID」**
3. アプリケーションの種類：**「ウェブ アプリケーション」** を選択
4. 名前：`MyBookLibrary Web`（任意）
5. **「承認済みのリダイレクト URI」** に以下を追加：

   ```
   http://localhost:3000/api/auth/callback/google
   ```

   ※本番デプロイ時は本番URLも追加する

6. **「作成」** をクリック
7. ダイアログに **クライアントID** と **クライアントシークレット** が表示される → **必ずコピーして保存**

---

## ステップ4：.env.local に設定

`app/.env.local` の以下のコメントアウトを外して値を設定：

```env
# 変更前（コメントアウト済み）
# AUTH_GOOGLE_ID=<placeholder>
# AUTH_GOOGLE_SECRET=<placeholder>

# 変更後（実際の値に置き換える）
AUTH_GOOGLE_ID=xxxxxxxx.apps.googleusercontent.com
AUTH_GOOGLE_SECRET=GOCSPX-xxxxxxxxxxxxxxxxxxxxxxxx
```

---

## ステップ5：動作確認

1. `npm run dev` で開発サーバーを起動（または再起動）
2. `http://localhost:3000/login` を開く
3. **「Googleでログイン」** ボタンをクリック
4. Google のログイン画面が表示される
5. アカウントを選択 → MyBookLibrary に同意 → ダッシュボードへ遷移

---

## 注意事項

- `.env.local` はGitにコミットしない（`.gitignore` で除外済みのはず）
- 本番デプロイ時は本番サーバーのURLをリダイレクトURIに追加する
- Google OAuth の初回認証時は「このアプリは確認されていません」という警告が出ることがあるが、開発中は「詳細」→「安全でないページに移動」で続行できる
