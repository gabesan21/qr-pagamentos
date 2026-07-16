import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionService } from "@/auth/session";
import { getDictionary } from "@/i18n/dictionaries";
import { getLocalePreferenceService } from "@/i18n/locale-preference";
import { LanguagePreferenceSubmit } from "./language-preference/language-preference-form";
import { Panel } from "./ui/panel";
import { Status } from "./ui/status";

export default async function Home({ searchParams }: Readonly<{ searchParams: Promise<{ language?: string }> }>) {
  const principal = await getSessionService().validate((await cookies()).get("qr_session")?.value);
  if (!principal) redirect("/login");
  const locale = await getLocalePreferenceService().resolve(principal.userId);
  const dictionary = getDictionary(locale);
  const notice = (await searchParams).language;
  return (
    <main>
      <h1>{dictionary.heading}</h1><p>{dictionary.introduction}</p>
      {notice === "saved" ? <Status label={dictionary.languageHeading} tone="success">{dictionary.languageSaved}</Status> : null}
      {notice === "error" ? <Status label={dictionary.languageHeading} tone="danger">{dictionary.languageError}</Status> : null}
      <Panel title={dictionary.languageHeading}>
        <form action="/language-preference" method="post">
          <label className="field__label" htmlFor="locale">{dictionary.languageLabel}</label>
          <select className="field__input" defaultValue={locale} id="locale" name="locale">
            <option value="pt-BR">Português (Brasil)</option><option value="en">English</option>
          </select>
          <LanguagePreferenceSubmit label={dictionary.languageSave} />
        </form>
      </Panel>
      <form action="/logout" method="post"><LanguagePreferenceSubmit label={dictionary.signOut} /></form>
    </main>
  );
}
