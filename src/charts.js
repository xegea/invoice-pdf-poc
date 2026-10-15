// Bar chart "Consumos anteriores en kWh" as inline SVG.
export function consumptionChart(hist, { width = 300, height = 120 } = {}) {
  const left = 30, bottom = 38, top = 6, right = 4;
  const plotW = width - left - right;
  const plotH = height - top - bottom;
  const values = hist.map((h) => Number(h.ep1) || 0);
  const maxV = Math.max(...values, 1);
  const step = 1500;
  const axisMax = Math.max(maxV, step);
  const ticks = [];
  for (let v = 0; v <= axisMax; v += step) ticks.push(v);
  const y = (v) => top + plotH - (v / axisMax) * plotH;
  const slot = plotW / hist.length;
  const barW = slot * 0.62;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="100%" class="chart">`;
  for (const v of ticks) {
    svg += `<line x1="${left}" x2="${width - right}" y1="${y(v)}" y2="${y(v)}" stroke="#d9d9d9" stroke-width="0.5"/>`;
    svg += `<text x="${left - 3}" y="${y(v) + 2.5}" font-size="7" text-anchor="end" fill="#333">${v}</text>`;
  }
  hist.forEach((h, i) => {
    const x = left + i * slot + (slot - barW) / 2;
    const v = values[i];
    svg += `<rect x="${x.toFixed(2)}" y="${y(v).toFixed(2)}" width="${barW.toFixed(2)}" height="${(top + plotH - y(v)).toFixed(2)}" fill="#c8c8c8"/>`;
    const cx = left + i * slot + slot / 2;
    const cy = top + plotH + 5;
    svg += `<text transform="translate(${cx.toFixed(2)},${cy}) rotate(-45)" font-size="6" text-anchor="end" fill="#333">${h.label}</text>`;
  });
  return svg + '</svg>';
}

const ORIGIN_COLORS = {
  Renovable: '#17b04a',
  'Cogen. de Alta Eficiencia': '#e9e9e9',
  'CC Gas Natural': '#f79646',
  'Carbón': '#4a4a4a',
  'Fuel/Gas': '#8a8a8a',
  Nuclear: '#95b3d7',
  'Otras no renovables': '#d9514e',
};
const pct = (s) => parseFloat(String(s).replace(',', '.')) || 0;

// Donut of the supplier's energy mix. Starts at 100° (clockwise from 12 o'clock)
// so the slices land where the reference invoice has them.
export function donutChart(rows) {
  const W = 420, H = 200, cx = 210, cy = 100, R = 60, r = 27;
  const total = rows.reduce((s, o) => s + pct(o.VALOR1), 0) || 1;
  const pt = (rad, a) => [cx + rad * Math.sin(a), cy - rad * Math.cos(a)];
  let a0 = (100 * Math.PI) / 180;
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" class="donut">`;
  let labels = '';
  const placed = [];
  for (const o of rows) {
    const frac = pct(o.VALOR1) / total;
    if (frac <= 0) continue;
    const a1 = a0 + frac * 2 * Math.PI;
    const [x0, y0] = pt(R, a0), [x1, y1] = pt(R, a1);
    const [x2, y2] = pt(r, a1), [x3, y3] = pt(r, a0);
    const large = frac > 0.5 ? 1 : 0;
    const fill = ORIGIN_COLORS[o.CONCEPTO] || '#bbb';
    svg += `<path d="M${x0.toFixed(1)},${y0.toFixed(1)} A${R},${R} 0 ${large} 1 ${x1.toFixed(1)},${y1.toFixed(1)} L${x2.toFixed(1)},${y2.toFixed(1)} A${r},${r} 0 ${large} 0 ${x3.toFixed(1)},${y3.toFixed(1)} Z" fill="${fill}" stroke="${o.CONCEPTO.startsWith('Cogen') ? '#999' : '#fff'}" stroke-width="0.6"/>`;
    const mid = (a0 + a1) / 2;
    let [lx, ly] = pt(R + 7, mid);
    const right = Math.sin(mid) >= 0;
    // nudge a label away from a neighbour on the same side that would overlap
    for (const q of placed) if (q.right === right && Math.abs(q.y - ly) < 9) ly = q.y + (ly >= q.y ? 9 : -9);
    placed.push({ right, y: ly });
    labels += `<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" font-size="8.5" text-anchor="${right ? 'start' : 'end'}" fill="#111">${o.CONCEPTO};${o.VALOR1}</text>`;
    a0 = a1;
  }
  return svg + labels + '</svg>';
}

// A–G energy label with a marker box on the highlighted letter.
const SCALE = [
  ['A', '#0b7a5b'], ['B', '#69a75a'], ['C', '#a4bd5b'], ['D', '#f3df4c'],
  ['E', '#ecc953'], ['F', '#d9a255'], ['G', '#b5322a'],
];
export function energyScale(highlight) {
  const rowH = 25, x0 = 6, top = 6;
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 ${top + SCALE.length * rowH}" width="100%" class="scale">`;
  SCALE.forEach(([letter, color], i) => {
    const y = top + i * rowH;
    const w = 28 + i * 21;
    svg += `<polygon points="${x0},${y} ${x0 + w},${y} ${x0 + w + 8},${y + 9} ${x0 + w},${y + 18} ${x0},${y + 18}" fill="${color}"/>`;
    svg += `<text x="${x0 + 6}" y="${y + 13}" font-size="11" font-weight="700" fill="#fff">${letter}</text>`;
    if (letter === highlight) {
      const mx = x0 + w + 14;
      svg += `<polygon points="${mx - 6},${y + 9} ${mx},${y} ${mx + 22},${y} ${mx + 22},${y + 18} ${mx},${y + 18}" fill="#fff" stroke="#111" stroke-width="0.8"/>`;
      svg += `<text x="${mx + 11}" y="${y + 13}" font-size="11" font-weight="700" fill="#111" text-anchor="middle">${letter}</text>`;
    }
  });
  return svg + '</svg>';
}
