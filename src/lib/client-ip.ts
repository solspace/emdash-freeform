/** Best-effort client IP from Cloudflare / reverse-proxy headers. */
export function clientIp(request: Request | undefined | null): string | null {
  if (!request) return null;
  const cf = request.headers.get("cf-connecting-ip");
  if (cf?.trim()) return cf.trim();
  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = request.headers.get("x-real-ip");
  if (realIp?.trim()) return realIp.trim();
  return null;
}
