import { useMe } from "../data/queries.ts";
import { EmptyState } from "../ui/kit.tsx";

// Screens whose features arrive in later milestones. Each says what will be
// here so beta studios know what's coming.

function Page({ title, children }: { title: string; children: React.ReactNode }) {
  const me = useMe();
  return (
    <div className="page">
      <div className="page-head">
        <div className="stack" style={{ gap: 4 }}>
          <span className="label">{me.studio.name}</span>
          <h1 className="display">{title}</h1>
        </div>
      </div>
      <section className="panel">{children}</section>
    </div>
  );
}

export function TimePage() {
  return (
    <Page title="Time">
      <EmptyState milestone="Coming in M4" title="No time tracked yet">
        Start a timer from any project, or log hours afterwards. Billable time flows onto the next invoice.
      </EmptyState>
    </Page>
  );
}
