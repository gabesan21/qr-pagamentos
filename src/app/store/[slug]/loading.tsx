import { CardSkeleton, TableSkeleton } from "@/components/ui/skeletons";
import { getDictionary } from "@/i18n/dictionaries";
import { defaultLocale } from "@/i18n/locales";

export default function PublicStorefrontLoading() {
  const dictionary = getDictionary(defaultLocale);

  return (
    <main aria-busy="true" className="storefront-shell" role="status">
      <CardSkeleton label={dictionary.storefrontProductsHeading} />
      <TableSkeleton columns={3} label={dictionary.storefrontProductsHeading} rows={6} />
      <CardSkeleton label={dictionary.storefrontCartHeading} />
    </main>
  );
}
