import { DestructiveActionForm } from "@/app/admin/accounts/destructive-confirm";
import type { AdminUserDetail } from "@/auth/admin-user-directory";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { getDictionary } from "@/i18n/dictionaries";

type Dictionary = ReturnType<typeof getDictionary>;

// The delivered byte-frozen soft-delete route stays the only destructive
// action; it lands on the accounts workspace notices. The confirmation
// requires the exact username, never a bare "are you sure?".
export function DangerSection({ detail, dictionary }: Readonly<{ detail: AdminUserDetail; dictionary: Dictionary }>) {
  return (
    <Card className="border-destructive/50">
      <CardHeader>
        <CardTitle className="text-destructive">{dictionary.adminUserProfileDeleteHeading}</CardTitle>
        <CardDescription>{dictionary.adminUserProfileDeleteDescription}</CardDescription>
      </CardHeader>
      <CardContent>
        <DestructiveActionForm
          action={`/admin/users/${detail.id}/delete`}
          cancelLabel={dictionary.cancel}
          confirmLabel={dictionary.adminUsersDirectoryDelete}
          confirmation={{
            expectedValue: detail.username,
            label: dictionary.adminUserProfileDeleteConfirmFieldLabel,
          }}
          dialogDescription={dictionary.adminUserProfileDeleteDescription}
          dialogTitle={dictionary.adminUserProfileDeleteConfirmTitle}
          failureMessage={dictionary.adminUserProfileDeleteConfirmFailure}
          pendingLabel={dictionary.loading}
          triggerLabel={dictionary.adminUsersDirectoryDelete}
        />
      </CardContent>
    </Card>
  );
}
