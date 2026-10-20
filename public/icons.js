// Shared line icons for the website and private workspace.
const icons={home:'<path d="m3 10 9-7 9 7v10H4V10m5 10v-7h6v7"/>',chart:'<path d="M4 20V10m6 10V4m6 16v-8m5 8V7"/>',plus:'<path d="M12 5v14M5 12h14"/>',chat:'<path d="M21 11a8 8 0 0 1-8 8H6l-4 3 1-7a8 8 0 0 1 7-12h3a8 8 0 0 1 8 8Z"/>',settings:'<path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z"/><path d="m9 3-1 3-3 1-2 4 2 3 1 4 4 3 3-1 4-1 3-4-1-3-1-4-4-3Z"/>',leaf:'<path d="M4 20c1-8 10-5 15-16 2 13-6 18-12 12m-3 4 9-9"/>',bolt:'<path d="m13 2-9 12h7l-1 8 10-13h-7l1-7Z"/>',globe:'<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c6 7 6 11 0 18-6-7-6-11 0-18Z"/>',bell:'<path d="M5 17h14l-2-4V9a5 5 0 0 0-10 0v4l-2 4Zm5 3h4"/>',close:'<path d="m6 6 12 12M6 18 18 6"/>',menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',check:'<path d="m5 12 4 4L20 5"/>',link:'<path d="m10 14 4-4m-6 6-2 2a4 4 0 0 1-6-6l4-4m12-2 2-2a4 4 0 0 1 6 6l-4 4"/>',clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',spark:'<path d="m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3Z"/>'};
Object.assign(icons, {
  radar:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><path d="m12 12 6-6M12 3v2M3 12h2m7 7v2m7-9h2"/><circle cx="12" cy="12" r="1"/>',
  layers:'<path d="m12 2 10 5-10 5L2 7l10-5Zm-9 10 9 5 9-5m-18 5 9 5 9-5"/>',
  search:'<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6M7 10h6m-3-3v6"/>',
  file:'<path d="M5 2h10l4 4v16H5V2Zm10 0v5h4M8 11h8m-8 4h8m-8 4h5"/>',
  history:'<path d="M3 11a9 9 0 1 1 2 7M3 4v7h7m2-4v5l3 2"/>',
  branch:'<circle cx="6" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="5" r="2"/><path d="M6 7v10m12-10v3c0 5-12 0-12 5"/>',
  shield:'<path d="m12 2 8 3v7c0 5-8 10-8 10S4 17 4 12V5l8-3Z"/><path d="m8 12 3 3 5-6"/>',
  lock:'<rect x="5" y="10" width="14" height="11" rx="1"/><path d="M8 10V6a4 4 0 0 1 8 0v4m-4 5v2"/>',
  chip:'<rect x="6" y="6" width="12" height="12" rx="1"/><path d="M9 2v4m6-4v4m-6 12v4m6-4v4M2 9h4m-4 6h4m12-6h4m-4 6h4"/><rect x="9" y="9" width="6" height="6"/>',
  key:'<circle cx="8" cy="8" r="5"/><path d="m12 12 9 9m-5-5 3-3m-6 0 3-3"/>',
  bank:'<path d="m3 7 9-4 9 4H3Zm2 3v8m7-8v8m7-8v8M3 21h18M2 18h20"/>',
  info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v1"/>',
  arrow:'<path d="M5 19 19 5M5 5h14v14"/>',
  chevron:'<path d="m9 6 6 6-6 6"/>',
  download:'<path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4"/>',
  user:'<circle cx="12" cy="8" r="4"/><path d="M4 20c1.5-4 6-6 8-6s6.5 2 8 6"/>',
  exit:'<path d="M9 3H4v18h5m-1-9h13m-5-5 5 5-5 5"/>',
  refresh:'<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
});
export const icon=name=>`<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${icons[name]||icons.radar}</svg>`;
