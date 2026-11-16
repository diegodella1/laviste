/**
 * «Cierre del día»: formato de %, paridad HTML/TXT, solo porcentajes, español,
 * estados vacíos y límites (§6–§8 de la SoT 2026-11-16).
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildSupertakeEmail, DIGEST_SUPERTAKE_PROPOSALS, MAX_THESES_ROWS, MAX_CHANGE_CARDS} from '../lib/digest-supertake.mjs';
import {formatPct, formatWeight, sparkAlt, formatEyebrowDate} from '../lib/email-templates/supertake-copy.mjs';
import {FIXTURE_DOWN, FIXTURE_UP, cloneFixture} from './fixtures/digest-supertake-fixtures.mjs';

const NN = '\u202F';
const NB = '\u00A0';

function htmlToText(html) {
  return html
    .replace(/<style[\s\S]*?<\/style>/g, '')
    .replace(/<title>[\s\S]*?<\/title>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#8239;/g, NN)
    .replace(/&nbsp;/g, NB)
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, '&');
}

const PCT_RE = /[▲▼=]\u00A0[+\u2212]?\d+,\d\u202F%/g;

test('% format: sign always, comma, 1 decimal, NNBSP, U+2212, «=» for zero', () => {
  assert.equal(formatPct(0.012), `▲${NB}+1,2${NN}%`);
  assert.equal(formatPct(-0.018), `▼${NB}\u22121,8${NN}%`);
  assert.equal(formatPct(0), `=${NB}0,0${NN}%`);
  assert.equal(formatPct(-0.0004), `=${NB}0,0${NN}%`);
  assert.equal(formatPct(0.006, {html: true}), '▲&nbsp;+0,6&#8239;%');
  assert.equal(formatPct(-0.053, {glyph: false}), `\u22125,3${NN}%`);
  assert.equal(formatWeight(0.35), `35${NN}%`);
  assert.equal(formatWeight(0.004), `0,4${NN}%`);
  assert.ok(!formatPct(-0.041).includes('-'), 'ASCII hyphen-minus is never used');
});

test('eyebrow date and sparkline alt follow the copy deck', () => {
  assert.equal(formatEyebrowDate('2026-11-16'), 'lunes 16 nov 2026');
  assert.equal(sparkAlt('Energía local', -0.032, -0.041), 'Gráfico de la última semana de Energía local: baja 3,2 % en 5 ruedas, con el último día en baja.');
  assert.equal(sparkAlt('X', 0, 0), 'Gráfico de la última semana de X: quedó plana en 5 ruedas, con el último día sin cambios.');
});

test('subject and preheader match the approved mocks', () => {
  const down = buildSupertakeEmail(cloneFixture(FIXTURE_DOWN));
  assert.equal(down.subject, `Cierre del día: resumen de tu cartera ▼${NB}\u22121,8${NN}% · 2 tesis cambiaron de estado`);
  assert.equal(down.view.preheader, 'El mercado cerró. Energía local pasó a Para vigilar y Comercio digital volvió a En camino.');
  const up = buildSupertakeEmail(cloneFixture(FIXTURE_UP));
  assert.equal(up.subject, `Cierre del día: resumen de tu cartera ▲${NB}+0,6${NN}% · sin cambios de estado`);
  assert.equal(up.view.preheader, 'El mercado cerró. Bancos argentinos lideró el día y tus tesis siguen como ayer.');
});

test('main mock structure: hero, glance, changes ordered by severity, rows by |contribution|', () => {
  const {bodyText, view} = buildSupertakeEmail(cloneFixture(FIXTURE_DOWN));
  assert.ok(bodyText.startsWith('CIERRE DEL DÍA · LUNES 16 NOV 2026\nResultado total del día · Pérdida del día\n'));
  assert.ok(bodyText.includes(`Tu cartera cerró ▼${NB}\u22121,8${NN}% hoy`));
  assert.ok(bodyText.includes('Hoy: 1 de 4 tesis en alza · 2 cambios de estado'));
  assert.deepEqual(view.changes.map(t => t.name), ['Energía local', 'Comercio digital']);
  assert.deepEqual(view.rows.map(t => t.name), ['Energía local', 'Cripto de reserva', 'Comercio digital', 'Bancos argentinos']);
  assert.ok(bodyText.includes('Pasó de En camino a Para vigilar'));
  assert.ok(bodyText.includes('Energía local [Para vigilar] — hoy'));
  assert.ok(bodyText.includes(`YPF ▼${NB}\u22125,3${NN}% lideró · Peso 35${NN}%`));
  assert.ok(bodyText.includes('Ver qué cambió: https://laviste.diegodella.ar/app#/tesis/energia-local'));
});

test('explanations always close with «ruido de mercado» or «rompe la tesis» (only En riesgo)', () => {
  const data = cloneFixture(FIXTURE_DOWN);
  data.theses[1].statusPrev = 'watch';
  data.theses[1].reasonCode = 'risk';
  const {view} = buildSupertakeEmail(data);
  for (const t of view.changes) {
    if (t.status === 'risk') assert.match(t.explanation, /romper la tesis/);
    else if (t.status === 'watch') assert.match(t.explanation, /ruido de mercado/);
    else assert.match(t.explanation, /vuelve a «En camino»/);
    assert.equal(t.explanationSource, 'template');
  }
  assert.equal(view.changes[0].status, 'risk', 'severity first: risk > watch > ok');
});

test('empty state «Sin cambios de estado hoy» is shown, not hidden', () => {
  const {bodyHtml, bodyText} = buildSupertakeEmail(cloneFixture(FIXTURE_UP));
  for (const body of [bodyHtml, bodyText]) {
    assert.ok(body.includes('Sin cambios de estado hoy'));
    assert.ok(body.includes('Tus 4 tesis siguen como ayer. Abajo está cómo le fue a cada una.'));
    assert.ok(body.includes('Cambios de estado') || body.includes('CAMBIOS DE ESTADO'));
  }
  assert.ok(bodyText.includes(`MELI =${NB}0,0${NN}% · sin movimiento hoy · Peso 20${NN}%`));
});

test('HTML/TXT parity: same theses, same order, same percentages', () => {
  for (const fx of [FIXTURE_DOWN, FIXTURE_UP]) {
    const {bodyHtml, bodyText, view} = buildSupertakeEmail(cloneFixture(fx));
    const flat = htmlToText(bodyHtml);
    const pctHtml = [...new Set(flat.match(PCT_RE))].sort();
    const pctTxt = [...new Set(bodyText.match(PCT_RE))].sort();
    assert.deepEqual(pctHtml, pctTxt);
    const pos = (s, name) => s.indexOf(name, s.indexOf('Todas tus tesis') >= 0 ? s.indexOf('Todas tus tesis') : s.indexOf('TODAS TUS TESIS'));
    const orderHtml = view.rows.map(t => pos(flat, t.name));
    const orderTxt = view.rows.map(t => pos(bodyText, t.name));
    assert.deepEqual([...orderHtml].sort((a, b) => a - b), orderHtml);
    assert.deepEqual([...orderTxt].sort((a, b) => a - b), orderTxt);
    for (const s of ['Ver el panorama completo', 'Darse de baja o cambiar alertas', 'No constituye asesoramiento financiero', 'Recibís este resumen los días hábiles de mercado']) {
      assert.ok(flat.includes(s), `HTML missing ${s}`);
      assert.ok(bodyText.includes(s), `TXT missing ${s}`);
    }
    for (const t of view.changes) {
      assert.ok(bodyHtml.includes(t.explanation.replace(/\u00A0/g, '\u00A0')) || flat.includes(t.explanation));
      assert.ok(bodyText.includes(`| ${t.explanation}`));
    }
    assert.ok(!/&[a-z#0-9]+;/i.test(bodyText), 'TXT has no HTML entities');
  }
});

test('only percentages: no amounts, currencies or money values anywhere', () => {
  for (const fx of [FIXTURE_DOWN, FIXTURE_UP]) {
    const {bodyHtml, bodyText, subject, view} = buildSupertakeEmail(cloneFixture(fx));
    for (const body of [htmlToText(bodyHtml), bodyText, subject, view.preheader]) {
      assert.ok(!/\$|U\$S|\bUSD\b|\bARS\b|\bEUR\b/.test(body), 'no currency symbol or code');
      assert.ok(!/\bpesos\b|\bd[óo]lares?\b/i.test(body), 'no currency words');
      // Every number left must be a %, a weight %, a date, a count or the © year.
      const rest = body
        .replace(PCT_RE, '')
        .replace(/\d+(,\d)?\u202F%/g, '')
        .replace(/\b\d{1,2} (ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic) \d{4}\b/gi, '')
        .replace(/© 2026/g, '')
        .replace(/\b\d+ de \d+ tesis\b/g, '')
        .replace(/\b\d+ (tesis|cambios?|ruedas)\b/g, '')
        .replace(/https?:\/\/\S+/g, '');
      assert.deepEqual(rest.match(/\d[\d.,]*/g) || [], [], 'no stray numbers (amounts)');
    }
  }
});

test('Spanish only: no English UI strings, no JS, no SVG, no example banner', () => {
  const {bodyHtml, bodyText} = buildSupertakeEmail(cloneFixture(FIXTURE_DOWN));
  const flat = htmlToText(bodyHtml);
  for (const body of [flat, bodyText]) {
    assert.ok(!/\b(End-of-day|update|today|Practice money|See the full picture|led|Down|Up)\b/.test(body));
    assert.ok(!/Datos de ejemplo/.test(body), 'the example banner is not ported');
  }
  assert.ok(!/<script|<svg|data:image/i.test(bodyHtml));
  assert.ok(bodyHtml.includes('<html lang="es-AR">'));
});

test('sparklines: hosting off (proposal d) omits <img> and keeps «Semana %» text', () => {
  assert.equal(DIGEST_SUPERTAKE_PROPOSALS.sparklineHosting, 'off');
  const {bodyHtml} = buildSupertakeEmail(cloneFixture(FIXTURE_DOWN));
  assert.ok(!bodyHtml.includes('<img'));
  assert.ok(htmlToText(bodyHtml).includes('Semana'));
});

test('sparklines: with app hosting, immutable hashed URLs and descriptive alt', () => {
  const proposals = {...DIGEST_SUPERTAKE_PROPOSALS, sparklineHosting: 'app'};
  const {bodyHtml} = buildSupertakeEmail(cloneFixture(FIXTURE_DOWN), {proposals});
  const srcs = [...bodyHtml.matchAll(/<img src="([^"]+)"/g)].map(m => m[1]);
  assert.ok(srcs.length >= 5);
  for (const src of srcs) assert.match(src, /^https:\/\/laviste\.diegodella\.ar\/email\/spark\/[0-9a-f]{32}\.png$/);
  assert.ok(bodyHtml.includes('alt="Gráfico de la última semana de Energía local: baja 3,2 % en 5 ruedas, con el último día en baja."'));
  assert.ok(bodyHtml.includes('width="96" height="28"'));
});

test('missing weekly series omits the sparkline; missing weekPct hides «Semana»', () => {
  const data = cloneFixture(FIXTURE_UP);
  data.theses[0].weekSeries = null;
  data.theses[0].weekPct = null;
  const proposals = {...DIGEST_SUPERTAKE_PROPOSALS, sparklineHosting: 'app'};
  const {bodyText, view} = buildSupertakeEmail(data, {proposals});
  assert.equal(view.rows[0].sparkUrl, null);
  assert.ok(bodyText.includes(`Bancos argentinos [En camino] — hoy ▲${NB}+1,6${NN}%\n`));
});

test('row metric (proposal b): weight by default, contribution is a one-flag swap', () => {
  assert.equal(DIGEST_SUPERTAKE_PROPOSALS.rowMetric, 'weight');
  const proposals = {...DIGEST_SUPERTAKE_PROPOSALS, rowMetric: 'contribution'};
  const {bodyText} = buildSupertakeEmail(cloneFixture(FIXTURE_DOWN), {proposals});
  assert.ok(bodyText.includes(`YPF ▼${NB}\u22125,3${NN}% lideró · Aportó ▼${NB}\u22121,4${NN}% a la cartera`));
  assert.ok(!bodyText.includes('Peso '));
});

test('limits: more than 8 theses and more than 3 changes collapse into a link', () => {
  const data = cloneFixture(FIXTURE_DOWN);
  const extra = [];
  for (let i = 0; i < 8; i++) {
    extra.push({id: `t${i}`, name: `Tesis extra ${String.fromCharCode(65 + i)}`, weightPct: 0.01, dayPct: -0.035, contributionPct: -0.0001 * (i + 1),
      weekPct: -0.01, weekSeries: null, status: 'watch', statusPrev: 'ok', reasonCode: 'noise', topMover: null});
  }
  data.theses.push(...extra);
  const {view, bodyText, bodyHtml} = buildSupertakeEmail(data);
  assert.equal(view.rows.length, MAX_THESES_ROWS);
  assert.equal(view.moreRows, 12 - MAX_THESES_ROWS);
  assert.equal(view.changes.length, MAX_CHANGE_CARDS);
  assert.equal(view.moreChanges, 10 - MAX_CHANGE_CARDS);
  assert.ok(bodyText.includes('y 4 tesis más en el panorama completo'));
  assert.ok(bodyHtml.includes('y 7 cambios más →'));
  assert.ok(bodyText.includes('La tesis cerró'), 'no leader → no invented cause');
});

test('theses without a name are never rendered (and no ids on screen)', () => {
  const data = cloneFixture(FIXTURE_UP);
  data.theses[0].name = '';
  const {bodyText, view} = buildSupertakeEmail(data);
  assert.equal(view.thesesCount, 3);
  assert.ok(!bodyText.includes('Bancos argentinos'));
  assert.ok(!/bancos-argentinos/.test(bodyText));
});

test('automático actions for digest_only users are kept, in Spanish, without amounts', () => {
  const data = cloneFixture(FIXTURE_UP);
  data.autoActions = [{ticker: 'VIST', side: 'venta', thesisName: 'Energía local', reasonPlain: 'Superó el tope de peso'}];
  data.pausaActions = [{thesisName: 'Cripto de reserva', reasonPlain: 'Automático se pausó por precios demorados.'}];
  const {bodyText, bodyHtml} = buildSupertakeEmail(data);
  for (const body of [bodyText, htmlToText(bodyHtml)]) {
    assert.ok(body.includes('Venta simulada · VIST'));
    assert.ok(body.includes('Superó el tope de peso. No se envió ninguna orden a un broker.'));
    assert.ok(body.includes('Pausa · Cripto de reserva'));
  }
});
