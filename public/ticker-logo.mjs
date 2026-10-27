/** Catalog letter-marks and initials fallback (CSP img-src 'self' via /logos/{TICKER}.svg). */

const CATALOG_COLORS = {
  AMD: '#3B82F6',
  MSFT: '#0F172A',
  GOOGL: '#1142E8',
  AMZN: '#64748B',
  TSM: '#3B82F6',
  MELI: '#0F172A',
  BABA: '#EF4444',
  VALE: '#059669',
  FCX: '#D97706',
  YPF: '#0F172A',
  PAM: '#059669',
  VIST: '#10B981',
  GGAL: '#3B82F6',
  KO: '#EF4444',
  GLD: '#D97706',
};

const FALLBACK_PALETTE = ['#3B82F6', '#0F172A', '#1142E8', '#059669', '#D97706', '#EF4444'];

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]));
}

export function normalizeTicker(ticker) {
  return String(ticker || '').trim().toUpperCase().replace(/[^A-Z0-9.]/g, '').slice(0, 8);
}

export function tickerInitials(ticker, name = '') {
  const code = normalizeTicker(ticker);
  if (code) return code.length <= 4 ? code : code.slice(0, 3);
  const words = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  if (words[0]) return words[0].slice(0, 2).toUpperCase();
  return '?';
}

export function tickerColor(ticker) {
  const code = normalizeTicker(ticker);
  if (CATALOG_COLORS[code]) return CATALOG_COLORS[code];
  let hash = 0;
  for (let i = 0; i < code.length; i++) hash = (hash * 33 + code.charCodeAt(i)) >>> 0;
  return FALLBACK_PALETTE[hash % FALLBACK_PALETTE.length];
}

export function tickerLogoSvg(ticker, name = '', size = 24) {
  const code = normalizeTicker(ticker) || '—';
  const initials = tickerInitials(code, name);
  const color = tickerColor(code);
  const fontSize = initials.length >= 4 ? 8 : initials.length === 3 ? 9.5 : 11;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" role="img" aria-label="${esc(code)}">
  <rect width="24" height="24" rx="2" fill="${color}"/>
  <text x="12" y="16.2" text-anchor="middle" fill="#FFFFFF" font-family="system-ui,sans-serif" font-size="${fontSize}" font-weight="600">${esc(initials)}</text>
</svg>`;
}

export function tickerMarkHtml(ticker, name = '') {
  const code = normalizeTicker(ticker);
  if (!code) return '';
  const initials = tickerInitials(code, name);
  const color = tickerColor(code);
  const src = `/logos/${encodeURIComponent(code)}.svg`;
  return `<span class="ticker-mark" style="--ticker-color:${color}" data-ticker="${esc(code)}"><span class="ticker-fallback" aria-hidden="true">${esc(initials)}</span><img class="ticker-logo" src="${src}" alt="" width="24" height="24" loading="lazy" decoding="async"></span>`;
}

export function tickerIdHtml(ticker, name = '') {
  const code = normalizeTicker(ticker);
  if (!code) return '';
  const title = esc(name || code);
  return `<span class="ticker-id" title="${title}">${tickerMarkHtml(code, name)}<span class="ticker">${esc(code)}</span></span>`;
}

export function bindTickerLogoFallbacks(root) {
  if (typeof document === 'undefined') return;
  const scope = root || document;
  scope.querySelectorAll('img.ticker-logo').forEach(img => {
    if (img.dataset.bound === '1') return;
    img.dataset.bound = '1';
    const hide = () => {
      img.hidden = true;
    };
    img.addEventListener('error', hide);
    if (img.complete && img.naturalWidth === 0) hide();
  });
}
