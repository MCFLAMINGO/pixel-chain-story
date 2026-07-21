import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { MCFLAMINGO_MENU_URL } from "@/lib/pixel/continuity-ops";

/**
 * `/mcflamingo` must never SPA-404. Humans go to the live restaurant menu.
 */
export const Route = createFileRoute("/mcflamingo")({
  head: () => ({
    meta: [
      { title: "McFlamingo → live menu" },
      {
        name: "description",
        content: "Redirect to the live McFlamingo Popmenu menu.",
      },
      { httpEquiv: "refresh", content: `0;url=${MCFLAMINGO_MENU_URL}` },
    ],
  }),
  component: McFlamingoLiveRedirect,
});

function McFlamingoLiveRedirect() {
  useEffect(() => {
    window.location.replace(MCFLAMINGO_MENU_URL);
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f3e6d4] px-6">
      <p className="max-w-sm text-center text-[#1a1410]">
        Opening the live McFlamingo menu…{" "}
        <a className="underline" href={MCFLAMINGO_MENU_URL}>
          www.mcflamingo.com/menu
        </a>
      </p>
    </main>
  );
}
