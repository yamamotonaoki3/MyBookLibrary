export function BookReviewCount({ count }: { count: number }) {
  return <span className="inline-block break-words text-xs text-muted-foreground">公開レビュー {count}件</span>;
}
