import type { FormEvent } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ROLE_LABELS, type InvitationPreview, type Me } from "@coord/shared";
import { api, ApiError } from "../api.ts";
import { adoptSession, meQuery } from "../data/queries.ts";
import { BrandMark, Field, formErrors } from "../ui/kit.tsx";

function useAuthSubmit(path: string, after: string) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: (input: unknown) => api.post<Me>(path, input),
    onSuccess: async (me) => {
      await adoptSession(qc, me);
      await navigate({ to: after });
    },
  });
}

function formValues(e: FormEvent<HTMLFormElement>) {
  e.preventDefault();
  return Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
}

/** Only allow redirects to our own paths. */
function safeNext(next: string | undefined) {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/login") ? next : "/projects";
}

export function LoginPage({ next }: { next?: string }) {
  const submit = useAuthSubmit("/auth/login", safeNext(next));
  const { fields, message } = formErrors(submit.error);
  return (
    <main className="auth">
      <div className="auth-card">
        <span className="brand"><BrandMark /> Coord</span>
        <h1 className="display">Sign in</h1>
        <form onSubmit={(e) => submit.mutate(formValues(e))} noValidate>
          {message && <div className="form-error" role="alert">{message}</div>}
          <Field label="Email" name="email" type="email" autoComplete="email" required error={fields.email} />
          <Field label="Password" name="password" type="password" autoComplete="current-password" required error={fields.password} />
          <button className="btn btn-primary" disabled={submit.isPending}>
            {submit.isPending ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <p className="muted small">
          New here? <Link to="/signup">Create a studio account</Link>
        </p>
      </div>
    </main>
  );
}

export function SignupPage() {
  const submit = useAuthSubmit("/auth/signup", "/projects");
  const { fields, message } = formErrors(submit.error);
  return (
    <main className="auth">
      <div className="auth-card">
        <span className="brand"><BrandMark /> Coord</span>
        <div className="stack" style={{ gap: 8 }}>
          <h1 className="display">Set up your studio</h1>
          <p className="muted">You'll be the owner. Invite your team once you're in.</p>
        </div>
        <form onSubmit={(e) => submit.mutate(formValues(e))} noValidate>
          {message && <div className="form-error" role="alert">{message}</div>}
          <Field label="Studio name" name="studioName" placeholder="Hollis Interiors" required error={fields.studioName} />
          <Field label="Your name" name="name" autoComplete="name" required error={fields.name} />
          <Field label="Email" name="email" type="email" autoComplete="email" required error={fields.email} />
          <Field label="Password" name="password" type="password" autoComplete="new-password" minLength={10} required error={fields.password} />
          <button className="btn btn-primary" disabled={submit.isPending}>
            {submit.isPending ? "Creating your studio…" : "Create studio"}
          </button>
        </form>
        <p className="muted small">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </main>
  );
}

export function InvitePage({ token }: { token: string }) {
  const preview = useQuery({
    queryKey: ["invitation", token],
    queryFn: () => api.get<InvitationPreview>(`/invitations/${token}`),
    retry: false,
    gcTime: 0,
  });
  const me = useQuery({ ...meQuery, retry: false });
  const submit = useAuthSubmit("/invitations/accept", "/projects");
  const { fields, message } = formErrors(submit.error);

  if (preview.isPending) return <main className="auth"><p className="muted">Checking your invitation…</p></main>;
  if (preview.error) {
    return (
      <main className="auth">
        <div className="auth-card">
          <span className="brand"><BrandMark /> Coord</span>
          <h1 className="display">Invitation unavailable</h1>
          <p className="muted">{preview.error instanceof ApiError ? preview.error.message : "Try the link again."}</p>
        </div>
      </main>
    );
  }

  const inv = preview.data;
  const signedInAs = me.data?.user.email;
  const heading = (
    <div className="stack" style={{ gap: 8 }}>
      <h1 className="display">Join {inv.studioName}</h1>
      <p className="muted">
        You've been invited as {ROLE_LABELS[inv.role].toLowerCase()} with {inv.email}.
      </p>
    </div>
  );

  if (inv.hasAccount) {
    const right = signedInAs === inv.email;
    return (
      <main className="auth">
        <div className="auth-card">
          <span className="brand"><BrandMark /> Coord</span>
          {heading}
          {message && <div className="form-error" role="alert">{message}</div>}
          {right ? (
            <button className="btn btn-primary" disabled={submit.isPending} onClick={() => submit.mutate({ token })}>
              {submit.isPending ? "Joining…" : `Join ${inv.studioName}`}
            </button>
          ) : (
            <>
              <p className="small">
                {signedInAs ? `You're signed in as ${signedInAs}. ` : ""}Sign in as {inv.email} to accept.
              </p>
              <Link className="btn btn-primary" to="/login" search={{ next: `/invite/${token}` }}>
                Sign in to accept
              </Link>
            </>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="auth">
      <div className="auth-card">
        <span className="brand"><BrandMark /> Coord</span>
        {heading}
        <form onSubmit={(e) => submit.mutate({ token, ...formValues(e) })} noValidate>
          {message && <div className="form-error" role="alert">{message}</div>}
          <Field label="Your name" name="name" autoComplete="name" required error={fields.name} />
          <Field label="Choose a password" name="password" type="password" autoComplete="new-password" minLength={10} required error={fields.password} />
          <button className="btn btn-primary" disabled={submit.isPending}>
            {submit.isPending ? "Joining…" : `Join ${inv.studioName}`}
          </button>
        </form>
      </div>
    </main>
  );
}
