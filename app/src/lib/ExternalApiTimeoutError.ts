export class ExternalApiTimeoutError extends Error {
  constructor(public readonly api: "楽天" | "NDL") {
    super(`${api} search timed out`);
    this.name = "ExternalApiTimeoutError";
  }
}
