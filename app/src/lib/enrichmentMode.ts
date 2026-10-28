/** 未設定のAWS・ローカルは従来の常駐ワーカー方式を維持する。 */
export function isCronDrivenEnrichment(): boolean {
  return process.env.ENRICHMENT_MODE === "cron";
}
