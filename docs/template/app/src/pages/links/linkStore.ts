import { legacyLinks, mockLatency, orders as fixtureOrders, paymentLinks as fixtureLinks, products } from "@/mock/fixtures";
import type { LegacyLink, LocalizedText, Money, Order, OrderV2, PaymentLinkV2, Product } from "@/mock/types";

/**
 * In-memory mutable store for the merchant links pages. Seeded from the
 * read-only fixtures so mutations (create/edit/lifecycle) stay coherent
 * across pages within a session. All reads/writes simulate latency.
 */
let links: PaymentLinkV2[] = structuredClone(fixtureLinks);
const legacy: LegacyLink[] = structuredClone(legacyLinks);
const orders: Order[] = structuredClone(fixtureOrders);

export interface ActivePair {
  id: string;
  label: string;
  currency: "BRL";
}

/** Active currency pairs for the merchant — mock: BRL/PIX is the only pair. */
export async function fetchActivePairs(merchantId: string): Promise<ActivePair[]> {
  await mockLatency(250);
  void merchantId;
  return [{ id: "BRL_PIX", label: "BRL / PIX", currency: "BRL" }];
}

export async function fetchLinks(merchantId: string): Promise<{ v2: PaymentLinkV2[]; legacy: LegacyLink[] }> {
  await mockLatency(400);
  return {
    v2: structuredClone(links.filter((l) => l.merchantId === merchantId)),
    legacy: structuredClone(legacy.filter((l) => l.merchantId === merchantId)),
  };
}

export async function fetchLink(merchantId: string, id: string): Promise<PaymentLinkV2 | null> {
  await mockLatency(300);
  const found = links.find((l) => l.id === id && l.merchantId === merchantId);
  return found ? structuredClone(found) : null;
}

export async function fetchEligibleProducts(merchantId: string): Promise<Product[]> {
  await mockLatency(300);
  return structuredClone(products.filter((p) => p.merchantId === merchantId && p.state === "active"));
}

export function resolveProduct(productId: string): Product | undefined {
  return products.find((p) => p.id === productId);
}

export interface CreateLinkInput {
  merchantId: string;
  merchantUsername: string;
  type: "reusable" | "single-use";
  composition: "fixed" | "products";
  description: LocalizedText;
  fixedAmount: Money | null;
  lines: Array<{ productId: string; quantity: number }>;
  expiresAt: string | null;
}

function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "link"
  );
}

export async function createLink(input: CreateLinkInput): Promise<PaymentLinkV2> {
  await mockLatency(600);
  const nowIso = new Date().toISOString();
  const rand = Math.random().toString(36).slice(2, 7);
  const link: PaymentLinkV2 = {
    id: `lk_${rand}`,
    identifier: `${slugify(input.description["pt-BR"] || input.description.en)}-${rand}`,
    merchantId: input.merchantId,
    merchantUsername: input.merchantUsername,
    type: input.type,
    composition: input.composition,
    lifecycle: "active",
    title: { ...input.description },
    description: { ...input.description },
    fixedAmount: input.composition === "fixed" ? input.fixedAmount : null,
    productIds: input.composition === "products" ? input.lines.map((l) => l.productId) : [],
    productLines: input.composition === "products" ? input.lines.map((l) => ({ ...l })) : [],
    orderCount: 0,
    expiresAt: input.expiresAt,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
  links = [link, ...links];
  return structuredClone(link);
}

export type UpdateResult =
  | { ok: true; link: PaymentLinkV2 }
  | { ok: false; reason: "conflict" | "not-found" };

export async function updateLink(
  merchantId: string,
  id: string,
  expectedUpdatedAt: string,
  patch: Partial<Pick<PaymentLinkV2, "title" | "description" | "expiresAt" | "fixedAmount" | "productIds" | "productLines">>,
): Promise<UpdateResult> {
  await mockLatency(500);
  const idx = links.findIndex((l) => l.id === id && l.merchantId === merchantId);
  if (idx === -1) return { ok: false, reason: "not-found" };
  if (links[idx].updatedAt !== expectedUpdatedAt) return { ok: false, reason: "conflict" };
  links[idx] = { ...links[idx], ...patch, updatedAt: new Date().toISOString() };
  return { ok: true, link: structuredClone(links[idx]) };
}

/** Lifecycle rules: a paid single-use link can never return to a usable state. */
export function canDeactivate(link: PaymentLinkV2): boolean {
  return link.lifecycle === "active";
}

export function canActivate(link: PaymentLinkV2): boolean {
  if (link.lifecycle === "inactive") return true;
  // Expired single-use links stay closed; reusable links may reopen.
  if (link.lifecycle === "expired") return link.type === "reusable";
  return false; // "paid" never returns
}

export async function setLifecycle(
  merchantId: string,
  id: string,
  next: "active" | "inactive",
): Promise<PaymentLinkV2 | null> {
  await mockLatency(450);
  const idx = links.findIndex((l) => l.id === id && l.merchantId === merchantId);
  if (idx === -1) return null;
  links[idx] = { ...links[idx], lifecycle: next, updatedAt: new Date().toISOString() };
  return structuredClone(links[idx]);
}

/** Orders of a given link owned by the merchant (ownership fence). */
export async function fetchLinkOrders(merchantId: string, linkId: string): Promise<OrderV2[]> {
  await mockLatency(350);
  return structuredClone(
    orders.filter(
      (o): o is OrderV2 => o.kind === "v2" && o.merchantId === merchantId && o.paymentLinkId === linkId,
    ),
  );
}

/** Single order inside a link context — both fences enforced. */
export async function fetchLinkOrder(
  merchantId: string,
  linkId: string,
  orderId: string,
): Promise<OrderV2 | null> {
  await mockLatency(300);
  const found = orders.find(
    (o): o is OrderV2 =>
      o.kind === "v2" && o.id === orderId && o.merchantId === merchantId && o.paymentLinkId === linkId,
  );
  return found ? structuredClone(found) : null;
}

export function publicPayUrl(identifier: string): string {
  return `${window.location.origin}/pay/${identifier}`;
}
