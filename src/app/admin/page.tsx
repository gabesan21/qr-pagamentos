import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { AdminSubmit } from "@/app/admin/admin-submit";
import { Panel } from "@/app/ui/panel";
import { Status } from "@/app/ui/status";
import { ForbiddenError, getAuthorizationService } from "@/auth/authorization";
import { getAdministrationService } from "@/auth/administration";
import { getDictionary } from "@/i18n/dictionaries";
import { getLocalePreferenceService } from "@/i18n/locale-preference";

type Notice = "success" | "error" | undefined;

function displayRole(role: "ADMIN" | "USER", dictionary: ReturnType<typeof getDictionary>) {
  return role === "ADMIN" ? dictionary.adminAdministrator : dictionary.adminUser;
}

function displayStatus(status: "ACTIVE" | "DISABLED", dictionary: ReturnType<typeof getDictionary>) {
  return status === "ACTIVE" ? dictionary.adminActive : dictionary.adminDisabled;
}

export default async function AdminPage({ searchParams }: Readonly<{ searchParams: Promise<{ error?: string; success?: string }> }>) {
  let actor;
  try {
    actor = await getAuthorizationService().requireAdmin((await cookies()).get("qr_session")?.value);
  } catch (error) {
    if (error instanceof ForbiddenError) redirect("/");
    redirect("/login");
  }
  const [locale, users, query] = await Promise.all([
    getLocalePreferenceService().resolve(actor.id),
    getAdministrationService().listUsers(actor),
    searchParams,
  ]);
  const dictionary = getDictionary(locale);
  const notice: Notice = query.success ? "success" : query.error ? "error" : undefined;
  const noticeText = query.success === "created" ? dictionary.adminCreated : query.success ? dictionary.adminChanged : query.error === "create-failed" ? dictionary.adminCreateFailed : dictionary.adminChangeFailed;

  return (
    <main className="admin-shell">
      <header className="receipt-rail">
        <span className="receipt-rail__label">QR Pagamentos / admin</span>
        <h1>{dictionary.adminHeading}</h1>
        <div className="receipt-rail__facts"><span>{actor.username}</span><span>{dictionary.adminAdministrator}</span></div>
      </header>
      <p className="admin-shell__intro">{dictionary.adminIntroduction}</p>
      {notice ? <div aria-live={notice === "success" ? "polite" : "assertive"} role={notice === "success" ? "status" : "alert"}><Status label={notice === "success" ? dictionary.adminHeading : dictionary.adminChangeFailed} tone={notice === "success" ? "success" : "danger"}>{noticeText}</Status></div> : null}
      <Panel title={dictionary.adminCreateHeading}>
        <form action="/admin/users" method="post">
          <label className="field__label" htmlFor="username">{dictionary.usernameLabel}</label>
          <input className="field__input" id="username" name="username" required />
          <label className="field__label" htmlFor="email">{dictionary.adminEmailLabel}</label>
          <input className="field__input" id="email" name="email" type="email" />
          <label className="field__label" htmlFor="password">{dictionary.passwordLabel}</label>
          <input aria-describedby="password-help" className="field__input" id="password" minLength={12} name="password" required type="password" />
          <p className="field__help" id="password-help">{dictionary.adminPasswordHelp}</p>
          <label className="field__label" htmlFor="role">{dictionary.adminRoleLabel}</label>
          <select className="field__input" defaultValue="USER" id="role" name="role"><option value="USER">{dictionary.adminUser}</option><option value="ADMIN">{dictionary.adminAdministrator}</option></select>
          <AdminSubmit label={dictionary.adminCreate} />
        </form>
      </Panel>
      <Panel title={dictionary.adminUsersHeading}>
        {users.length === 0 ? <p>{dictionary.adminEmpty}</p> : <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th scope="col">{dictionary.adminUsername}</th><th scope="col">{dictionary.adminEmail}</th><th scope="col">{dictionary.adminRole}</th><th scope="col">{dictionary.adminStatus}</th><th scope="col">{dictionary.adminActions}</th></tr></thead><tbody>{users.map((user) => <tr key={user.id}><td>{user.username}</td><td>{user.email ?? "—"}</td><td>{displayRole(user.role, dictionary)}</td><td>{displayStatus(user.status, dictionary)}</td><td><div className="admin-actions"><form action={`/admin/users/${user.id}/role`} method="post"><label className="sr-only" htmlFor={`role-${user.id}`}>{dictionary.adminRoleLabel}</label><select className="field__input" defaultValue={user.role} id={`role-${user.id}`} name="role"><option value="USER">{dictionary.adminUser}</option><option value="ADMIN">{dictionary.adminAdministrator}</option></select><AdminSubmit label={dictionary.adminSaveRole} tone="secondary" /></form><form action={`/admin/users/${user.id}/status`} method="post"><label className="sr-only" htmlFor={`status-${user.id}`}>{dictionary.adminStatusLabel}</label><select className="field__input" defaultValue={user.status} id={`status-${user.id}`} name="status"><option value="ACTIVE">{dictionary.adminActive}</option><option value="DISABLED">{dictionary.adminDisabled}</option></select><AdminSubmit label={dictionary.adminSaveStatus} tone="secondary" /></form><form action={`/admin/users/${user.id}/password`} method="post"><label className="sr-only" htmlFor={`password-${user.id}`}>{dictionary.passwordLabel}</label><input className="field__input" id={`password-${user.id}`} minLength={12} name="password" required type="password" /><AdminSubmit label={dictionary.adminChangePassword} tone="secondary" /></form></div></td></tr>)}</tbody></table></div>}
      </Panel>
      <div className="admin-shell__actions"><form action="/language-preference" method="post"><label className="field__label" htmlFor="locale">{dictionary.languageLabel}</label><select className="field__input" defaultValue={locale} id="locale" name="locale"><option value="pt-BR">Português (Brasil)</option><option value="en">English</option></select><AdminSubmit label={dictionary.languageSave} tone="secondary" /></form><form action="/logout" method="post"><AdminSubmit label={dictionary.signOut} tone="secondary" /></form></div>
    </main>
  );
}
