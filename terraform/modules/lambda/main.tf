variable "project" {
  type = string
}

variable "cron_url" {
  type        = string
  description = "新刊チェック cron エンドポイントの URL"
}

variable "cron_secret" {
  type      = string
  sensitive = true
}

# ──────────────────────────────────────────────
# IAM ロール
# ──────────────────────────────────────────────
resource "aws_iam_role" "lambda_exec" {
  name = "${var.project}-lambda-cron-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "lambda_basic" {
  role       = aws_iam_role.lambda_exec.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# ──────────────────────────────────────────────
# Lambda 関数（インライン zip）
# ──────────────────────────────────────────────
data "archive_file" "lambda_zip" {
  type        = "zip"
  output_path = "${path.module}/lambda_function.zip"

  source {
    content  = <<-PYTHON
      import http.client
      import os
      from urllib.parse import urlparse

      def handler(event, context):
          url    = os.environ["CRON_URL"]
          secret = os.environ["CRON_SECRET"]
          parsed = urlparse(url)
          conn = http.client.HTTPSConnection(parsed.netloc, timeout=30)
          conn.request(
              "GET",
              parsed.path,
              headers={"Authorization": f"Bearer {secret}"},
          )
          res = conn.getresponse()
          print(f"Status: {res.status}")
          print(res.read().decode())
          conn.close()
          if res.status >= 400:
              raise Exception(f"Request failed with status {res.status}")
    PYTHON
    filename = "lambda_function.py"
  }
}

resource "aws_lambda_function" "cron_check_new_books" {
  function_name    = "${var.project}-cron-check-new-books"
  role             = aws_iam_role.lambda_exec.arn
  filename         = data.archive_file.lambda_zip.output_path
  source_code_hash = data.archive_file.lambda_zip.output_base64sha256
  handler          = "lambda_function.handler"
  runtime          = "python3.12"
  timeout          = 60

  environment {
    variables = {
      CRON_URL    = var.cron_url
      CRON_SECRET = var.cron_secret
    }
  }

  tags = { Name = "${var.project}-cron-check-new-books" }
}

# ──────────────────────────────────────────────
# EventBridge ルール（毎日 UTC 0:00 = JST 9:00）
# ──────────────────────────────────────────────
resource "aws_cloudwatch_event_rule" "daily_cron" {
  name                = "${var.project}-daily-check-new-books"
  schedule_expression = "cron(0 0 * * ? *)"
  description         = "毎日 UTC 0:00 に新刊チェックを実行"
}

resource "aws_cloudwatch_event_target" "lambda_target" {
  rule      = aws_cloudwatch_event_rule.daily_cron.name
  target_id = "CheckNewBooksLambda"
  arn       = aws_lambda_function.cron_check_new_books.arn
}

resource "aws_lambda_permission" "allow_eventbridge" {
  statement_id  = "AllowExecutionFromEventBridge"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.cron_check_new_books.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.daily_cron.arn
}
