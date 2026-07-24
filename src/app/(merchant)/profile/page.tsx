import { WorkspaceHeading } from "@/app-shell/workspace-heading";
import { getProfileService } from "@/auth/profile";
import { ProfileManagement, type ProfileNotice } from "@/app/profile/profile-management";

import { requireMerchantShellContext } from "../shell-context";

type SearchValue = string | string[] | undefined;

function resolveNotice(search: Record<string, SearchValue>): ProfileNotice {
  if (Object.keys(search).length !== 1) return null;
  if (search.identity === "changed") return "identity-changed";
  if (search.identity === "conflict") return "identity-conflict";
  if (search.identity === "failed") return "identity-failed";
  if (search.password === "failed") return "password-failed";
  return null;
}

export default async function ProfilePage({
  searchParams = Promise.resolve({}),
}: Readonly<{ searchParams?: Promise<Record<string, SearchValue>> }>) {
  const { dictionary, principal } = await requireMerchantShellContext();
  const profile = await getProfileService().get(principal);
  const notice = resolveNotice(await searchParams);
  return (
    <>
      <WorkspaceHeading description={dictionary.profileDescription} eyebrow={dictionary.profileEyebrow} title={dictionary.profileTitle} />
      <ProfileManagement dictionary={dictionary} notice={notice} profile={profile} />
    </>
  );
}
