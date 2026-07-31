/* ============================================================
   Cathy Dolle — clone
   12 project entries + generated monochrome SVG artworks.
   Dark, sculptural, editorial mood on light-grey grounds —
   evoking the original without copying its assets.
   ============================================================ */

const PROJECTS = [
  { num: "01", name: "ARD",            art: "head",    h: 232 },
  { num: "02", name: "Pierre Cathala", art: "disc",    h: 210 },
  { num: "03", name: "Jean khamkwan",  art: "swan",    h: 264 },
  { num: "04", name: "Yeng",           art: "column",  h: 300 },
  { num: "05", name: "Prada Beauty",   art: "sphere",  h: 224 },
  { num: "06", name: "KLSR",           art: "drape",   h: 244 },
  { num: "07", name: "Michael Bardou", art: "head",    h: 248 },
  { num: "08", name: "Zhong Lin",      art: "sphere",  h: 214 },
  { num: "09", name: "Aishy",          art: "drape",   h: 268 },
  { num: "10", name: "Folio Template", art: "disc",    h: 218 },
  { num: "11", name: "Elie Leber",     art: "column",  h: 292 },
  { num: "12", name: "Rue Saint Abel", art: "swan",    h: 250 },
];

/* -- shared defs: noise grain + soft vignette used across pieces -- */
function defs(id) {
  return `
    <defs>
      <radialGradient id="lg${id}" cx="42%" cy="30%" r="85%">
        <stop offset="0%" stop-color="#f4f4f2"/>
        <stop offset="60%" stop-color="#e9e9e6"/>
        <stop offset="100%" stop-color="#dedddb"/>
      </radialGradient>
      <radialGradient id="metal${id}" cx="38%" cy="32%" r="75%">
        <stop offset="0%" stop-color="#5a5a5e"/>
        <stop offset="45%" stop-color="#2c2c30"/>
        <stop offset="100%" stop-color="#0b0b0d"/>
      </radialGradient>
      <linearGradient id="sheen${id}" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#3a3a40"/>
        <stop offset="50%" stop-color="#101013"/>
        <stop offset="100%" stop-color="#000"/>
      </linearGradient>
      <filter id="grain${id}">
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" result="n"/>
        <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.05 0"/>
        <feComposite operator="over" in2="SourceGraphic"/>
      </filter>
      <filter id="soft${id}" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="6"/>
      </filter>
    </defs>`;
}

const W = 720; // internal svg width (scales to column)

function artHead(id, h) {
  return `<svg viewBox="0 0 ${W} ${h}" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
    ${defs(id)}
    <rect width="${W}" height="${h}" fill="url(#lg${id})"/>
    <g filter="url(#grain${id})">
      <ellipse cx="360" cy="${h*0.62}" rx="150" ry="120" fill="url(#sheen${id})"/>
      <ellipse cx="300" cy="${h*0.42}" rx="70" ry="86" fill="url(#metal${id})"/>
      <ellipse cx="430" cy="${h*0.44}" rx="66" ry="82" fill="url(#metal${id})"/>
      <circle cx="360" cy="${h*0.66}" r="52" fill="#000" opacity="0.85"/>
      <ellipse cx="322" cy="${h*0.36}" rx="16" ry="22" fill="#050506"/>
      <ellipse cx="404" cy="${h*0.36}" rx="16" ry="22" fill="#050506"/>
      <ellipse cx="330" cy="${h*0.30}" rx="60" ry="34" fill="#1a1a1e" opacity="0.6"/>
      <ellipse cx="315" cy="${h*0.38}" rx="8" ry="10" fill="#8a8a90" opacity="0.7"/>
    </g>
  </svg>`;
}

function artDisc(id, h) {
  const cx = 360, cy = h / 2, r = Math.min(h * 0.42, 200);
  let rings = "";
  for (let i = 0; i < 14; i++) {
    rings += `<circle cx="${cx}" cy="${cy}" r="${r - i * (r/16)}" fill="none" stroke="#000" stroke-opacity="${0.05 + (i%3)*0.03}" stroke-width="1"/>`;
  }
  return `<svg viewBox="0 0 ${W} ${h}" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
    ${defs(id)}
    <rect width="${W}" height="${h}" fill="url(#lg${id})"/>
    <g filter="url(#grain${id})">
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#metal${id})"/>
      ${rings}
      <line x1="${cx}" y1="${cy}" x2="${cx - r*0.7}" y2="${cy - r*0.7}" stroke="#dcdcdc" stroke-width="2" stroke-opacity="0.5"/>
      <circle cx="${cx}" cy="${cy}" r="14" fill="#050506"/>
      <path d="M${cx-r} ${cy} A${r} ${r} 0 0 1 ${cx} ${cy-r}" fill="none" stroke="#9a9aa0" stroke-width="3" stroke-opacity="0.4"/>
    </g>
  </svg>`;
}

function artSphere(id, h) {
  return `<svg viewBox="0 0 ${W} ${h}" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
    ${defs(id)}
    <rect width="${W}" height="${h}" fill="url(#lg${id})"/>
    <g filter="url(#grain${id})">
      <ellipse cx="360" cy="${h-24}" rx="150" ry="20" fill="#000" opacity="0.12" filter="url(#soft${id})"/>
      <circle cx="300" cy="${h*0.52}" r="${h*0.30}" fill="url(#metal${id})"/>
      <circle cx="440" cy="${h*0.44}" r="${h*0.24}" fill="url(#sheen${id})"/>
      <circle cx="386" cy="${h*0.66}" r="${h*0.19}" fill="#08080a"/>
      <circle cx="286" cy="${h*0.40}" r="${h*0.07}" fill="#7f7f86" opacity="0.65"/>
      <circle cx="430" cy="${h*0.36}" r="${h*0.04}" fill="#a7a7ad" opacity="0.7"/>
    </g>
  </svg>`;
}

function artDrape(id, h) {
  return `<svg viewBox="0 0 ${W} ${h}" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
    ${defs(id)}
    <rect width="${W}" height="${h}" fill="url(#lg${id})"/>
    <g filter="url(#grain${id})">
      <path d="M120 ${h} C160 ${h*0.2} 300 ${h*0.1} 360 ${h*0.34}
               C420 ${h*0.1} 560 ${h*0.2} 600 ${h}
               C520 ${h*0.7} 200 ${h*0.7} 120 ${h} Z" fill="url(#sheen${id})"/>
      <path d="M240 ${h} C260 ${h*0.4} 340 ${h*0.36} 360 ${h*0.52}
               C380 ${h*0.36} 460 ${h*0.4} 480 ${h}
               C420 ${h*0.78} 300 ${h*0.78} 240 ${h} Z" fill="#000" opacity="0.7"/>
      <path d="M300 ${h*0.5} C330 ${h*0.62} 390 ${h*0.62} 420 ${h*0.5}" fill="none" stroke="#7a7a80" stroke-width="2" stroke-opacity="0.5"/>
    </g>
  </svg>`;
}

function artColumn(id, h) {
  let flutes = "";
  const n = 9, top = h*0.08, bot = h*0.92, x0 = 250, x1 = 470, step = (x1 - x0) / (n - 1);
  for (let i = 0; i < n; i++) {
    const x = x0 + i * step;
    flutes += `<rect x="${x-6}" y="${top}" width="12" height="${bot-top}" rx="6" fill="${i%2? '#050506':'url(#metal'+id+')'}" opacity="${i%2?0.9:1}"/>`;
  }
  return `<svg viewBox="0 0 ${W} ${h}" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
    ${defs(id)}
    <rect width="${W}" height="${h}" fill="url(#lg${id})"/>
    <g filter="url(#grain${id})">
      <rect x="228" y="${top-14}" width="264" height="16" fill="#0a0a0c"/>
      <rect x="228" y="${bot}" width="264" height="16" fill="#0a0a0c"/>
      ${flutes}
    </g>
  </svg>`;
}

function artSwan(id, h) {
  return `<svg viewBox="0 0 ${W} ${h}" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
    ${defs(id)}
    <rect width="${W}" height="${h}" fill="url(#lg${id})"/>
    <g filter="url(#grain${id})">
      <ellipse cx="370" cy="${h-20}" rx="160" ry="18" fill="#000" opacity="0.12" filter="url(#soft${id})"/>
      <path d="M250 ${h*0.9}
               C210 ${h*0.55} 300 ${h*0.3} 370 ${h*0.42}
               C440 ${h*0.3} 520 ${h*0.5} 470 ${h*0.86}
               C540 ${h*0.5} 470 ${h*0.16} 400 ${h*0.2}
               C350 ${h*0.22} 330 ${h*0.34} 340 ${h*0.44}
               C300 ${h*0.5} 250 ${h*0.62} 250 ${h*0.9} Z"
            fill="url(#sheen${id})"/>
      <path d="M360 ${h*0.44} C330 ${h*0.56} 340 ${h*0.74} 400 ${h*0.8}"
            fill="none" stroke="#000" stroke-width="10" stroke-opacity="0.5"/>
      <circle cx="398" cy="${h*0.22}" r="9" fill="#0a0a0c"/>
    </g>
  </svg>`;
}

const RENDERERS = { head: artHead, disc: artDisc, sphere: artSphere, drape: artDrape, column: artColumn, swan: artSwan };

function renderArt(project, id) {
  return RENDERERS[project.art](id, project.h);
}
