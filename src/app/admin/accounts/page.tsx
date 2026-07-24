import { AdminAccountsSurface } from "@/app/admin/admin-surface";
import { getAdministrationService } from "@/auth/administration";

import { requireAdminShellContext } from "../shell-context";

export default async function AdminAccountsPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ error?: string; success?: string }> }>) {
  const { dictionary, principal } = await requireAdminShellContext();
  const [users, query] = await Promise.all([
    getAdministrationService().listUsers(principal),
    searchParams,
  ]);
  const notice = query.success
    ? { tone: "success" as const, text: query.success === "created" ? dictionary.adminCreated : dictionary.adminChanged }
    : query.error
      ? { tone: "error" as const, text: query.error === "create-failed" ? dictionary.adminCreateFailed : dictionary.adminChangeFailed }
      : null;

  return <AdminAccountsSurface dictionary={dictionary} notice={notice} users={users} />;
}
