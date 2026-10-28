import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { clearAllCaches, queryClient, restoreLastCache, setUnauthorizedHandler } from "./data/client.ts";
import { makeRouter } from "./router.tsx";
import { ToastProvider } from "./ui/kit.tsx";
import "./styles.css";

const router = makeRouter(queryClient);

// A 401 from any query means the session ended: drop cached data and sign in again.
// Several queries can fail at once, so ignore repeats while already on a public page.
setUnauthorizedHandler(() => {
  const { pathname, href } = router.state.location;
  if (pathname === "/login" || pathname === "/signup" || pathname.startsWith("/invite/")) return;
  void clearAllCaches().then(() => router.navigate({ to: "/login", search: { next: href } }));
});

// Restore the cache first so the first screen renders from it, not the network.
await restoreLastCache();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </QueryClientProvider>
  </StrictMode>,
);
