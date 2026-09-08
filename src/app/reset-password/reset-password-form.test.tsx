// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ResetPasswordForm } from "./reset-password-form";

afterEach(cleanup);

const dictionary = {
  hidePassword: "Ocultar senha",
  resetPasswordConfirmPasswordLabel: "Confirmar nova senha",
  resetPasswordFailed: "Não foi possível redefinir a senha. Revise os campos e tente novamente.",
  resetPasswordHeading: "Redefinir senha",
  resetPasswordIntroduction: "Escolha uma nova senha para a sua conta.",
  resetPasswordLengthMeter: "{{len}} caracteres",
  resetPasswordMismatch: "As senhas não coincidem.",
  resetPasswordNewPasswordLabel: "Nova senha",
  resetPasswordRequirement: "Use de 12 a 128 caracteres.",
  resetPasswordSubmit: "Redefinir senha",
  resetPasswordSubmitting: "Redefinindo senha",
  showPassword: "Mostrar senha",
};

describe("reset password form meter and mismatch", () => {
  it("updates the live length meter as the new password is typed", () => {
    render(<ResetPasswordForm dictionary={dictionary} hasError={false} token="valid-token" />);

    expect(screen.getByText("0 caracteres")).not.toBeNull();

    const newPassword = document.getElementById("newPassword") as HTMLInputElement;
    fireEvent.change(newPassword, { target: { value: "short-pass" } });

    expect(screen.getByText("10 caracteres")).not.toBeNull();
  });

  it("flags a client mismatch once the confirmation diverges, and clears it once matched", () => {
    render(<ResetPasswordForm dictionary={dictionary} hasError={false} token="valid-token" />);

    const newPassword = document.getElementById("newPassword") as HTMLInputElement;
    const confirmation = document.getElementById("confirmation") as HTMLInputElement;

    fireEvent.change(newPassword, { target: { value: "correcthorsebattery" } });
    fireEvent.change(confirmation, { target: { value: "correcthorsebatteryX" } });

    expect(screen.getByText(dictionary.resetPasswordMismatch)).not.toBeNull();

    fireEvent.change(confirmation, { target: { value: "correcthorsebattery" } });

    expect(screen.queryByText(dictionary.resetPasswordMismatch)).toBeNull();
  });
});
