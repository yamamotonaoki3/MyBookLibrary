import { isCronDrivenEnrichment } from "@/lib/enrichmentMode";

describe("isCronDrivenEnrichment", () => {
  const original = process.env.ENRICHMENT_MODE;
  afterEach(() => {
    if (original === undefined) delete process.env.ENRICHMENT_MODE;
    else process.env.ENRICHMENT_MODE = original;
  });
  it.each([undefined, "", "CRON", "worker", "cron"])("mode=%s", (mode) => {
    if (mode === undefined) delete process.env.ENRICHMENT_MODE;
    else process.env.ENRICHMENT_MODE = mode;
    expect(isCronDrivenEnrichment()).toBe(mode === "cron");
  });
});
