"use client";

import Image, { type ImageProps } from "next/image";
import { useState } from "react";
import { getSafeWebUrl } from "@/lib/webUrl";

type Props = Omit<ImageProps, "src" | "onError"> & {
  src?: string | null;
  fallbackClassName?: string;
};
function MissingCover({ className }: { className?: string }) {
  return <div className={className ?? "flex h-full w-full items-center justify-center bg-zinc-100 text-xs text-zinc-400 dark:bg-zinc-800"}>No Image</div>;
}
function LoadableCover({ fallbackClassName, ...props }: Omit<Props, "src"> & { src: string }) {
  const [failed, setFailed] = useState(false);
  return failed ? <MissingCover className={fallbackClassName} /> : <Image {...props} alt={props.alt} onError={() => setFailed(true)} />;
}
/** Keep state local to each source: changing the URL retries a previously failed cover. */
export function BookCover({ src, fallbackClassName, ...props }: Props) {
  const safeSrc = getSafeWebUrl(src);
  return safeSrc ? <LoadableCover key={safeSrc} {...props} src={safeSrc} fallbackClassName={fallbackClassName} /> : <MissingCover className={fallbackClassName} />;
}
