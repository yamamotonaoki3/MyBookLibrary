export function setAppBadge(count: number): void {
  if (typeof navigator === "undefined" || !("setAppBadge" in navigator)) return;
  if (count > 0) {
    navigator.setAppBadge(count);
  } else {
    navigator.clearAppBadge();
  }
}
