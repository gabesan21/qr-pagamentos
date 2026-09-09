// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { en as dictionary } from "@/i18n/dictionaries/en";

import { CreateAccountModal } from "./create-account-modal";

afterEach(cleanup);

function openModal() {
  render(<CreateAccountModal dictionary={dictionary} />);
  fireEvent.click(screen.getByRole("button", { name: dictionary.adminCreate }));
}

describe("create account modal", () => {
  it("renders the byte-identical create form posting to the delivered route", () => {
    openModal();

    const form = document.querySelector("form") as HTMLFormElement;
    expect(form.getAttribute("action")).toBe("/admin/users");
    expect(form.getAttribute("method")).toBe("post");
    expect(document.querySelector('input[name="username"]')).not.toBeNull();
    expect(document.querySelector('input[name="email"]')).not.toBeNull();
    expect(document.querySelector('input[name="password"]')).not.toBeNull();
    expect(document.querySelector('input[name="role"]')).not.toBeNull();
  });

  it("generates a password via the browser's crypto API and reveals the strength meter and CopyField at 12+ characters", () => {
    // Deterministic generation: cycles a lowercase, an uppercase, a digit,
    // and a symbol index through the owned charset so the 18-character
    // result always satisfies every "strong" category, never a flake tied
    // to which characters a real random draw happened to produce.
    const charset = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789!@#$%";
    const targetIndexes = [charset.indexOf("a"), charset.indexOf("A"), charset.indexOf("2"), charset.indexOf("!")];
    vi.spyOn(crypto, "getRandomValues").mockImplementation((<T extends ArrayBufferView | null>(array: T) => {
      const view = array as unknown as Uint32Array;
      for (let index = 0; index < view.length; index += 1) view[index] = targetIndexes[index % targetIndexes.length];
      return array;
    }) as typeof crypto.getRandomValues);

    openModal();
    fireEvent.click(screen.getByRole("button", { name: dictionary.adminUsersDirectoryPasswordGenerate }));

    const passwordInput = document.querySelector('input[name="password"]') as HTMLInputElement;
    expect(passwordInput.value).toHaveLength(18);
    expect(screen.getByText(dictionary.adminUsersDirectoryPasswordStrengthStrong)).not.toBeNull();
    expect(screen.getByRole("button", { name: dictionary.adminUsersDirectoryCopyLabel })).not.toBeNull();

    vi.restoreAllMocks();
  });

  it("blocks submission and shows inline errors for a missing username or a short password", () => {
    openModal();

    const form = document.querySelector("form") as HTMLFormElement;
    const submitSpy = vi.fn((event: Event) => event.preventDefault());
    form.addEventListener("submit", submitSpy);
    fireEvent.submit(form);

    expect(screen.getByText(dictionary.adminUsersDirectoryUsernameRequired)).not.toBeNull();
    expect(screen.getByText(dictionary.adminUsersDirectoryPasswordTooShort)).not.toBeNull();
  });

  it("toggles the admin-local role segmented control between User and Administrator", () => {
    openModal();

    const roleInput = document.querySelector('input[name="role"]') as HTMLInputElement;
    expect(roleInput.value).toBe("USER");

    fireEvent.click(screen.getByRole("radio", { name: dictionary.adminAdministrator }));
    expect((document.querySelector('input[name="role"]') as HTMLInputElement).value).toBe("ADMIN");
  });
});
