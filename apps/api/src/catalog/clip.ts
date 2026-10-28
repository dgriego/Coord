import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import type { ClipResult } from "@coord/shared";
import { HttpError } from "../http.ts";

// Clipper v1: paste a product link, get a filled-in item. Reads schema.org
// Product data first, then Open Graph and product meta tags. The Chrome
// extension planned for later posts page HTML to the same parser.

const MAX_BYTES = 2_000_000;
const TIMEOUT_MS = 8_000;
const MAX_REDIRECTS = 3;

/** True for loopback, private, link-local and other non-public addresses. */
export function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number) as [number, number];
    return (
      a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19)) || a >= 224
    );
  }
  const v6 = ip.toLowerCase();
  if (v6.startsWith("::ffff:")) return isPrivateAddress(v6.slice(7));
  return v6 === "::" || v6 === "::1" || v6.startsWith("fc") || v6.startsWith("fd") || v6.startsWith("fe8") ||
    v6.startsWith("fe9") || v6.startsWith("fea") || v6.startsWith("feb") || v6.startsWith("ff");
}

async function assertPublicUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new HttpError(400, "invalid_url", "Paste a full link starting with https://");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new HttpError(400, "invalid_url", "Only web links (http or https) can be imported.");
  }
  if (url.username || url.password) throw new HttpError(400, "invalid_url", "Links with passwords can't be imported.");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(host) ? [host] : (await lookup(host, { all: true }).catch(() => [])).map((a) => a.address);
  if (addresses.length === 0) throw new HttpError(400, "unreachable", "That website couldn't be found. Check the link.");
  if (addresses.some(isPrivateAddress)) throw new HttpError(400, "invalid_url", "That link points to a private network address.");
  return url;
}

export async function fetchProductPage(raw: string): Promise<{ html: string; url: string }> {
  let url = await assertPublicUrl(raw);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let res: Response;
    try {
      res = await fetch(url, {
        redirect: "manual",
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: {
          "user-agent": "Mozilla/5.0 (compatible; StudioClipper/1.0)",
          accept: "text/html,application/xhtml+xml",
        },
      });
    } catch {
      throw new HttpError(400, "unreachable", "That page didn't respond. Try again, or add the item by hand.");
    }
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      // Each redirect target gets the same private-address check.
      url = await assertPublicUrl(new URL(res.headers.get("location")!, url).toString());
      continue;
    }
    if (!res.ok) throw new HttpError(400, "unreachable", `That page returned an error (${res.status}). Add the item by hand.`);
    const type = res.headers.get("content-type") ?? "";
    if (!type.includes("html")) throw new HttpError(400, "not_html", "That link isn't a web page.");
    const reader = res.body?.getReader();
    if (!reader) return { html: "", url: url.toString() };
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_BYTES) {
        await reader.cancel();
        break;
      }
      chunks.push(value);
    }
    return { html: new TextDecoder().decode(Buffer.concat(chunks)), url: url.toString() };
  }
  throw new HttpError(400, "unreachable", "That link redirects too many times.");
}

const decode = (s: string) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, " ")
    .trim();

function meta(html: string, key: string): string {
  const re = new RegExp(
    `<meta[^>]+(?:property|name|itemprop)=["']${key.replace(/[.:]/g, "\\$&")}["'][^>]*content=["']([^"']*)["']|<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name|itemprop)=["']${key.replace(/[.:]/g, "\\$&")}["']`,
    "i",
  );
  const m = html.match(re);
  return m ? decode(m[1] ?? m[2] ?? "") : "";
}

type Json = Record<string, unknown>;

function findProduct(node: unknown): Json | null {
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const n of node) {
      const hit = findProduct(n);
      if (hit) return hit;
    }
    return null;
  }
  const obj = node as Json;
  const type = obj["@type"];
  if (type === "Product" || (Array.isArray(type) && type.includes("Product"))) return obj;
  return findProduct(obj["@graph"]);
}

const first = (v: unknown): unknown => (Array.isArray(v) ? v[0] : v);
const str = (v: unknown): string => {
  const f = first(v);
  if (typeof f === "string") return decode(f);
  if (f && typeof f === "object") return str((f as Json).url ?? (f as Json).name ?? "");
  return typeof f === "number" ? String(f) : "";
};

function priceCents(v: unknown): number | null {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;
}

/** Pulls product details out of a page's HTML. Pure, so it's unit-tested with fixtures. */
export function parseProduct(html: string, pageUrl: string): Omit<ClipResult, "vendorId" | "vendorName"> {
  let product: Json | null = null;
  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      product = findProduct(JSON.parse(m[1]!));
    } catch {
      // Sites often ship malformed JSON-LD; fall through to meta tags.
    }
    if (product) break;
  }

  const offers = first(product?.offers) as Json | undefined;
  const title = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1];
  const name = str(product?.name) || meta(html, "og:title") || decode(title ?? "");
  const image = str(product?.image) || meta(html, "og:image") || meta(html, "twitter:image");
  const price =
    priceCents(offers?.price ?? offers?.lowPrice ?? (first(offers?.priceSpecification) as Json | undefined)?.price) ??
    priceCents(meta(html, "product:price:amount") || meta(html, "og:price:amount") || meta(html, "price"));

  const abs = (u: string) => {
    try {
      return u ? new URL(u, pageUrl).toString() : "";
    } catch {
      return "";
    }
  };

  return {
    name: name.slice(0, 200),
    description: (str(product?.description) || meta(html, "og:description") || meta(html, "description")).slice(0, 2000),
    imageUrl: abs(image),
    sourceUrl: pageUrl,
    sku: (str(product?.sku) || str(product?.mpn) || meta(html, "product:retailer_item_id")).slice(0, 120),
    brand: (str(product?.brand) || meta(html, "og:site_name")).slice(0, 120),
    msrpCents: price,
  };
}

/** Bare hostname without "www." for matching pages to vendor websites. */
export function siteKey(urlOrHost: string): string {
  try {
    const u = new URL(urlOrHost.includes("://") ? urlOrHost : `https://${urlOrHost}`);
    return u.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}
