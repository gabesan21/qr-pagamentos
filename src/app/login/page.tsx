import { getDictionary } from "@/i18n/dictionaries";
import { defaultLocale } from "@/i18n/locales";

export default async function LoginPage({ searchParams }: Readonly<{ searchParams: Promise<{ error?: string }> }>) {
  const dictionary = getDictionary(defaultLocale);
  const error = (await searchParams).error === "invalid-credentials";
  return <main><h1>{dictionary.loginHeading}</h1>{error && <p role="alert">{dictionary.invalidCredentials}</p>}<form action="/login/submit" method="post"><label htmlFor="username">{dictionary.usernameLabel}</label><input id="username" name="username" autoComplete="username" required /><label htmlFor="password">{dictionary.passwordLabel}</label><input id="password" name="password" type="password" autoComplete="current-password" required /><button type="submit">{dictionary.signIn}</button></form></main>;
}
