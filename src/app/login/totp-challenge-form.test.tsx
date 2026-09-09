// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

const { useFormStatus } = vi.hoisted(() => ({ useFormStatus: vi.fn(() => ({ pending: false })) }))
vi.mock("react-dom", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-dom")>()),
  useFormStatus,
}))

import { TotpChallengeForm } from "./totp-challenge-form"

class TotpResizeObserver {
  disconnect() {}
  observe() {}
  unobserve() {}
}
globalThis.ResizeObserver = TotpResizeObserver
Object.defineProperty(document, "elementFromPoint", { configurable: true, value: () => null })

const dictionary = {
  backToCredentials: "Voltar às credenciais",
  mfaHeading: "Autenticação em dois fatores",
  mfaIntroduction: "Informe o código do seu aplicativo autenticador ou um código de recuperação.",
  mfaCodeLabel: "Código de autenticação",
  mfaRecoveryCodeLabel: "Código de recuperação",
  mfaRecoveryLink: "Usar um código de recuperação",
  mfaTotpLink: "Usar código do autenticador",
  mfaSubmit: "Verificar",
  mfaSubmitting: "Verificando",
  mfaFailed: "O código é inválido ou expirou. Tente novamente.",
}

afterEach(async () => {
  cleanup()
  // input-otp schedules uncancelled timers on value/focus changes.
  await new Promise((resolve) => setTimeout(resolve, 100))
})

describe("TOTP six-cell challenge", () => {
  it("renders six digit-only slots and a Back link to /login", () => {
    render(<TotpChallengeForm dictionary={dictionary} failed={false} />)

    expect(document.querySelectorAll('[data-slot="input-otp-slot"]')).toHaveLength(6)
    const input = document.querySelector('[data-slot="input-otp"]') as HTMLInputElement
    expect(input.getAttribute("pattern")).toBe("^\\d+$")
    expect(input.getAttribute("inputMode")).toBe("numeric")

    const backLink = screen.getByRole("link", { name: dictionary.backToCredentials })
    expect(backLink.getAttribute("href")).toBe("/login")
  });

  it("auto-submits only once all six digits are entered, not before", async () => {
    const user = userEvent.setup()
    const submitSpy = vi.fn((event: Event) => event.preventDefault())
    render(<TotpChallengeForm dictionary={dictionary} failed={false} />)

    const form = document.getElementById("totp-challenge-form") as HTMLFormElement
    form.addEventListener("submit", submitSpy)
    const input = document.querySelector('[data-slot="input-otp"]') as HTMLInputElement

    await user.click(input)
    await user.keyboard("12345")
    expect(submitSpy).not.toHaveBeenCalled()

    await user.keyboard("6")
    expect(submitSpy).toHaveBeenCalledTimes(1)
  });

  it("fills all six cells from a single paste", async () => {
    const user = userEvent.setup()
    render(<TotpChallengeForm dictionary={dictionary} failed={false} />)

    const input = document.querySelector('[data-slot="input-otp"]') as HTMLInputElement
    await user.click(input)
    await user.paste("654321")

    expect(document.querySelector('[data-slot="input-otp"]')?.getAttribute("value")).toBe("654321")
  });
})
