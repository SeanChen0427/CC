const shade = '#465446';
const shapes = {
  vest: `<path d="M149 126l43-29c13 21 63 21 76 0l43 29 26 60-39 25-16-23v155H178V188l-16 23-39-25z" fill="url(#fabric)"/><path d="M193 99q37 59 74 0" fill="none" stroke="#eee6d9" stroke-width="13"/><path d="M181 325h98M180 314h100" stroke="#eee5d6" stroke-width="4"/><path d="M187 155v145M199 158v143M211 161v140M223 163v138M235 163v138M247 161v140M259 158v143M271 155v145" stroke="#fff" opacity=".14" stroke-width="5"/><path d="M178 233h104" stroke="#fff" opacity=".16" stroke-width="2"/><rect x="224" y="186" width="24" height="21" rx="3" fill="#eee8dd"/><path d="M230 198q5-9 12 0" fill="none" stroke="${shade}" stroke-width="2"/>`,
  coat: `<path d="M152 133l42-35q38 24 73 0l43 35 28 88-46 17-15-41v149H181V197l-16 41-45-17z" fill="url(#fabric)"/><path d="M193 99q38-29 75 0l-13 44h-48z" fill="#ece4d7"/><path d="M230 138v208" stroke="#f4ecdf" stroke-width="5"/><path d="M183 188l91 87M184 248l88-77M183 302l88-78M183 193l91 90" stroke="#fff" stroke-opacity=".17" fill="none" stroke-width="2"/><path d="M190 287h27v29h-27M245 287h27v29h-27" fill="#fff" opacity=".18"/><path d="M184 333h91" stroke="#f4ecdf" stroke-width="6"/>`,
  bag: `<path d="M157 172q-4-17 17-17h112q21 0 17 17l22 156q2 18-19 18H154q-21 0-19-18z" fill="url(#fabric)"/><path d="M187 166v-39q0-40 42-40t43 40v39" fill="none" stroke="${shade}" stroke-width="12" stroke-linecap="round" opacity=".8"/><path d="M163 181l-10 144h152l-12-144" fill="none" stroke="#fff" stroke-opacity=".23" stroke-width="2"/><rect x="203" y="233" width="54" height="42" rx="2" fill="#f3eee4"/><text x="230" y="249" text-anchor="middle" font-family="Georgia" font-size="8" fill="#5c6456">CCBABY</text><text x="230" y="262" text-anchor="middle" font-family="Georgia" font-size="5" letter-spacing="2" fill="#6d7565">SEOUL</text>`,
  bowl: `<ellipse cx="230" cy="314" rx="113" ry="21" fill="#000" opacity=".06"/><path d="M111 205q2 111 119 111t119-111" fill="url(#fabric)"/><ellipse cx="230" cy="205" rx="120" ry="43" fill="#e8e0d1"/><ellipse cx="230" cy="206" rx="98" ry="29" fill="url(#inside)"/><path d="M142 240q19 39 62 45" fill="none" stroke="#fff" opacity=".35" stroke-width="6" stroke-linecap="round"/><ellipse cx="230" cy="205" rx="119" ry="41" fill="none" stroke="#faf4e8" stroke-width="6"/>`,
  bed: `<ellipse cx="230" cy="286" rx="157" ry="56" fill="url(#fabric)"/><path d="M80 265q-20-72 54-100 92-38 192 4 63 29 53 92" fill="none" stroke="url(#fabric)" stroke-width="42"/><ellipse cx="230" cy="264" rx="121" ry="44" fill="#eee6d9"/><ellipse cx="230" cy="265" rx="100" ry="32" fill="url(#fabric)" opacity=".7"/><path d="M127 233q25-19 53-22M279 213q30 5 50 23" fill="none" stroke="#fff" opacity=".26" stroke-width="5" stroke-linecap="round"/><rect x="222" y="313" width="29" height="14" rx="2" fill="#f3eee5"/>`,
  toy: `<path d="M199 157q-33-38-55-10-18 28 25 43M264 157q33-38 55-10 18 28-25 43" fill="url(#fabric)"/><ellipse cx="230" cy="245" rx="88" ry="96" fill="url(#fabric)"/><ellipse cx="230" cy="262" rx="42" ry="32" fill="#e8ddc8"/><ellipse cx="203" cy="220" rx="5" ry="6" fill="#534a3d"/><ellipse cx="258" cy="220" rx="5" ry="6" fill="#534a3d"/><path d="M223 250q7-7 14 0l-7 8zM230 257v10m0-1q-12 10-18 0m18 0q12 10 18 0" fill="#534a3d" stroke="#534a3d" stroke-width="2"/><path d="M157 277l-20 37q-7 22 22 20l30-17M302 277l20 37q7 22-22 20l-30-17" fill="url(#fabric)"/>`,
  scarf: `<path d="M104 167q126-59 252 0L230 335z" fill="url(#fabric)"/><path d="M121 176l109 139 109-139" fill="none" stroke="#eee8d9" stroke-width="3" stroke-dasharray="5 5"/><path d="M131 177l183 95M170 151l161 85M133 223l126 65M330 171L176 281M284 154L153 247" stroke="#fff" opacity=".22" stroke-width="7"/><path d="M104 167l-24 10 18 35 40-16M356 167l24 10-18 35-40-16" fill="url(#fabric)"/><circle cx="230" cy="299" r="6" fill="#f4ebd9"/>`,
};

export function art(kind = 'vest', color = '#c4b294', angle = 0) {
  const safe = /^#[a-fA-F0-9]{6}$/.test(color) ? color : '#c4b294';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="460" height="460" viewBox="0 0 460 460">
  <defs>
    <radialGradient id="bg"><stop stop-color="#fbf8f1"/><stop offset="1" stop-color="#eae5dc"/></radialGradient>
    <linearGradient id="fabric" x1="0" y1="0" x2=".8" y2="1"><stop stop-color="${safe}"/><stop offset=".6" stop-color="${safe}"/><stop offset="1" stop-color="#776c59"/></linearGradient>
    <radialGradient id="inside"><stop stop-color="${safe}"/><stop offset="1" stop-color="#8b8171"/></radialGradient>
    <filter id="shadow" x="-.4" y="-.4" width="1.8" height="1.8"><feDropShadow dx="2" dy="14" stdDeviation="10" flood-color="#665741" flood-opacity=".15"/></filter>
    <filter id="grain"><feTurbulence type="fractalNoise" baseFrequency=".8" numOctaves="2" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="linear" slope=".055"/></feComponentTransfer><feBlend mode="multiply" in="SourceGraphic"/></filter>
  </defs>
  <rect width="460" height="460" fill="url(#bg)"/>
  <path d="M0 0h460v65L0 288z" fill="#fff" opacity=".23"/>
  <ellipse cx="234" cy="355" rx="110" ry="14" fill="#978770" opacity=".08"/>
  <g transform="rotate(${Number(angle) || 0} 230 230)" filter="url(#shadow)">${shapes[kind] || shapes.vest}</g>
  <rect width="460" height="460" fill="transparent" filter="url(#grain)" opacity=".45"/>
  </svg>`;
}
