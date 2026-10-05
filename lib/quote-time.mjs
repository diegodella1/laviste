const TZ = 'America/Argentina/Buenos_Aires';

export function artParts(date = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      weekday: 'short',
      hourCycle: 'h23',
    }).formatToParts(date).map(p => [p.type, p.value]),
  );
  return parts;
}

export function artWallClockToDate(year, month, day, hour, minute) {
  return new Date(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00-03:00`);
}

/** Mon–Fri ~11:00–17:00 ART (BYMA regular session). */
export function isMarketOpen(now = new Date()) {
  const p = artParts(now);
  if (p.weekday === 'Sat' || p.weekday === 'Sun') return false;
  const hm = Number(p.hour) * 60 + Number(p.minute);
  return hm >= 11 * 60 && hm < 17 * 60;
}

/** Last BYMA session close (17:00 ART) at or before `now`. */
export function lastSessionCloseIso(now = new Date()) {
  let probe = new Date(now);
  for (let i = 0; i < 14; i++) {
    const p = artParts(probe);
    if (p.weekday !== 'Sat' && p.weekday !== 'Sun') {
      const close = artWallClockToDate(Number(p.year), Number(p.month), Number(p.day), 17, 0);
      if (close.getTime() <= now.getTime()) return close.toISOString();
    }
    probe = new Date(probe.getTime() - 86_400_000);
  }
  const p = artParts(now);
  return artWallClockToDate(Number(p.year), Number(p.month), Number(p.day), 17, 0).toISOString();
}

/** Prefer provider market time; else fetch time only while open; else last session close. */
export function resolveQuoteAsOf({providerMarketTimeSec, fetchedAt = new Date()}) {
  if (Number.isFinite(providerMarketTimeSec) && providerMarketTimeSec > 0) {
    return new Date(providerMarketTimeSec * 1000).toISOString();
  }
  if (isMarketOpen(fetchedAt)) return fetchedAt.toISOString();
  return lastSessionCloseIso(fetchedAt);
}
