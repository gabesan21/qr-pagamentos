import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionService } from "@/auth/session";
import { getDictionary } from "@/i18n/dictionaries";
import { getLocalePreferenceService } from "@/i18n/locale-preference";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { LanguagePreferenceSubmit } from "./language-preference/language-preference-form";

export default async function Home({ searchParams }: Readonly<{ searchParams: Promise<{ language?: string }> }>) {
  const principal = await getSessionService().validate((await cookies()).get("qr_session")?.value);
  if (!principal) redirect("/login");
  const locale = await getLocalePreferenceService().resolve(principal.userId);
  const dictionary = getDictionary(locale);
  const notice = (await searchParams).language;
  return (
    <main>
      <h1>{dictionary.heading}</h1><p>{dictionary.introduction}</p>
      {notice === "saved" ? <Alert role="status" variant="success"><AlertTitle>{dictionary.languageHeading}</AlertTitle><AlertDescription>{dictionary.languageSaved}</AlertDescription></Alert> : null}
      {notice === "error" ? <Alert variant="destructive"><AlertTitle>{dictionary.languageHeading}</AlertTitle><AlertDescription>{dictionary.languageError}</AlertDescription></Alert> : null}
      <Card>
        <CardHeader><CardTitle>{dictionary.languageHeading}</CardTitle><CardDescription>{dictionary.adminLanguageDescription}</CardDescription></CardHeader>
        <CardContent>
        <form action="/language-preference" method="post">
          <FieldGroup><Field><FieldLabel htmlFor="locale">{dictionary.languageLabel}</FieldLabel><NativeSelect defaultValue={locale} id="locale" name="locale"><NativeSelectOption value="pt-BR">Português (Brasil)</NativeSelectOption><NativeSelectOption value="en">English</NativeSelectOption></NativeSelect></Field><LanguagePreferenceSubmit label={dictionary.languageSave} /></FieldGroup>
        </form>
        </CardContent>
      </Card>
      <form action="/logout" method="post"><LanguagePreferenceSubmit label={dictionary.signOut} /></form>
    </main>
  );
}
