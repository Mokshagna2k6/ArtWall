"use client";

import { useActionState } from "react";

import { IDLE } from "@/features/physical-wall/action-state";
import {
  grantAdminRoleByEmail,
  revokeAdminRoleByEmail,
} from "@/features/physical-wall/actions/admin-roles";
import {
  Field,
  FormStatus,
  inputClass,
  SubmitButton,
} from "@/features/physical-wall/components/form-bits";

/**
 * Mirrors `ADMIN_ROLES` in authorize.ts — duplicated rather than imported
 * because that module does `import "server-only"` and pulls in `pg` (it
 * reads live DB state for every other export), which a client component may
 * not import at all (see action-state.ts's header comment on the same
 * failure mode). Same "fixed, migration-seeded set" reasoning as the
 * original for why a literal here is fine.
 */
const ADMIN_ROLES = [
  "super_admin",
  "curator_admin",
  "venue_admin",
  "finance_admin",
  "support_admin",
  "compliance_admin",
  "content_admin",
  "readonly_admin",
] as const;

interface Assignment {
  id: string;
  user_id: string;
  name: string;
  email: string;
  role: string;
  granted_by: string | null;
  granted_at: string;
}

/**
 * FE-3.17: the super_admin-only console for `grantAdminRole`/`revokeAdminRole`
 * (SEC-3.03) — the backend has had these since the prior session with no UI
 * caller. The page that renders this already gated the whole route to
 * super_admin via `requireAnyAdminRolePage`; self-grant/self-revoke is
 * rejected server-side regardless, same belt-and-suspenders as every other
 * admin form in this feature.
 */
export function AdminRolesConsole({ assignments }: { assignments: Assignment[] }) {
  const [grantState, grantAction] = useActionState(grantAdminRoleByEmail, IDLE);
  const [revokeState, revokeAction] = useActionState(revokeAdminRoleByEmail, IDLE);

  return (
    <div className="flex flex-col gap-8">
      <section className="border-hairline rounded-md border p-5">
        <h2 className="font-heading text-section">Grant a role</h2>
        <form action={grantAction} className="mt-4 flex flex-wrap items-end gap-3">
          <Field label="Email" htmlFor="grant-email">
            <input
              id="grant-email"
              name="email"
              type="email"
              required
              className={`${inputClass} max-w-xs`}
            />
          </Field>
          <Field label="Role" htmlFor="grant-role">
            <select id="grant-role" name="role" required className={`${inputClass} max-w-xs`}>
              {ADMIN_ROLES.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
          </Field>
          <SubmitButton>Grant</SubmitButton>
        </form>
        <FormStatus state={grantState} />
      </section>

      <section className="border-hairline rounded-md border p-5">
        <h2 className="font-heading text-section">Revoke a role</h2>
        <form action={revokeAction} className="mt-4 flex flex-wrap items-end gap-3">
          <Field label="Email" htmlFor="revoke-email">
            <input
              id="revoke-email"
              name="email"
              type="email"
              required
              className={`${inputClass} max-w-xs`}
            />
          </Field>
          <Field label="Role" htmlFor="revoke-role">
            <select id="revoke-role" name="role" required className={`${inputClass} max-w-xs`}>
              {ADMIN_ROLES.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
          </Field>
          <SubmitButton variant="danger">Revoke</SubmitButton>
        </form>
        <FormStatus state={revokeState} />
      </section>

      <section>
        <h2 className="font-heading text-section">Current assignments</h2>
        {assignments.length === 0 ? (
          <div className="border-hairline mt-4 rounded-md border border-dashed p-10 text-center">
            <p className="text-ink-muted text-sm">No admin role assignments.</p>
          </div>
        ) : (
          <div className="border-hairline mt-4 overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-hairline text-ink-muted border-b text-left text-xs uppercase tracking-wider">
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Granted</th>
                </tr>
              </thead>
              <tbody>
                {assignments.map((a) => (
                  <tr key={a.id} className="border-hairline border-b last:border-0">
                    <td className="px-4 py-3">{a.name}</td>
                    <td className="px-4 py-3">{a.email}</td>
                    <td className="px-4 py-3">{a.role}</td>
                    <td className="px-4 py-3">
                      {new Date(a.granted_at).toLocaleDateString("en-IN")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
