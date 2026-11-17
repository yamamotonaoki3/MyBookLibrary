/** Compatibility-first CSP: inline scripts/styles remain permitted for Next hydration. */
export function buildSecurityHeaders(development: boolean): { key: string; value: string }[] {
  const policy = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'" + (development ? " 'unsafe-eval'" : ""),
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' http: https: data:",
    "font-src 'self'",
    "connect-src 'self'" + (development ? " ws: wss:" : ""),
    "worker-src 'self' blob:",
    "media-src 'self' blob:",
    "object-src 'none'",
    "frame-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
  return [
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(self), microphone=()" },
    { key: "Content-Security-Policy", value: policy },
  ];
}
