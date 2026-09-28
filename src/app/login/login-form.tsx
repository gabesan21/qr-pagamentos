"use client";

import { EyeIcon, EyeOffIcon } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { BrandIdentity } from "@/brand/brand-identity";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { LoginSubmit } from "./login-submit";

type LoginFormDictionary = Readonly<{
  fieldRequired: string;
  forgotPassword: string;
  forgotPasswordNote: string;
  hidePassword: string;
  invalidCredentials: string;
  loginHeading: string;
  loginIntroduction: string;
  passwordChangedSuccess: string;
  passwordLabel: string;
  showPassword: string;
  signIn: string;
  signingIn: string;
  usernameLabel: string;
}>;

type LoginFormProps = Readonly<{
  dictionary: LoginFormDictionary;
  invalidCredentials: boolean;
  passwordChanged: boolean;
}>;

type RequiredFieldErrors = Readonly<{ username?: boolean; password?: boolean }>;

/**
 * The credentials form panel for `/login`, rendered inside the shared
 * `AuthCard`. Client-side progressive enhancement only: the native POST to
 * `/login/submit` keeps working with JavaScript disabled, but the form sets
 * `noValidate`, so the "required" copy shown inline is a client-side check —
 * with JS disabled, a blank submit reaches the server, which returns the
 * same generic invalid-credentials error.
 */
export function LoginForm({ dictionary, invalidCredentials, passwordChanged }: LoginFormProps) {
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<RequiredFieldErrors>({});
  const usernameRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (invalidCredentials) usernameRef.current?.focus();
  }, [invalidCredentials]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    const missingUsername = !usernameRef.current?.value.trim();
    const missingPassword = !passwordRef.current?.value;
    setFieldErrors({ username: missingUsername, password: missingPassword });
    if (missingUsername || missingPassword) {
      event.preventDefault();
      (missingUsername ? usernameRef.current : passwordRef.current)?.focus();
    }
  }

  return (
    <form action="/login/submit" className="grid gap-5" id="login-form" method="post" noValidate onSubmit={handleSubmit}>
      <CardHeader>
        <BrandIdentity className="auth-brand" variant="product-lockup" />
        <CardTitle className="text-2xl font-semibold leading-tight">{dictionary.loginHeading}</CardTitle>
        <CardDescription className="text-text-2">{dictionary.loginIntroduction}</CardDescription>
      </CardHeader>
      <CardContent>
        {invalidCredentials && (
          <Alert variant="destructive">
            <AlertDescription>{dictionary.invalidCredentials}</AlertDescription>
          </Alert>
        )}
        {passwordChanged && (
          <Alert role="status" variant="success">
            <AlertDescription>{dictionary.passwordChangedSuccess}</AlertDescription>
          </Alert>
        )}
        <FieldGroup>
          <Field data-invalid={fieldErrors.username || undefined}>
            <FieldLabel htmlFor="username">{dictionary.usernameLabel}</FieldLabel>
            <Input
              aria-invalid={fieldErrors.username || undefined}
              autoComplete="username"
              id="username"
              name="username"
              onChange={() => setFieldErrors((previous) => (previous.username ? { ...previous, username: false } : previous))}
              ref={usernameRef}
              required
            />
            {fieldErrors.username && <FieldError>{dictionary.fieldRequired}</FieldError>}
          </Field>
          <Field data-invalid={fieldErrors.password || undefined}>
            <FieldLabel htmlFor="password">{dictionary.passwordLabel}</FieldLabel>
            <div className="relative">
              <Input
                aria-invalid={fieldErrors.password || undefined}
                autoComplete="current-password"
                className="pe-(--control-icon-padding-inline)"
                id="password"
                name="password"
                onChange={() => setFieldErrors((previous) => (previous.password ? { ...previous, password: false } : previous))}
                ref={passwordRef}
                required
                type={showPassword ? "text" : "password"}
              />
              <Button
                aria-label={showPassword ? dictionary.hidePassword : dictionary.showPassword}
                className="absolute end-1 top-1/2 -translate-y-1/2"
                onClick={() => setShowPassword((value) => !value)}
                size="icon"
                type="button"
                variant="ghost"
              >
                {showPassword ? <EyeOffIcon aria-hidden="true" /> : <EyeIcon aria-hidden="true" />}
              </Button>
            </div>
            {fieldErrors.password && <FieldError>{dictionary.fieldRequired}</FieldError>}
          </Field>
        </FieldGroup>
      </CardContent>
      <div className="flex flex-col items-stretch gap-4 px-(--card-spacing)">
        <LoginSubmit label={dictionary.signIn} pendingLabel={dictionary.signingIn} />
        <p className="m-0 text-center">
          <a className="text-sm font-medium text-text-2 hover:text-text hover:underline" href="/reset-password">
            {dictionary.forgotPassword}
          </a>
        </p>
      </div>
    </form>
  );
}
