"use client";

import { useMemo } from "react";
import qrcode from "qrcode-generator";

/** A QR code for `text` as crisp SVG (dark modules on white, 4 module margin). */
export default function QrCode({ text, size = 220, label = "QR code" }) {
  const { n, d } = useMemo(() => {
    const qr = qrcode(0, "M");
    qr.addData(text);
    qr.make();
    const count = qr.getModuleCount();
    let path = "";
    for (let y = 0; y < count; y++) {
      for (let x = 0; x < count; x++) {
        if (qr.isDark(y, x)) path += `M${x + 4} ${y + 4}h1v1h-1z`;
      }
    }
    return { n: count + 8, d: path };
  }, [text]);

  return (
    <svg
      className="qr-code"
      width={size}
      height={size}
      viewBox={`0 0 ${n} ${n}`}
      shapeRendering="crispEdges"
      role="img"
      aria-label={label}
    >
      <rect width={n} height={n} fill="#fff" />
      <path d={d} fill="#111" />
    </svg>
  );
}
