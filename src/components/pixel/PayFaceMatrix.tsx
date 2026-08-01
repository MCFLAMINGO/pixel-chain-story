import { useEffect, useState } from "react";
import { patternToCssGrid, type OpticalPattern } from "@/lib/pixel/optical";
import { encodePayFaceMatrix } from "@/lib/pixel/pay-face-optical";

/** 16×16 pay-face Kindling matrix — public address only, never vault. */
export function PayFaceMatrix(props: {
  address: string;
  className?: string;
  onReady?: (pattern: OpticalPattern) => void;
}) {
  const [colors, setColors] = useState<string[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const onReady = props.onReady;
  useEffect(() => {
    let cancelled = false;
    setColors(null);
    setErr(null);
    void encodePayFaceMatrix(props.address)
      .then((pattern) => {
        if (cancelled) return;
        setColors(patternToCssGrid(pattern));
        onReady?.(pattern);
      })
      .catch((e) => {
        if (!cancelled) setErr(e instanceof Error ? e.message : "matrix failed");
      });
    return () => {
      cancelled = true;
    };
  }, [props.address, onReady]);

  if (err) {
    return <p className="text-xs text-amber-200/90">{err}</p>;
  }
  if (!colors) {
    return <p className="text-xs text-white/40">Kindling face…</p>;
  }

  return (
    <div
      className={props.className}
      data-optical-pay-face="1"
      role="img"
      aria-label={`Kindling pay face for ${props.address}`}
    >
      <div
        className="grid aspect-square w-full max-w-[14rem] gap-px border border-emerald-400/25 bg-black/60 p-1"
        style={{ gridTemplateColumns: "repeat(16, 1fr)" }}
      >
        {colors.map((c, i) => (
          <div key={i} style={{ background: c }} />
        ))}
      </div>
    </div>
  );
}
