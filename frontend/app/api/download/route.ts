import { type NextRequest } from "next/server";

/**
 * Same-origin download proxy. Cross-origin downloads can't be forced from the
 * browser (the `download` attribute is ignored cross-origin, and a blob fetch
 * needs R2 CORS). This streams the R2 object through our own origin with
 * `Content-Disposition: attachment`, so the browser saves it instead of opening
 * it. Restricted to our R2 public host to avoid being an open proxy (SSRF).
 */
const R2_BASE = process.env.NEXT_PUBLIC_CF_R2_PUBLIC_URL ?? "";

function safeName(name: string): string {
  return name.replace(/[\r\n"\\]/g, "").slice(0, 180) || "photo.jpg";
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  const name = safeName(req.nextUrl.searchParams.get("name") || "photo.jpg");
  if (!url) return new Response("Missing url", { status: 400 });
  if (!R2_BASE || !url.startsWith(R2_BASE)) return new Response("Forbidden", { status: 403 });

  let upstream: Response;
  try {
    upstream = await fetch(url, { cache: "no-store" });
  } catch {
    return new Response("Upstream fetch failed", { status: 502 });
  }
  if (!upstream.ok || !upstream.body) {
    return new Response("Not found", { status: upstream.status || 502 });
  }

  const headers = new Headers();
  headers.set("Content-Type", upstream.headers.get("content-type") || "application/octet-stream");
  headers.set("Content-Disposition", `attachment; filename="${name}"`);
  const len = upstream.headers.get("content-length");
  if (len) headers.set("Content-Length", len);
  headers.set("Cache-Control", "private, max-age=0");
  return new Response(upstream.body, { status: 200, headers });
}
