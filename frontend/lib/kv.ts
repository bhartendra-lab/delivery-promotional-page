import "server-only";
import type { KvData } from "./types";

const KV_KEY_PREFIX = "delivery-landing-pages:";

export async function readKvData(id: string): Promise<KvData | null> {
  const accountId = process.env.CF_ACCOUNT_ID;
  const namespaceId = process.env.CF_KV_NAMESPACE_ID;
  const token = process.env.CF_KV_AUTH_TOKEN;

  if (!accountId || !namespaceId || !token) {
    throw new Error(
      "Cloudflare KV env vars missing (CF_ACCOUNT_ID / CF_KV_NAMESPACE_ID / CF_KV_AUTH_TOKEN).",
    );
  }

  const key = encodeURIComponent(`${KV_KEY_PREFIX}${id}`);
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces/${namespaceId}/values/${key}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`KV fetch failed: ${res.status}`);
  }

  const text = await res.text();
  try {
    const data = JSON.parse(text) as KvData;
    data.background_image = `${data.background_image}?v=${Date.now()}`;
    data.company_logo = `${data.company_logo}?v=${Date.now()}`;
    return data;
  } catch {
    return null;
  }
}
