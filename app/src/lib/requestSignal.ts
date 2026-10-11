export type RequestOptions = {
  /** 呼び出し元の中断シグナル（全体予算の超過など） */
  signal?: AbortSignal;
  /** 1リクエストあたりのタイムアウト（ms）。未指定なら無制限 */
  timeoutMs?: number;
};

/**
 * 呼び出し元のシグナルとタイムアウトをまとめた AbortSignal を返す。
 * どちらも未指定なら undefined（従来どおり無制限）。
 */
export function buildRequestSignal(options?: RequestOptions): AbortSignal | undefined {
  const signals: AbortSignal[] = [];
  if (options?.signal) signals.push(options.signal);
  if (options?.timeoutMs !== undefined) signals.push(AbortSignal.timeout(options.timeoutMs));
  if (signals.length === 0) return undefined;
  return signals.length === 1 ? signals[0] : AbortSignal.any(signals);
}

/** 複数のシグナルのうち、いずれかが中断したら中断するシグナルを返す（undefined は無視）。 */
export function anySignal(...signals: (AbortSignal | undefined)[]): AbortSignal | undefined {
  const defined = signals.filter((s): s is AbortSignal => s !== undefined);
  if (defined.length === 0) return undefined;
  return defined.length === 1 ? defined[0] : AbortSignal.any(defined);
}
