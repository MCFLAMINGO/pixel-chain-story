import { useMemo } from "react";
import { renderSVG } from "uqr";
import { payFaceShareUrl } from "@/lib/pixel/pay-link";

/** Compact SVG QR for a pay face — address rail, not the vault. */
export function PayFaceQr(props: { address: string; size?: number; className?: string }) {
  const href = useMemo(() => payFaceShareUrl(props.address), [props.address]);
  const svg = useMemo(
    () =>
      renderSVG(href, {
        ecc: "L",
        border: 2,
        whiteColor: "#0c1410",
        blackColor: "#6ee7b7",
      }),
    [href],
  );
  const size = props.size ?? 180;
  return (
    <div
      className={props.className}
      style={{ width: size, height: size }}
      dangerouslySetInnerHTML={{ __html: svg }}
      role="img"
      aria-label={`Pay face QR for ${props.address}`}
    />
  );
}
