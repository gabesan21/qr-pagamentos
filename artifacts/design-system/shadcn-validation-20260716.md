# shadcn validation capture — 2026-07-16

`pnpm exec shadcn info` and `pnpm exec shadcn preset resolve --json` first
returned `getaddrinfo EAI_AGAIN ui.shadcn.com` in the restricted sandbox. The
approved unrestricted retry completed with these relevant results:

```text
Configuration
  style        radix-nova
  base         radix
  rsc          Yes
  tailwindCss  src/app/globals.css
  importAlias  @

Preset
  style        nova
  font         ibm-plex-sans
```

```json
{
  "code": "b5aq",
  "values": {
    "style": "nova",
    "baseColor": "neutral",
    "iconLibrary": "lucide",
    "font": "ibm-plex-sans"
  }
}
```

The CLI listed the complete owned inventory: alert, badge, button, card,
checkbox, field, input, label, native-select, separator, skeleton, spinner,
and table.
