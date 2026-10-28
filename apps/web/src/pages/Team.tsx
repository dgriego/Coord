import { useEffect, useRef, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { can, canAssignRole, ROLE_LABELS, ROLES, type AuditEntry, type CreatedInvitation, type Role } from "@coord/shared";
import {
  auditQuery,
  invitationsQuery,
  membersQuery,
  useCancelInvite,
  useChangeRole,
  useInvite,
  useMe,
  useRemoveMember,
} from "../data/queries.ts";
import { Avatar, formatDate, formatDateTime, formErrors, useToast } from "../ui/kit.tsx";

const ROLE_HELP: Record<Role, string> = {
  owner: "Everything, including studio settings",
  admin: "Team, money and documents",
  designer: "Projects, pricing and sending documents",
  assistant: "Projects without cost or markup",
  bookkeeper: "Invoices, payments and QuickBooks",
};

export function TeamPage({ openInvite }: { openInvite?: boolean }) {
  const me = useMe();
  const manage = can(me.role, "team.manage");
  const members = useQuery(membersQuery);
  const changeRole = useChangeRole();
  const remove = useRemoveMember();
  const toast = useToast();
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  const assignable = ROLES.filter((r) => canAssignRole(me.role, r));
  const ownerCount = members.data?.filter((m) => m.role === "owner").length ?? 0;

  return (
    <div className="page">
      <div className="page-head">
        <div className="stack" style={{ gap: 4 }}>
          <span className="label">{me.studio.name}</span>
          <h1 className="display">Team</h1>
        </div>
      </div>

      {manage && <InvitePanel assignable={assignable} autoFocus={openInvite} />}

      <section className="panel">
        <div className="panel-head">
          <h2>Members</h2>
          <span className="muted small">{members.data?.length ?? ""}</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Role</th>
                <th className="hide-sm">Joined</th>
                {manage && <th aria-label="Actions" />}
              </tr>
            </thead>
            <tbody>
              {members.isPending && (
                <tr><td colSpan={4} className="muted">Loading the team…</td></tr>
              )}
              {members.data?.map((m) => {
                const isMe = m.userId === me.user.id;
                const lastOwner = m.role === "owner" && ownerCount <= 1;
                const editable = manage && !lastOwner && (m.role !== "owner" || me.role === "owner");
                return (
                  <tr key={m.userId}>
                    <td>
                      <div className="cell-person">
                        <Avatar name={m.name} />
                        <div>
                          <div>{m.name}{isMe && <span className="muted"> (you)</span>}</div>
                          <div className="muted small">{m.email}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      {editable ? (
                        <select
                          id={`role-${m.userId}`}
                          className="select"
                          style={{ width: 150 }}
                          aria-label={`Role for ${m.name}`}
                          value={m.role}
                          onChange={(e) =>
                            changeRole.mutate(
                              { userId: m.userId, role: e.target.value as Role },
                              {
                                onSuccess: () => toast(`${m.name} is now ${ROLE_LABELS[e.target.value as Role].toLowerCase()}`),
                                onError: (err) => toast(formErrors(err).message ?? "Couldn't change the role"),
                              },
                            )
                          }
                        >
                          {ROLES.filter((r) => r === m.role || assignable.includes(r)).map((r) => (
                            <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                          ))}
                        </select>
                      ) : (
                        <span className={`pill ${m.role === "owner" ? "pill-owner" : ""}`}>{ROLE_LABELS[m.role]}</span>
                      )}
                      <div className="muted small hide-sm" style={{ marginTop: 4 }}>{ROLE_HELP[m.role]}</div>
                    </td>
                    <td className="muted hide-sm">{formatDate(m.joinedAt)}</td>
                    {manage && (
                      <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                        {editable && !isMe &&
                          (confirmRemove === m.userId ? (
                            <span className="row" style={{ justifyContent: "flex-end", flexWrap: "nowrap" }}>
                              <button
                                className="btn btn-sm btn-danger"
                                onClick={() =>
                                  remove.mutate(m.userId, {
                                    onSuccess: () => toast(`Removed ${m.name}`),
                                    onError: (err) => toast(formErrors(err).message ?? "Couldn't remove them"),
                                    onSettled: () => setConfirmRemove(null),
                                  })
                                }
                              >
                                Remove {m.name.split(" ")[0]}
                              </button>
                              <button className="btn btn-sm btn-ghost" onClick={() => setConfirmRemove(null)}>Keep</button>
                            </span>
                          ) : (
                            <button className="btn btn-sm btn-ghost" onClick={() => setConfirmRemove(m.userId)}>Remove</button>
                          ))}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {manage && <PendingInvites />}
      {manage && <Activity />}
    </div>
  );
}

function InvitePanel({ assignable, autoFocus }: { assignable: Role[]; autoFocus?: boolean }) {
  const invite = useInvite();
  const [created, setCreated] = useState<CreatedInvitation | null>(null);
  const [copied, setCopied] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const { fields, message } = formErrors(invite.error);

  useEffect(() => {
    if (autoFocus) emailRef.current?.focus();
  }, [autoFocus]);

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    invite.mutate(
      { email: String(data.get("email")), role: data.get("role") as Role },
      {
        onSuccess: (inv) => {
          setCreated(inv);
          setCopied(false);
          form.reset();
        },
      },
    );
  };

  const copy = async () => {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.acceptUrl);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Invite a teammate</h2>
        <span className="muted small">They'll get a link that works for 7 days.</span>
      </div>
      <div className="panel-body stack">
        <form className="row" style={{ alignItems: "flex-end" }} onSubmit={onSubmit} noValidate>
          <label className="field" style={{ flex: "2 1 220px" }} htmlFor="invite-email">
            <span>Email</span>
            <input ref={emailRef} className="input" id="invite-email" name="email" type="email" placeholder="jordan@studio.com" aria-invalid={fields.email ? true : undefined} />
            {fields.email && <span className="field-error">{fields.email}</span>}
          </label>
          <label className="field" style={{ flex: "1 1 150px" }} htmlFor="invite-role">
            <span>Role</span>
            <select className="select" id="invite-role" name="role" defaultValue="designer">
              {assignable.map((r) => (
                <option key={r} value={r}>{ROLE_LABELS[r]}</option>
              ))}
            </select>
          </label>
          <button className="btn btn-primary" disabled={invite.isPending}>
            {invite.isPending ? "Creating link…" : "Create invite link"}
          </button>
        </form>
        {message && <div className="form-error" role="alert">{message}</div>}
        {created && (
          <div className="stack" style={{ gap: 6 }}>
            <span className="small">
              Send this link to {created.email}. Email delivery arrives with the email integration.
            </span>
            <div className="invite-link">
              <code>{created.acceptUrl}</code>
              <button className="btn btn-sm" type="button" onClick={copy}>{copied ? "Copied" : "Copy link"}</button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function PendingInvites() {
  const invites = useQuery(invitationsQuery);
  const cancel = useCancelInvite();
  const toast = useToast();
  if (!invites.data?.length) return null;
  return (
    <section className="panel">
      <div className="panel-head"><h2>Pending invitations</h2></div>
      <div className="table-wrap">
        <table>
          <tbody>
            {invites.data.map((i) => (
              <tr key={i.id}>
                <td>{i.email}</td>
                <td><span className="pill">{ROLE_LABELS[i.role]}</span></td>
                <td className="muted small hide-sm">Invited by {i.invitedBy} · expires {formatDate(i.expiresAt)}</td>
                <td style={{ textAlign: "right" }}>
                  <button className="btn btn-sm btn-ghost" onClick={() => cancel.mutate(i.id, { onSuccess: () => toast("Invitation cancelled") })}>
                    Cancel
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function describe(e: AuditEntry): string {
  const after = (e.after ?? {}) as Record<string, string>;
  const before = (e.before ?? {}) as Record<string, string>;
  const role = (r?: string) => (r && r in ROLE_LABELS ? ROLE_LABELS[r as Role].toLowerCase() : r ?? "");
  switch (e.action) {
    case "studio.created": return `created the studio`;
    case "invitation.created": return `invited ${after.email} as ${role(after.role)}`;
    case "invitation.revoked": return `cancelled the invitation for ${before.email}`;
    case "invitation.accepted": return `joined as ${role(after.role)}`;
    case "member.role_changed": return `changed a role from ${role(before.role)} to ${role(after.role)}`;
    case "member.removed": return `removed ${before.email}`;
    default: return e.action;
  }
}

function Activity() {
  const audit = useQuery(auditQuery);
  if (!audit.data?.length) return null;
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Activity</h2>
        <span className="muted small">Every change to the team is recorded.</span>
      </div>
      <ul className="activity">
        {audit.data.slice(0, 20).map((e) => (
          <li key={e.id}>
            <span><b>{e.actorName ?? "Former member"}</b> {describe(e)}</span>
            <time dateTime={e.createdAt}>{formatDateTime(e.createdAt)}</time>
          </li>
        ))}
      </ul>
    </section>
  );
}
