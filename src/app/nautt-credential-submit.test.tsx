import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { NauttCredentialSubmit } from "./nautt-credential-submit";

describe("Nautt credential submit control", () => {
  it.each([
    ["credential-form", "Connect account", "Connecting account"],
    ["registration-form", "Complete setup", "Completing setup"],
  ])("renders the real native control for %s before submission", (form, label, pendingLabel) => {
    const markup = renderToStaticMarkup(<NauttCredentialSubmit form={form} label={label} pendingLabel={pendingLabel} />);
    expect(markup).toContain(`form="${form}"`);
    expect(markup).toContain('type="submit"');
    expect(markup).toContain("data-nautt-action-control");
    expect(markup).toContain(label);
    expect(markup).not.toContain(pendingLabel);
    expect(markup).not.toContain('aria-busy="true"');
    expect(markup).not.toContain('disabled=""');
    expect(markup).not.toContain('data-slot="spinner"');
  });
});
