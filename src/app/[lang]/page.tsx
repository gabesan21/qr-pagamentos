import { notFound } from "next/navigation";

import { getDictionary } from "@/i18n/dictionaries";
import { isSupportedLocale, supportedLocales } from "@/i18n/locales";

export function generateStaticParams() {
  return supportedLocales.map((lang) => ({ lang }));
}

export default async function LocalePage({
  params,
}: Readonly<{ params: Promise<{ lang: string }> }>) {
  const { lang } = await params;

  if (!isSupportedLocale(lang)) {
    notFound();
  }

  const dictionary = getDictionary(lang);

  return (
    <main>
      <h1>{dictionary.heading}</h1>
      <p>{dictionary.introduction}</p>
      <form action={`/${lang}/logout`} method="post"><button type="submit">{dictionary.signOut}</button></form>
    </main>
  );
}
