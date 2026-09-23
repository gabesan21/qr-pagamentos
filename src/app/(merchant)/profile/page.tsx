import { WorkspaceHeading } from "@/app-shell/workspace-heading";
import { getProfileService } from "@/auth/profile";
import { ProfileManagement, type ProfileNotice, type TotpNotice } from "@/app/profile/profile-management";
import { getTotpService } from "@/auth/totp-store";

import { requireMerchantShellContext } from "../shell-context";

type SearchValue = string | string[] | undefined;

function resolveNotice(search: Record<string, SearchValue>): ProfileNotice {
  if (Object.keys(search).length !== 1) return null;
  if (search.identity === "changed") return "identity-changed";
  if (search.identity === "conflict") return "identity-conflict";
  if (search.identity === "failed") return "identity-failed";
  if (search.password === "changed") return "password-changed";
  if (search.password === "failed") return "password-failed";
  return null;
}

function resolveTotpNotice(search: Record<string, SearchValue>): TotpNotice {
  if (Object.keys(search).length !== 1) return null;
  if (search.totp === "enrolled") return "totp-enrolled";
  if (search.totp === "confirmed") return "totp-confirmed";
  if (search.totp === "disabled") return "totp-disabled";
  if (search.totp === "failed") return "totp-failed";
  if (search.totp === "conflict") return "totp-conflict";
  return null;
}

export default async function ProfilePage({
  searchParams = Promise.resolve({}),
}: Readonly<{ searchParams?: Promise<Record<string, SearchValue>> }>) {
  const { dictionary, principal } = await requireMerchantShellContext();
  const profile = await getProfileService().get(principal);
  const search = await searchParams;
  const notice = resolveNotice(search);
  const totpNotice = resolveTotpNotice(search);
  const totpStatus = await getTotpService().getStatus(principal.id);
  return (
    <>
      <WorkspaceHeading description={dictionary.profileDescription} eyebrow={dictionary.profileEyebrow} title={dictionary.profileTitle} />
      <ProfileManagement dictionary={dictionary} notice={notice} profile={profile} totpNotice={totpNotice} totpStatus={totpStatus} />
    </>
  );
}
