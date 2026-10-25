// Existing next-pwa defaults may have stored personalized responses. Remove only
// these known legacy caches; unrelated caches on this origin remain untouched.
self.addEventListener("activate", (event) => {
  const legacyPersonalCaches = [
    "start-url", "apis", "pages", "pages-rsc", "pages-rsc-prefetch",
    "next-data", "static-data-assets", "cross-origin",
  ];
  event.waitUntil(Promise.all(legacyPersonalCaches.map((name) => caches.delete(name))));
});
