import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { getDictionary } from "@/i18n/dictionaries";

type Dictionary = ReturnType<typeof getDictionary>;

function Notice({ description, failed, title }: Readonly<{ description: string; failed: boolean; title: string }>) {
  return (
    <Alert role={failed ? "alert" : "status"} variant={failed ? "destructive" : "success"}>
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{description}</AlertDescription>
    </Alert>
  );
}

export function ProductNotice({ dictionary, notice }: Readonly<{ dictionary: Dictionary; notice: string }>) {
  if (notice === "conflict") {
    return <Notice description={dictionary.adminProductConflict} failed title={dictionary.adminErrorHeading} />;
  }
  if (notice === "failed") {
    return <Notice description={dictionary.adminProductMutationFailed} failed title={dictionary.adminErrorHeading} />;
  }
  return <Notice description={dictionary.adminProductChanged} failed={false} title={dictionary.adminSuccessHeading} />;
}

export function CategoryNotice({ dictionary, notice }: Readonly<{ dictionary: Dictionary; notice: string }>) {
  if (notice === "conflict") {
    return <Notice description={dictionary.catalogCategoryConflict} failed title={dictionary.adminErrorHeading} />;
  }
  if (notice === "failed") {
    return <Notice description={dictionary.catalogCategoryMutationFailed} failed title={dictionary.adminErrorHeading} />;
  }
  return <Notice description={dictionary.catalogCategoryChanged} failed={false} title={dictionary.adminSuccessHeading} />;
}
