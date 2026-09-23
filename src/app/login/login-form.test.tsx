// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { LoginForm } from "./login-form";

afterEach(cleanup);

const dictionary = {
  fieldRequired: "Campo obrigatório",
  forgotPassword: "Esqueci minha senha",
  forgotPasswordNote: "Redefinir sua senha requer um link emitido por um administrador.",
  hidePassword: "Ocultar senha",
  invalidCredentials: "Nome de usuário ou senha inválidos.",
  loginHeading: "Entrar",
  loginIntroduction: "Acesse sua conta para gerenciar pagamentos.",
  passwordChangedSuccess: "Sua senha foi alterada.",
  passwordLabel: "Senha",
  showPassword: "Mostrar senha",
  signIn: "Entrar",
  signingIn: "Entrando",
  usernameLabel: "Nome de usuário",
};

describe("login form interaction", () => {
  it("toggles the password field between hidden and visible text", () => {
    render(<LoginForm dictionary={dictionary} invalidCredentials={false} passwordChanged={false} />);

    const passwordInput = document.getElementById("password") as HTMLInputElement;
    expect(passwordInput.type).toBe("password");

    const toggle = screen.getByRole("button", { name: dictionary.showPassword });
    fireEvent.click(toggle);

    expect(passwordInput.type).toBe("text");
    expect(screen.getByRole("button", { name: dictionary.hidePassword })).not.toBeNull();
  });

  it("shows the inline required copy for empty fields on submit and clears it once filled", () => {
    render(<LoginForm dictionary={dictionary} invalidCredentials={false} passwordChanged={false} />);

    const form = document.getElementById("login-form") as HTMLFormElement;
    fireEvent.submit(form);

    const requiredMessages = screen.getAllByText(dictionary.fieldRequired);
    expect(requiredMessages).toHaveLength(2);

    const usernameInput = document.getElementById("username") as HTMLInputElement;
    fireEvent.change(usernameInput, { target: { value: "merchant.one" } });

    expect(screen.getAllByText(dictionary.fieldRequired)).toHaveLength(1);
  });

  it("renders the forgot-password link noting an administrator-issued link is required", () => {
    render(<LoginForm dictionary={dictionary} invalidCredentials={false} passwordChanged={false} />);

    const link = screen.getByRole("link", { name: dictionary.forgotPassword });
    expect(link.getAttribute("href")).toBe("/reset-password");
    expect(screen.getByText(dictionary.forgotPasswordNote)).not.toBeNull();
  });
});
