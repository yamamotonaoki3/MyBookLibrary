# 環境変数とシークレットの管理

実値を Git、Issue、PR、ログへ記録しない。テンプレートには変数名と説明だけを置く。

| 用途 | 実値を置く場所 | Git 管理するもの |
| --- | --- | --- |
| ローカル開発 | `app/.env.local` | `app/.env.local.example` |
| テスト | CI の使い捨て環境変数または `app/.env.test` | `app/.env.test.example` |
| DB 移行 | 作業端末の `app/.env.migration-source` / `app/.env.migration-target` | 各 `.example` |
| 現行 AWS 本番 | AWS SSM Parameter Store | Terraform の変数定義と `terraform.tfvars.example` |
| Cloudflare 移行後 | Cloudflare Workers の Secret 管理 | Wrangler/アプリ設定のテンプレート（#609 で確定） |

`.env*` の実値、`*.tfvars`、Terraform state/plan、DB dump は `.gitignore` の対象である。追加する前に `git ls-files` で追跡対象になっていないことを確認する。

## 自動検出

GitHub Actions は PR と `main` への push で履歴を含めて Gitleaks を実行する。実際の秘密情報が検出された場合は例外登録せず、値を失効・ローテーションする。誤検知だけをレビューし、必要最小限の範囲で除外する。

ローカルでは Python の pre-commit を使う。

```powershell
python -m pip install pre-commit
pre-commit install
pre-commit run --all-files
```

初回の検出結果を共有するときも、値そのものを貼り付けない。
