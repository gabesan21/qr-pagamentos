import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  AccountStateBadge,
  EntityStateBadge,
  LinkLifecycleBadge,
  LocalOutcomeBadge,
  ProviderStateBadge,
  StatusBadge,
  type StatusTone,
} from "./status-badge";

/** Mirrors the component's own tone map so assertions check rendered classes, not implementation. */
const toneClasses: Readonly<Record<StatusTone, string>> = {
  danger: "bg-danger-soft text-danger",
  info: "bg-info-soft text-info",
  neutral: "bg-surface-2 text-text-2",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
};

function expectDotMarker(markup: string) {
  expect(markup).toContain('aria-hidden="true"');
  expect(markup).toContain("bg-current");
}

function expectArchiveMarker(markup: string) {
  expect(markup).toContain("lucide-archive");
}

describe("StatusBadge", () => {
  it.each(["danger", "info", "neutral", "success", "warning"] as const)("renders %s with text and a non-color dot marker", (tone) => {
    const markup = renderToStaticMarkup(<StatusBadge label={`${tone} status`} tone={tone} />);
    expect(markup).toContain(`${tone} status`);
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).toContain("bg-current");
  });

  it("uses an archive icon and strike-through in the archived state", () => {
    const markup = renderToStaticMarkup(<StatusBadge archived label="Archived" />);
    expect(markup).toContain("lucide-archive");
    expect(markup).toContain("line-through");
  });
});

describe("ProviderStateBadge", () => {
  const labels = {
    cancelled: "Cancelled",
    confirmed: "Confirmed",
    created: "Created",
    expired: "Expired",
    indeterminate: "Indeterminate",
    pending: "Pending",
    refunded: "Refunded",
    rejected: "Rejected",
  } as const;
  const toneByState = {
    cancelled: "danger",
    confirmed: "success",
    created: "info",
    expired: "danger",
    indeterminate: "warning",
    pending: "info",
    refunded: "neutral",
    rejected: "danger",
  } as const;

  it.each(Object.keys(labels) as (keyof typeof labels)[])("renders the caller label and tone for %s", (state) => {
    const markup = renderToStaticMarkup(<ProviderStateBadge labels={labels} state={state} />);
    expect(markup).toContain(labels[state]);
    expect(markup).toContain(toneClasses[toneByState[state]]);
    expectDotMarker(markup);
  });
});

describe("LocalOutcomeBadge", () => {
  const labels = { finalized: "Finalized", "in-progress": "In progress", none: "None" } as const;
  const toneByOutcome = { finalized: "success", "in-progress": "info", none: "neutral" } as const;

  it.each(Object.keys(labels) as (keyof typeof labels)[])("renders the caller label and tone for %s", (outcome) => {
    const markup = renderToStaticMarkup(<LocalOutcomeBadge labels={labels} outcome={outcome} />);
    expect(markup).toContain(labels[outcome]);
    expect(markup).toContain(toneClasses[toneByOutcome[outcome]]);
    expectDotMarker(markup);
  });
});

describe("LinkLifecycleBadge", () => {
  const labels = { active: "Active", expired: "Expired", inactive: "Inactive", paid: "Paid" } as const;
  const toneByLifecycle = { active: "success", expired: "danger", inactive: "neutral", paid: "info" } as const;

  it.each(Object.keys(labels) as (keyof typeof labels)[])("renders the caller label and tone for %s", (lifecycle) => {
    const markup = renderToStaticMarkup(<LinkLifecycleBadge labels={labels} lifecycle={lifecycle} />);
    expect(markup).toContain(labels[lifecycle]);
    expect(markup).toContain(toneClasses[toneByLifecycle[lifecycle]]);
    expectDotMarker(markup);
  });
});

describe("AccountStateBadge", () => {
  const labels = { active: "Active", deleted: "Deleted", disabled: "Disabled" } as const;
  const toneByState = { active: "success", deleted: "danger", disabled: "warning" } as const;

  it.each(Object.keys(labels) as (keyof typeof labels)[])("renders the caller label and tone for %s", (state) => {
    const markup = renderToStaticMarkup(<AccountStateBadge labels={labels} state={state} />);
    expect(markup).toContain(labels[state]);
    expect(markup).toContain(toneClasses[toneByState[state]]);
    expectDotMarker(markup);
  });

  it("does not strike through the username for a non-deleted state", () => {
    const markup = renderToStaticMarkup(<AccountStateBadge labels={labels} state="active" username="alice" />);
    expect(markup).not.toContain("line-through");
  });

  it("omits the username entirely when none is supplied for a deleted account", () => {
    const markup = renderToStaticMarkup(<AccountStateBadge labels={labels} state="deleted" />);
    expect(markup).not.toContain("line-through");
  });

  it("strikes through the username alongside the badge when the account is deleted", () => {
    const markup = renderToStaticMarkup(<AccountStateBadge labels={labels} state="deleted" username="bob" />);
    expect(markup).toContain("line-through");
    expect(markup).toContain("bob");
    expect(markup).toContain(labels.deleted);
    expect(markup).toContain(toneClasses.danger);
  });
});

describe("EntityStateBadge", () => {
  const labels = { active: "Active", archived: "Archived", inactive: "Inactive" } as const;
  const toneByState = { active: "success", archived: "neutral", inactive: "neutral" } as const;

  it.each((Object.keys(labels) as (keyof typeof labels)[]).filter((state) => state !== "archived"))(
    "renders the caller label, tone, and dot marker for %s",
    (state) => {
      const markup = renderToStaticMarkup(<EntityStateBadge labels={labels} state={state} />);
      expect(markup).toContain(labels[state]);
      expect(markup).toContain(toneClasses[toneByState[state]]);
      expectDotMarker(markup);
    },
  );

  it("renders the archive icon and strikes through the label in the archived state", () => {
    const markup = renderToStaticMarkup(<EntityStateBadge labels={labels} state="archived" />);
    expect(markup).toContain(labels.archived);
    expect(markup).toContain(toneClasses.neutral);
    expect(markup).toContain("line-through");
    expectArchiveMarker(markup);
  });
});
