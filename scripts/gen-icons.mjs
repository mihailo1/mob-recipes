// Generates app icons into public/icons from one SVG mark. Run: node scripts/gen-icons.mjs
import sharp from "sharp";
import { writeFileSync } from "node:fs";

const TILE = "#d4451f";
const INK = "#fafaf6";
const M = "M150 360V156l106 142 106-142v204";
const svg = ({ rounded = true, scale = 1 } = {}) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">` +
  `<rect width="512" height="512"${rounded ? ' rx="112"' : ""} fill="${TILE}"/>` +
  `<path d="${M}" transform="translate(256 258) scale(${scale}) translate(-256 -258)" ` +
  `fill="none" stroke="${INK}" stroke-width="74" stroke-linecap="round" stroke-linejoin="round"/></svg>\n`;

const out = (f) => new URL(`../public/icons/${f}`, import.meta.url);
// opaque=true flattens alpha away (iOS renders transparency as black).
const png = (s, size, f, opaque = false) => {
  let img = sharp(Buffer.from(s), { density: 288 }).resize(size, size);
  if (opaque) img = img.flatten({ background: TILE });
  return img.png({ compressionLevel: 9 }).toFile(out(f).pathname);
};

writeFileSync(out("icon.svg"), svg());
await png(svg(), 32, "icon-32.png");
await png(svg(), 192, "icon-192.png");
await png(svg(), 512, "icon-512.png");
await png(svg({ rounded: false, scale: 0.92 }), 180, "apple-touch-icon.png", true);
await png(svg({ rounded: false, scale: 0.72 }), 512, "maskable-512.png", true);

// favicon.ico for clients that blindly request /favicon.ico (ICO wrapping a 32px PNG).
const p = await sharp(Buffer.from(svg()), { density: 288 }).resize(32, 32).png().toBuffer();
const head = Buffer.alloc(22);
head.writeUInt16LE(1, 2);
head.writeUInt16LE(1, 4);
head.writeUInt8(32, 6);
head.writeUInt8(32, 7);
head.writeUInt16LE(1, 10);
head.writeUInt16LE(32, 12);
head.writeUInt32LE(p.length, 14);
head.writeUInt32LE(22, 18);
writeFileSync(new URL("../public/favicon.ico", import.meta.url), Buffer.concat([head, p]));
