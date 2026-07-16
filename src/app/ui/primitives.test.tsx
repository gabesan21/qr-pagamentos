import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ActionButton } from "./action-button";
import { Field } from "./field";
import { Panel } from "./panel";
import { Status } from "./status";

describe("admin primitives", () => {
  it("renders primary, loading, and disabled button states without a duplicate variant", () => {
    const markup = renderToStaticMarkup(<><ActionButton type="button">Save</ActionButton><ActionButton loading type="button">Save</ActionButton><ActionButton disabled tone="secondary" type="button">Review</ActionButton></>);
    expect(markup).toContain("action-button--primary");
    expect(markup).toContain("aria-busy=\"true\"");
    expect(markup).toContain("disabled=\"\"");
    expect(markup).toContain("action-button--secondary");
  });

  it("associates fields with labels, help, and error recovery information", () => {
    const markup = renderToStaticMarkup(<Field error="Reference required" id="receipt" label="Receipt reference" />);
    expect(markup).toContain("for=\"receipt\"");
    expect(markup).toContain("aria-invalid=\"true\"");
    expect(markup).toContain("role=\"alert\"");
  });

  it("renders semantic status facts and panel empty/error content", () => {
    const markup = renderToStaticMarkup(<Panel title="Review"><Status label="Attention" tone="danger">Retry the request</Status><p>No receipts need review.</p></Panel>);
    expect(markup).toContain("status--danger");
    expect(markup).toContain("Retry the request");
    expect(markup).toContain("No receipts need review.");
  });
});
