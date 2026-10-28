// Small stroke icons, inline so they cost no requests.
const paths = {
  home: "M4 11l8-7 8 7v9a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1z",
  projects: "M3 7h18M3 7v12h18V7M3 7l2-3h5l2 3",
  vendors: "M4 20V9l8-5 8 5v11M9 20v-6h6v6",
  clients: "M16 19v-1a4 4 0 0 0-8 0v1M12 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6",
  time: "M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18",
  team: "M17 20v-1a4 4 0 0 0-3-3.9M7 20v-1a4 4 0 0 1 4-4h0a4 4 0 0 1 4 4v1M11 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6M17 4.5a3 3 0 0 1 0 5.8",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14M20 20l-4-4",
  menu: "M4 7h16M4 12h16M4 17h16",
  close: "M6 6l12 12M18 6L6 18",
  sofa: "M4 11V8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3M3 12a2 2 0 0 1 4 0v2h10v-2a2 2 0 0 1 4 0v5H3zM6 17v2M18 17v2",
  proposal: "M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6",
  box: "M3 8l9-5 9 5v8l-9 5-9-5zM3 8l9 5 9-5M12 13v8",
  schedule: "M4 5h16v15H4zM4 10h16M9 5v15",
  check: "M4 12l5 5L20 6",
  link: "M10 14a4 4 0 0 0 5.6 0l3-3a4 4 0 0 0-5.6-5.6l-1 1M14 10a4 4 0 0 0-5.6 0l-3 3a4 4 0 0 0 5.6 5.6l1-1",
  sparkle: "M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6",
  plus: "M12 5v14M5 12h14",
  trash: "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3",
  arrow: "M5 12h14M13 6l6 6-6 6",
} as const;

export type IconName = keyof typeof paths;

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={paths[name]} />
    </svg>
  );
}
