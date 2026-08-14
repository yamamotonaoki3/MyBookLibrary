import { createHash } from "node:crypto";

/** バイト列のSHA-256チェックサムを16進文字列で返す。 */
export function computeSha256(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}
