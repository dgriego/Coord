import { Hono } from "hono";
import { clipInput, type ClipResult } from "@coord/shared";
import { requirePermission, requireSession, type Env } from "../context.ts";
import { vendors } from "../db/schema.ts";
import { body, HttpError } from "../http.ts";
import { fetchProductPage, parseProduct, siteKey } from "../catalog/clip.ts";
import { RateLimiter } from "../rate-limit.ts";
import { inStudio } from "./helpers.ts";

const limiter = new RateLimiter(60, 60 * 60 * 1000);

export const clipRoutes = new Hono<Env>()
  .use(requireSession, requirePermission("projects.edit"))
  .post("/", async (c) => {
    const { url } = await body(c, clipInput);
    if (!limiter.take(c.var.session.userId)) {
      throw new HttpError(429, "too_many_attempts", "You've imported a lot of links this hour. Try again shortly.");
    }
    const page = await fetchProductPage(url);
    const product = parseProduct(page.html, page.url);
    if (!product.name) throw new HttpError(400, "no_product", "No product details were found on that page. Add the item by hand.");

    const site = siteKey(page.url);
    const list = await inStudio(c, (tx) => tx.select({ id: vendors.id, name: vendors.name, website: vendors.website }).from(vendors));
    const match = list.find((v) => v.website && siteKey(v.website) === site);
    const result: ClipResult = { ...product, vendorId: match?.id ?? null, vendorName: match?.name ?? null };
    return c.json(result);
  });
