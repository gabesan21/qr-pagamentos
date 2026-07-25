import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { ESLint } from "eslint";

const root = process.cwd();

function requireSource(source, pattern, message) {
  if (!pattern.test(source)) throw new Error(message);
}

const [eslintConfig, tsconfig, loginPage, loginSubmit, loginRoute, loginEvidence, merchantHomePage, merchantShellContext, ownerGuard, rootLayout, designSystemPage, languageRoute] = await Promise.all([
  readFile(join(root, "eslint.config.mjs"), "utf8"),
  readFile(join(root, "tsconfig.json"), "utf8"),
  readFile(join(root, "src/app/login/page.tsx"), "utf8"),
  readFile(join(root, "src/app/login/login-submit.tsx"), "utf8"),
  readFile(join(root, "src/app/login/submit/route.ts"), "utf8"),
  readFile(join(root, "tests/login.evidence.spec.ts"), "utf8"),
  readFile(join(root, "src/app/(merchant)/page.tsx"), "utf8"),
  readFile(join(root, "src/app/(merchant)/shell-context.ts"), "utf8"),
  readFile(join(root, "src/app/owner-guard.ts"), "utf8"),
  readFile(join(root, "src/app/layout.tsx"), "utf8"),
  readFile(join(root, "src/app/design-system/page.tsx"), "utf8"),
  readFile(join(root, "src/app/language-preference/route.ts"), "utf8"),
]);

requireSource(eslintConfig, /["']pop\/worktrees\/\*\*["']/, "ESLint does not ignore only generated PoP worktrees.");
const eslint = new ESLint({ cwd: root });
if (!(await eslint.isPathIgnored(join(root, "pop/worktrees/roadmap/source.ts")))) {
  throw new Error("A source nested under pop/worktrees remains lint-visible.");
}
if (await eslint.isPathIgnored(join(root, "scripts/epoch1-lint-control.ts"))) {
  throw new Error("The lint control path outside pop/worktrees is unexpectedly ignored.");
}

requireSource(tsconfig, /"exclude"\s*:\s*\[\s*"node_modules"\s*,\s*"pop\/worktrees"\s*\]/, "tsconfig.json does not exclude generated PoP worktrees.");

requireSource(loginPage, /<form\s+action="\/login\/submit"[^>]*method="post"/, "Login no longer uses the native unprefixed POST form.");
requireSource(loginSubmit, /addEventListener\("submit"/, "Login submit no longer observes the native submit event.");
requireSource(loginSubmit, /removeEventListener\("submit"/, "Login submit observation no longer cleans up its listener.");
for (const forbidden of [/preventDefault\(/, /\bfetch\(/, /useFormStatus/, /useActionState/]) {
  if (forbidden.test(loginSubmit)) throw new Error(`Login submit contains forbidden behavior: ${forbidden}`);
}
requireSource(loginEvidence, /\["click",\s*"enter"\]/, "Login evidence no longer covers click and Enter submission.");
requireSource(loginEvidence, /page\.route\("\*\*\/login\/submit"/, "Login evidence no longer delays the native POST response.");
requireSource(loginEvidence, /busy:\s*"true"[\s\S]*disabled:\s*true[\s\S]*spinners:\s*1/, "Login evidence no longer asserts the pending state.");

requireSource(merchantHomePage, /requireMerchantShellContext\(/, "home page no longer rechecks the active principal.");
requireSource(merchantShellContext, /requireOwnerFromCookie\(/, "merchant shell context no longer routes through the owner guard.");
requireSource(ownerGuard, /getAuthorizationService\(\)\.requireUser\(/, "owner guard no longer rechecks the active principal.");
if (/getSessionService\(\)\.validate\(/.test(ownerGuard)) throw new Error("owner guard bypasses status-aware authorization.");

for (const [name, source] of [["login route", loginRoute], ["root layout", rootLayout], ["design-system page", designSystemPage], ["language route", languageRoute]]) {
  requireSource(source, /getAuthorizationService\(\)\.resolve\(/, `${name} no longer rechecks the active principal.`);
  if (/getSessionService\(\)\.validate\(/.test(source)) throw new Error(`${name} bypasses status-aware authorization.`);
}

console.log("EPOCH1_SOURCE_OK eslint_worktrees=ignored tsconfig_worktrees=excluded eslint_control=visible login_post=native pending=click+enter authorization=status-aware");
