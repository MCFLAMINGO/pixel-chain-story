import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { MCFLAMINGO_ORIGIN_URL } from "@/lib/pixel/continuity-ops";

/**
 * `/mcflamingo` and `/mcflamingo/` used to hit the SPA 404.
 * Humans belong on the live restaurant — never a fake local menu.
 */
export const Route = createFileRoute("/mcflamingo")({
  head: () => ({
    meta: [
      { title: "McFlamingo → www.mcflamingo.com" },
      {
        name: "description",
        content: "Continuity booth redirect to the live McFlamingo Popmenu site.",
      },
      { httpEquiv: "refresh", content: `0;url=${MCFLAMINGO_ORIGIN_URL}` },
    ],
  }),
  component: McFlamingoLiveRedirect,
});

function McFlamingoLiveRedirect() {
  useEffect(() => {
    window.location.replace(MCFLAMINGO_ORIGIN_URL);
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f3e6d4] px-6">
      <p className="max-w-sm text-center text-[#1a1410]">
        Opening the real McFlamingo site…{" "}
        <a className="underline" href={MCFLAMINGO_ORIGIN_URL}>
          www.mcflamingo.com
        </a>
      </p>
    </main>
  );
}
