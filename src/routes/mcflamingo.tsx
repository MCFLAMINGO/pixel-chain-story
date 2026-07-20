import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";

/**
 * `/mcflamingo` and `/mcflamingo/` used to hit the SPA 404 while the real demo
 * storefront lives at `public/mcflamingo/index.html`. This route forwards humans
 * there; Continuity still digests the static HTML file.
 */
export const Route = createFileRoute("/mcflamingo")({
  head: () => ({
    meta: [
      { title: "McFlamingo — continuity demo" },
      {
        name: "description",
        content: "Lab storefront menu for Continuity shine-in demos.",
      },
    ],
  }),
  component: McFlamingoMenuForward,
});

const MENU_HREF = "/mcflamingo/index.html";

function McFlamingoMenuForward() {
  useEffect(() => {
    window.location.replace(MENU_HREF);
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f3e6d4] px-6">
      <p className="max-w-sm text-center text-[#1a1410]">
        Opening the McFlamingo menu…{" "}
        <a className="underline" href={MENU_HREF}>
          Open menu
        </a>
      </p>
    </main>
  );
}
