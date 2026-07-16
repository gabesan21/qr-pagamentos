import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionService } from "@/auth/session";
import { getDictionary } from "@/i18n/dictionaries";
import { getLocalePreferenceService } from "@/i18n/locale-preference";

export default async function Home({ searchParams }: Readonly<{ searchParams: Promise<{ language?: string }> }>) {
  const principal = await getSessionService().validate((await cookies()).get("qr_session")?.value);
  if (!principal) redirect("/login");
  const locale = await getLocalePreferenceService().resolve(principal.userId);
  const dictionary = getDictionary(locale);
  const notice = (await searchParams).language;
  return (
    <main>
      <h1>{dictionary.heading}</h1><p>{dictionary.introduction}</p>
      {notice === "saved" && <p role="status">{dictionary.languageSaved}</p>}
      {notice === "error" && <p role="alert">{dictionary.languageError}</p>}
      <section aria-labelledby="language-heading"><h2 id="language-heading">{dictionary.languageHeading}</h2><form action="/language-preference" method="post"><label htmlFor="locale">{dictionary.languageLabel}</label><select id="locale" name="locale" defaultValue={locale}><option value="pt-BR">Português (Brasil)</option><option value="en">English</option></select><button type="submit">{dictionary.languageSave}</button></form></section>
      <form action="/logout" method="post"><button type="submit">{dictionary.signOut}</button></form>
    </main>
  );
}
