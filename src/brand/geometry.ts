export const brandGeometry = {
  viewBox: "0 0 48 48",
  rectangles: [
    { x: 4, y: 4, width: 18, height: 6 },
    { x: 4, y: 10, width: 6, height: 12 },
    { x: 26, y: 4, width: 18, height: 6 },
    { x: 38, y: 10, width: 6, height: 12 },
    { x: 4, y: 26, width: 6, height: 18 },
    { x: 10, y: 38, width: 12, height: 6 },
    { x: 20, y: 20, width: 8, height: 8 },
    { x: 26, y: 32, width: 18, height: 4 },
    { x: 32, y: 26, width: 4, height: 18 },
    { x: 40, y: 40, width: 4, height: 4 },
  ],
} as const;

export const brandIdentityIds = [
  "mark-only",
  "product-lockup",
  "compact-role-lockup",
  "merchant-fallback",
] as const;

export type BrandIdentityId = (typeof brandIdentityIds)[number];
