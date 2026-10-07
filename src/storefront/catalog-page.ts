// Pure client-side pagination over the already server-bounded storefront
// snapshot. The whole snapshot must reach the browser for cart hydration and
// totals, so paging only decides what renders; it never queries. This is not
// the cursor/URL pagination of the data directory. Type-only import: the
// server-only projection module never enters the client bundle.

import type { PublicStorefrontCatalogGroup } from "./public-storefront";

export const STOREFRONT_PAGE_SIZE = 12;

export type StorefrontCatalogPage = Readonly<{
  groups: readonly PublicStorefrontCatalogGroup[];
  page: number;
  pageCount: number;
}>;

// Slices the flattened product order (named groups in server order, the
// uncategorized group last) and regroups the slice. A group that spans a page
// boundary appears on both pages with its name; groups with no product on the
// page are omitted. An out-of-range or non-finite page clamps into range.
export function paginateStorefrontCatalog(
  catalog: readonly PublicStorefrontCatalogGroup[],
  requestedPage: number,
  pageSize: number = STOREFRONT_PAGE_SIZE,
): StorefrontCatalogPage {
  const total = catalog.reduce((count, group) => count + group.products.length, 0);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(Math.trunc(requestedPage) || 1, 1), pageCount);
  const start = (page - 1) * pageSize;
  const end = start + pageSize;

  const groups: PublicStorefrontCatalogGroup[] = [];
  let offset = 0;
  for (const group of catalog) {
    const from = Math.max(start - offset, 0);
    const to = Math.min(end - offset, group.products.length);
    offset += group.products.length;
    if (to > from) groups.push({ name: group.name, products: group.products.slice(from, to) });
    if (offset >= end) break;
  }
  return { groups, page, pageCount };
}
