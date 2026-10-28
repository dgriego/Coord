import { useEffect, useMemo, useRef, useState } from "react";
import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { can, ROLE_LABELS } from "@coord/shared";
import { api } from "../api.ts";
import { clearAllCaches, switchPartition } from "../data/client.ts";
import { projectsQuery } from "../data/catalog.ts";
import { useLiveUpdates } from "../data/live.ts";
import { useMe, useSwitchStudio } from "../data/queries.ts";
import { CommandPalette, type Command } from "../ui/CommandPalette.tsx";
import { Icon, type IconName } from "../ui/icons.tsx";
import { Avatar, BrandMark, useToast } from "../ui/kit.tsx";

const NAV: { to: string; label: string; icon: IconName }[] = [
  { to: "/projects", label: "Home", icon: "home" },
  { to: "/clients", label: "Clients", icon: "clients" },
  { to: "/vendors", label: "Vendors", icon: "vendors" },
  { to: "/time", label: "Time", icon: "time" },
  { to: "/settings/team", label: "Team", icon: "team" },
];

export function AppLayout() {
  const me = useMe();
  const navigate = useNavigate();
  const toast = useToast();
  const switchStudio = useSwitchStudio();
  const projects = useQuery(projectsQuery);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useLiveUpdates(me.studio.id);
  // A role change arrives as a new cacheKey; move to that cache partition.
  useEffect(() => {
    void switchPartition(me.cacheKey);
  }, [me.cacheKey]);
  useEffect(() => setMenuOpen(false), [pathname]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onClick);
    };
  }, []);

  const signOut = async () => {
    await api.post("/auth/logout").catch(() => {});
    await clearAllCaches();
    await navigate({ to: "/login" });
  };

  const commands = useMemo<Command[]>(() => {
    const list: Command[] = [];
    for (const p of projects.data ?? []) {
      list.push({
        id: `project-${p.id}`,
        label: p.name,
        hint: p.clientName ?? "Project",
        run: () => void navigate({ to: "/projects/$projectId", params: { projectId: p.id } }),
      });
    }
    if (can(me.role, "projects.edit")) {
      list.push({ id: "new-project", label: "Start a new project", run: () => void navigate({ to: "/projects", search: { new: true } }) });
    }
    for (const n of NAV) list.push({ id: `go-${n.to}`, label: `Go to ${n.label}`, run: () => void navigate({ to: n.to }) });
    list.push({ id: "studio-settings", label: "Studio settings and payments", run: () => void navigate({ to: "/settings/studio" }) });
    if (can(me.role, "team.manage")) {
      list.push({ id: "invite", label: "Invite a teammate", run: () => void navigate({ to: "/settings/team", search: { invite: true } }) });
    }
    for (const s of me.studios) {
      if (s.id === me.studio.id) continue;
      list.push({
        id: `studio-${s.id}`,
        label: `Switch to ${s.name}`,
        hint: "Studio",
        run: () => switchStudio.mutate(s.id, { onSuccess: () => toast(`Switched to ${s.name}`) }),
      });
    }
    list.push({ id: "signout", label: "Sign out", run: () => void signOut() });
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me, projects.data, navigate]);

  return (
    <div className="shell">
      <header className="topbar">
        <div className="topbar-inner">
          <Link to="/projects" className="brand" aria-label="Home">
            <BrandMark />
            <span className="hide-sm">Coord</span>
          </Link>
          {me.studios.length > 1 ? (
            <select
              id="studio-switcher"
              className="studio-select"
              aria-label="Studio"
              value={me.studio.id}
              onChange={(e) => switchStudio.mutate(e.target.value)}
            >
              {me.studios.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          ) : (
            <span className="item-name hide-sm" style={{ fontSize: 14 }}>{me.studio.name}</span>
          )}

          <nav className="nav" aria-label="Main">
            {NAV.map((n) => (
              <Link key={n.to} to={n.to} activeOptions={{ exact: n.to !== "/projects" }}>
                <Icon name={n.icon} /> {n.label}
              </Link>
            ))}
          </nav>
          <span className="spacer" />

          <button className="search-btn" onClick={() => setPaletteOpen(true)} aria-label="Search or jump to">
            <Icon name="search" size={15} /> <span className="label-text">Jump to…</span>
            <span className="kbd">Ctrl K</span>
          </button>

          <div className="menu" ref={menuRef}>
            <button className="link-btn" style={{ borderRadius: "50%" }} aria-label="Account" aria-expanded={menuOpen} onClick={() => setMenuOpen((o) => !o)}>
              <Avatar name={me.user.name} />
            </button>
            {menuOpen && (
              <div className="menu-pop" role="menu">
                <div className="who">
                  <div className="item-name">{me.user.name}</div>
                  <div className="muted small">{ROLE_LABELS[me.role]} at {me.studio.name}</div>
                </div>
                <Link to="/settings/team" role="menuitem">Team and roles</Link>
                <Link to="/settings/studio" role="menuitem">Studio settings</Link>
                <button role="menuitem" onClick={() => setPaletteOpen(true)}>Search or jump to</button>
                <button role="menuitem" onClick={() => void signOut()}>Sign out</button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="main">
        <Outlet />
      </main>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} commands={commands} />
    </div>
  );
}
