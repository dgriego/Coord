import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Outlet,
  redirect,
  useRouter,
} from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";
import { ApiError } from "./api.ts";
import { auditQuery, invitationsQuery, meQuery, membersQuery } from "./data/queries.ts";
import { switchPartition } from "./data/client.ts";
import { InvitePage, LoginPage, SignupPage } from "./pages/auth.tsx";
import { AppLayout } from "./pages/AppLayout.tsx";
import { TeamPage } from "./pages/Team.tsx";
import { TimePage } from "./pages/Placeholders.tsx";
import { HomePage } from "./pages/Home.tsx";
import { ProjectPage } from "./pages/Project.tsx";
import { clientsQuery, projectQuery, projectsQuery, vendorsQuery } from "./data/catalog.ts";
import { ClientsPage } from "./pages/Clients.tsx";
import { VendorsPage } from "./pages/Vendors.tsx";
import { can } from "@coord/shared";

const rootRoute = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: Outlet,
  errorComponent: function RouteError({ error, reset }) {
    const router = useRouter();
    const offline = error instanceof ApiError && (error.status === 0 || error.status >= 500);
    return (
      <main className="auth">
        <div className="auth-card">
          <span className="brand">Coord</span>
          <h1 className="display">{offline ? "Can't reach the studio server" : "Something went wrong"}</h1>
          <p className="muted">
            {offline
              ? "Check your connection. Anything you already opened is still saved on this device."
              : error instanceof Error
                ? error.message
                : "Try again in a moment."}
          </p>
          <button
            className="btn btn-primary"
            onClick={() => {
              reset();
              void router.invalidate();
            }}
          >
            Try again
          </button>
        </div>
      </main>
    );
  },
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  validateSearch: (s: Record<string, unknown>): { next?: string } =>
    typeof s.next === "string" ? { next: s.next } : {},
  component: function Login() {
    return <LoginPage next={loginRoute.useSearch().next} />;
  },
});

const signupRoute = createRoute({ getParentRoute: () => rootRoute, path: "/signup", component: SignupPage });

const inviteRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/invite/$token",
  component: function Invite() {
    return <InvitePage token={inviteRoute.useParams().token} />;
  },
});

// Signed-in area. Uses the cached "me" when there is one, so the shell renders
// immediately; the query refreshes it in the background.
const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "app",
  beforeLoad: async ({ context, location }) => {
    try {
      const me = await context.queryClient.ensureQueryData(meQuery);
      await switchPartition(me.cacheKey);
      return { me };
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        throw redirect({ to: "/login", search: { next: location.href } });
      }
      throw err;
    }
  },
  component: AppLayout,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  beforeLoad: () => {
    throw redirect({ to: "/projects" });
  },
});

// Loaders run on hover too (defaultPreload: "intent"), so data is usually
// cached before the click.
const projectsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/projects",
  validateSearch: (s: Record<string, unknown>): { new?: boolean } => (s.new ? { new: true } : {}),
  loader: ({ context }) => void context.queryClient.prefetchQuery(projectsQuery),
  component: function Home() {
    return <HomePage openNew={projectsRoute.useSearch().new} />;
  },
});
const projectRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/projects/$projectId",
  loader: ({ context, params }) => {
    void context.queryClient.prefetchQuery(projectQuery(params.projectId));
    void context.queryClient.prefetchQuery(vendorsQuery);
  },
  component: function Project() {
    const { projectId } = projectRoute.useParams();
    return <ProjectPage key={projectId} projectId={projectId} />;
  },
});
const clientsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/clients",
  loader: ({ context }) => void context.queryClient.prefetchQuery(clientsQuery),
  component: ClientsPage,
});
const vendorsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/vendors",
  loader: ({ context }) => void context.queryClient.prefetchQuery(vendorsQuery),
  component: VendorsPage,
});
const timeRoute = createRoute({ getParentRoute: () => appRoute, path: "/time", component: TimePage });

const teamRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/settings/team",
  validateSearch: (s: Record<string, unknown>): { invite?: boolean } => (s.invite ? { invite: true } : {}),
  // Runs on hover too (defaultPreload: "intent"), so the page is usually ready before the click.
  loader: ({ context }) => {
    const { queryClient } = context;
    const me = queryClient.getQueryData(meQuery.queryKey);
    void queryClient.prefetchQuery(membersQuery);
    if (me && can(me.role, "team.manage")) {
      void queryClient.prefetchQuery(invitationsQuery);
      void queryClient.prefetchQuery(auditQuery);
    }
  },
  component: function Team() {
    return <TeamPage openInvite={teamRoute.useSearch().invite} />;
  },
});

const routeTree = rootRoute.addChildren([
  loginRoute,
  signupRoute,
  inviteRoute,
  indexRoute,
  appRoute.addChildren([projectsRoute, projectRoute, clientsRoute, vendorsRoute, timeRoute, teamRoute]),
]);

export function makeRouter(queryClient: QueryClient) {
  return createRouter({
    routeTree,
    context: { queryClient },
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
    defaultNotFoundComponent: () => (
      <main className="auth"><p className="muted">That page doesn't exist.</p></main>
    ),
  });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof makeRouter>;
  }
}
