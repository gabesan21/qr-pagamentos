import { describe, expect, it, vi } from "vitest";

import {
  accountMutationIntent,
  reduceAccountMutation,
  synchronizeAccountMutationFocus,
  type AccountMutationState,
} from "./account-mutation-form";

describe("account mutation confirmation", () => {
  it.each([
    { current: "ADMIN", destructive: "USER", label: "demotion" },
    { current: "ACTIVE", destructive: "DISABLED", label: "disablement" },
  ])("requires, cancels, and resets $label confirmation deterministically", ({ current, destructive }) => {
    const initial: AccountMutationState = { confirmationOpen: false, selectedValue: current };
    const selected = reduceAccountMutation(initial, { type: "select", value: destructive });
    expect(accountMutationIntent(selected, current, destructive)).toBe("confirm");

    const confirming = reduceAccountMutation(selected, { type: "open-confirmation" });
    expect(confirming).toEqual({ confirmationOpen: true, selectedValue: destructive });
    expect(reduceAccountMutation(confirming, { type: "cancel" })).toEqual({ confirmationOpen: false, selectedValue: destructive });

    const reset = reduceAccountMutation(confirming, { type: "select", value: current });
    expect(reset).toEqual(initial);
    expect(accountMutationIntent(reset, current, destructive)).toBe("submit");
  });

  it("hands focus to cancellation and restores the destructive trigger", () => {
    const cancel = { focus: vi.fn() };
    const trigger = { focus: vi.fn() };

    synchronizeAccountMutationFocus(true, false, cancel, trigger);
    expect(cancel.focus).toHaveBeenCalledOnce();
    expect(trigger.focus).not.toHaveBeenCalled();

    synchronizeAccountMutationFocus(false, true, cancel, trigger);
    expect(trigger.focus).toHaveBeenCalledOnce();
  });
});
