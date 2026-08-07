export const brandGeometry = {
  viewBox: "0 0 32 32",
  finderPatterns: [
    { x: 0, y: 0 },
    { x: 20, y: 0 },
    { x: 0, y: 20 },
  ],
  rectangles: [
    { x: 16, y: 4, width: 3, height: 3 },
    { x: 4, y: 16, width: 3, height: 3 },
    { x: 10, y: 16, width: 3, height: 3 },
    { x: 16, y: 16, width: 3, height: 3 },
    { x: 22, y: 16, width: 3, height: 3 },
    { x: 16, y: 22, width: 3, height: 3 },
    { x: 16, y: 28, width: 3, height: 3 },
    { x: 28, y: 22, width: 3, height: 3 },
    { x: 28, y: 28, width: 3, height: 3 },
  ],
} as const;

export const brandIdentityIds = [
  "mark-only",
  "product-lockup",
  "compact-role-lockup",
  "merchant-fallback",
] as const;

export type BrandIdentityId = (typeof brandIdentityIds)[number];
