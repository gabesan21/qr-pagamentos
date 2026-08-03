type TemplateAssetSource = Readonly<{
  parityId: `asset:${string}`;
  sourcePath: `docs/template/app/public/${string}.svg`;
  bytes: number;
  sha256: string;
  intrinsic: Readonly<{ width: number; height: number }>;
  role: string;
}>;

export const templateAssetAuthorization = {
  recordedAt: "2026-08-02",
  sourceCommit: "813f0cd7",
  originStatement: "Os assets foram todos construídos para nosso projeto",
  projectUseAuthorized: true,
  authorship: "not-asserted",
  exclusivity: "not-asserted",
  license: "not-inferred",
} as const;

export const soraWordmarkSource = {
  family: "Sora",
  weight: 700,
  sourcePath: "node_modules/@fontsource/sora/files/sora-latin-700-normal.woff2",
  sourceSha256: "c3337a673c9bbbfe433091d3831714dd9a257951f16f41eb3fc650ec593cfac2",
  licensePath: "src/design-system/fonts/LICENSES/Sora-OFL-1.1.txt",
  licenseSha256: "1ec9623d38c445eb4dfe5fcc783e0f0ee728cc97ca157ce1f8cb2b3bf9d9b0d9",
  outlinePath: "src/brand/wordmark.outlines.svg",
  outlineSha256: "0a10c25c86bf7ba6edc9d176c7f18a6940e355f19c8d1b02188809d0b5a3de9b",
  tool: "woff2_decompress + Pango/Cairo 1.58.0",
  settings: "Sora 700 at 15px with -0.3px tracking; QR Pagamentos converted to SVG outlines",
} as const;

export const templateAssetSources = [
  { parityId: "asset:824c7f9692a86081", sourcePath: "docs/template/app/public/auth-texture.svg", bytes: 23349, sha256: "747a89c02c2a8b4c2715d80ffcf43f722f0dcf4c90005cb17365fb034029c321", intrinsic: { width: 480, height: 480 }, role: "decorative auth texture" },
  { parityId: "asset:b184c76c76b9f75f", sourcePath: "docs/template/app/public/avatar-default.svg", bytes: 284, sha256: "4e99294b7a3e73cd929d23213fba68419fbb57c10485435539e0e826b5783651", intrinsic: { width: 96, height: 96 }, role: "application avatar fallback" },
  { parityId: "asset:3fc36185f375758e", sourcePath: "docs/template/app/public/checkout-success.svg", bytes: 687, sha256: "251486b5fec604a7535d34eeb5261d82741677ea5fad77436cca206f172e8a10", intrinsic: { width: 200, height: 200 }, role: "decorative success illustration" },
  { parityId: "asset:852a445b58a8d7b6", sourcePath: "docs/template/app/public/empty-links.svg", bytes: 887, sha256: "1368d26d05d0f0300bcb6d0e5f53754bfd915dfa44ad7e9000825929c890cbb5", intrinsic: { width: 192, height: 192 }, role: "decorative empty illustration" },
  { parityId: "asset:bc3c65e381577527", sourcePath: "docs/template/app/public/empty-orders.svg", bytes: 774, sha256: "2c2b846844e30ed9a9f4f1e9cbab82e8c7b74f88b6aa4ee7950daf3412cc3552", intrinsic: { width: 192, height: 192 }, role: "decorative empty illustration" },
  { parityId: "asset:1b445e01c0e9515b", sourcePath: "docs/template/app/public/empty-products.svg", bytes: 690, sha256: "231d383453c9efa287a111f80107a870d2f9f8c7145ab46b28003b184cf38e2e", intrinsic: { width: 192, height: 192 }, role: "decorative empty illustration" },
  { parityId: "asset:81edd9e9e786cfa8", sourcePath: "docs/template/app/public/empty-users.svg", bytes: 599, sha256: "b9ceacceac20e65f865d03210bccaae08eb074134778148e39a464fdccf23c9e", intrinsic: { width: 192, height: 192 }, role: "decorative empty illustration" },
  { parityId: "asset:3510a147f97bf807", sourcePath: "docs/template/app/public/logo.svg", bytes: 853, sha256: "09ad66faf15620e224a15913b77e8ac4df04f7a2defe2628aff31e2592db6e35", intrinsic: { width: 160, height: 32 }, role: "canonical mark and lockup target" },
  { parityId: "asset:6d5afe0fe3f49398", sourcePath: "docs/template/app/public/product-fallback.svg", bytes: 444, sha256: "47650b0cc5b93ff81941fb43a1859320991f345bace416386fd25818a52b965b", intrinsic: { width: 400, height: 400 }, role: "application product fallback" },
  { parityId: "asset:9347e7da43396922", sourcePath: "docs/template/app/public/store-logo-fallback.svg", bytes: 462, sha256: "e489298cbad3128539111f3f446abf489bbb2230902165d8fd991df7c5a900e2", intrinsic: { width: 128, height: 128 }, role: "application-owned merchant-logo fallback" },
  { parityId: "asset:fbd688b3e7a7dd01", sourcePath: "docs/template/app/public/theme-swatch-cashier-daylight.svg", bytes: 507, sha256: "1f37c52d78b8557fb781fc168dca61a813463a032896ef6031577afb87749e37", intrinsic: { width: 96, height: 64 }, role: "cashier-daylight swatch" },
  { parityId: "asset:621055b6f06e5c69", sourcePath: "docs/template/app/public/theme-swatch-midnight-clearing.svg", bytes: 507, sha256: "e5036efaad4a7574baa6baa6df662f8398e3de82524f202b9ac9a4ecf880b85c", intrinsic: { width: 96, height: 64 }, role: "midnight-clearing swatch" },
  { parityId: "asset:b81953495d3b9cce", sourcePath: "docs/template/app/public/theme-swatch-pix-paper.svg", bytes: 507, sha256: "90bb72fdcd1adc1c4a3307641914a8097bd2e90fe0e667e6d805a7f36c9cfb88", intrinsic: { width: 96, height: 64 }, role: "pix-paper swatch" },
  { parityId: "asset:378a764eddcd0b72", sourcePath: "docs/template/app/public/theme-swatch-settlement-sand.svg", bytes: 507, sha256: "a6cdd2447fc1dfce2ad951ab391f932611284e8e8ca638cb32b3305d4c3c9630", intrinsic: { width: 96, height: 64 }, role: "settlement-sand swatch" },
  { parityId: "asset:b6bcb6e7c1cf6a19", sourcePath: "docs/template/app/public/theme-swatch-terminal-amber.svg", bytes: 507, sha256: "e72c58c15d3b2f036dfd90ca7ae41fdf97fa05cc517009daede3447ee33acff7", intrinsic: { width: 96, height: 64 }, role: "terminal-amber swatch" },
  { parityId: "asset:d8a3f91e375a1691", sourcePath: "docs/template/app/public/theme-swatch-vault-blue.svg", bytes: 507, sha256: "f7e481a3772064950e3566b7244d2c05db2c0c5e60857e6d7e3bcf0f1e458720", intrinsic: { width: 96, height: 64 }, role: "vault-blue swatch" },
  { parityId: "asset:098d6809ca3c1a7e", sourcePath: "docs/template/app/public/unavailable.svg", bytes: 472, sha256: "2031a1adbb192d76b9e8237734611cf018353080df7bd0946022ef953f86e961", intrinsic: { width: 192, height: 192 }, role: "decorative unavailable illustration" },
] as const satisfies readonly TemplateAssetSource[];
