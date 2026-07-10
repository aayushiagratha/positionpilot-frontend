import { createFileRoute } from "@tanstack/react-router";
import { DottedSurface } from "@/components/ui/dotted-surface";
import { GooeyText } from "@/components/ui/gooey-text-morphing";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/prototype")({
  component: PrototypePage,
});

// "Chalk Slate" palette, scoped to this route only — not wired into the
// global design tokens in styles.css until this look is approved.
const chalkSlate = {
  background: "#eef2f8",
  text: "#12141c",
};

function PrototypePage() {
  return (
    <div className="relative flex h-screen w-full items-center justify-center overflow-hidden">
      {/* DottedSurface is position:fixed with z-index:-1, which escapes to
          the document's root stacking context. A plain background on this
          wrapper would sit at the default stacking level (above -1) and
          paint over the canvas, so the background needs its own fixed
          layer further back than the canvas. */}
      <div
        aria-hidden="true"
        className="fixed inset-0 -z-10"
        style={{ backgroundColor: chalkSlate.background }}
      />

      <DottedSurface className="size-full" />

      <div className="absolute inset-0 flex items-center justify-center">
        <div
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute -top-10 left-1/2 size-full -translate-x-1/2 rounded-full",
            "bg-[radial-gradient(ellipse_at_center,rgba(18,20,28,0.08),transparent_50%)]",
            "blur-[30px]",
          )}
        />

        <GooeyText
          texts={["Position", "Launch", "Grow", "Win"]}
          morphTime={1}
          cooldownTime={0.5}
          className="font-bold"
          textClassName="text-[#12141c]"
        />
      </div>
    </div>
  );
}
