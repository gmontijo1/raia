// Gráficos de evolução em SVG puro (sem biblioteca, funciona sem internet).
// Eixo Y em segundos, valores maiores em cima: linha descendo = nadando mais rápido.

import { h, s, fmtTempo, dataCurta, dataLonga, isoLocal, MESES, pad, hoje } from './util.js';

function passo(bruto) {
  const p = Math.pow(10, Math.floor(Math.log10(bruto)));
  const f = bruto / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
}
function rotuloY(v) {
  if (v >= 60) return `${Math.floor(v / 60)}:${pad(Math.round(v % 60))}`;
  return `${String(+v.toFixed(1)).replace('.', ',')} s`;
}

// pts: [{ data: 'AAAA-MM-DD', t: segundos }] em ordem de data (melhor tempo de cada treino).
export function graficoEvolucao(host, pts, titulo) {
  let largura = 0;
  const desenhar = () => {
    const w = Math.round(host.clientWidth);
    if (!w || w === largura) return;
    largura = w;
    desenhar_(host, pts, titulo, w);
  };
  if (window.ResizeObserver) {
    const ro = new ResizeObserver(() => {
      if (!host.isConnected && largura) { ro.disconnect(); return; }
      desenhar();
    });
    ro.observe(host);
  }
  requestAnimationFrame(desenhar);
}

function desenhar_(host, pts, titulo, larg) {
  host.textContent = '';
  const W = Math.max(260, larg), H = 230;
  const m = { l: 46, r: 14, t: 28, b: 28 };
  const iw = W - m.l - m.r, ih = H - m.t - m.b;
  const xs = pts.map(p => Date.parse(p.data + 'T12:00:00'));
  let x0 = Math.min(...xs), x1 = Math.max(...xs);
  if (x1 - x0 < 864e5 * 14) { const c = (x0 + x1) / 2; x0 = c - 864e5 * 7; x1 = c + 864e5 * 7; }
  const ts = pts.map(p => p.t);
  const lo = Math.min(...ts), hi = Math.max(...ts);
  const span = Math.max(hi - lo, 0.8);
  const st = passo(span / 4);
  const y0 = Math.max(0, Math.floor((lo - span * 0.22) / st) * st);
  const y1 = Math.ceil((hi + span * 0.12) / st) * st;
  const X = v => m.l + (v - x0) / (x1 - x0) * iw;
  const Y = v => m.t + (y1 - v) / (y1 - y0) * ih;
  const base = m.t + ih;
  const dHoje = hoje();
  const primeiro = pts[0], ultimo = pts[pts.length - 1];
  const svg = s('svg', {
    viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img',
    'aria-label': `${titulo}: ${pts.length} treinos, de ${fmtTempo(primeiro.t)} no primeiro para ${fmtTempo(ultimo.t)} no último`
  });
  const texto = (x, y, txt, ancora, estilo) => {
    const t = s('text', { x: x.toFixed(1), y: y.toFixed(1), 'text-anchor': ancora, style: estilo });
    t.textContent = txt;
    svg.append(t);
  };
  const eixo = 'fill:var(--muted);font-size:11px;font-family:var(--font-body)';

  const nT = Math.round((y1 - y0) / st);
  for (let i = 0; i <= nT; i++) {
    const v = y0 + i * st, y = Y(v);
    svg.append(s('line', { x1: m.l, x2: W - m.r, y1: y.toFixed(1), y2: y.toFixed(1), style: `stroke:var(${i === 0 ? '--axis' : '--line'});stroke-width:1` }));
    texto(m.l - 8, y + 4, rotuloY(v), 'end', eixo);
  }

  const meses = [];
  const d0 = new Date(x0);
  for (let mm = new Date(d0.getFullYear(), d0.getMonth() + 1, 1); mm.getTime() <= x1; mm = new Date(mm.getFullYear(), mm.getMonth() + 1, 1)) meses.push(mm);
  if (meses.length) {
    const pulo = iw / meses.length < 34 ? 2 : 1;
    meses.forEach((mm, i) => {
      const x = X(mm.getTime());
      svg.append(s('line', { x1: x.toFixed(1), x2: x.toFixed(1), y1: base, y2: base + 4, style: 'stroke:var(--axis);stroke-width:1' }));
      if (i % pulo === 0) texto(x, H - 6, MESES[mm.getMonth()], 'middle', eixo);
    });
  } else {
    texto(X(x0), H - 6, dataCurta(isoLocal(new Date(x0))), 'start', eixo);
    texto(X(x1), H - 6, dataCurta(isoLocal(new Date(x1))), 'end', eixo);
  }

  const px = xs.map(X), py = pts.map(p => Y(p.t));
  const caminho = px.map((x, i) => `${x.toFixed(1)},${py[i].toFixed(1)}`).join(' L');
  if (pts.length > 1) {
    svg.append(s('path', { d: `M${px[0].toFixed(1)},${base} L${caminho} L${px[px.length - 1].toFixed(1)},${base} Z`, style: 'fill:var(--series-soft);stroke:none' }));
    svg.append(s('path', { d: `M${caminho}`, style: 'fill:none;stroke:var(--series);stroke-width:2;stroke-linejoin:round;stroke-linecap:round' }));
  }
  if (pts.length <= 24) {
    pts.forEach((p, i) => svg.append(s('circle', { cx: px[i].toFixed(1), cy: py[i].toFixed(1), r: 4, style: 'fill:var(--series);stroke:var(--surface);stroke-width:2' })));
  }

  let ib = 0;
  pts.forEach((p, i) => { if (p.t < pts[ib].t) ib = i; });
  const il = pts.length - 1;
  const ancora = x => (x > W - m.r - 50 ? 'end' : x < m.l + 50 ? 'start' : 'middle');
  // contorno na cor do fundo: o rótulo continua legível quando cruza a linha
  const rotulo = (x, y, txt) => texto(x, y, txt, ancora(x), 'fill:var(--ink);font-size:12px;font-weight:600;font-family:var(--font-mono);paint-order:stroke;stroke:var(--surface);stroke-width:4px;stroke-linejoin:round');
  svg.append(s('circle', { cx: px[ib].toFixed(1), cy: py[ib].toFixed(1), r: 5.5, style: 'fill:var(--good);stroke:var(--surface);stroke-width:2' }));
  if (ib === il) {
    rotulo(px[il], py[il] - 12, `★ melhor ${fmtTempo(ultimo.t)}${ultimo.data === dHoje ? ' (hoje)' : ''}`);
  } else {
    const yb = py[ib] + 20 <= base - 2 ? py[ib] + 20 : py[ib] - 12;
    rotulo(px[ib], yb, `★ melhor ${fmtTempo(pts[ib].t)}`);
    svg.append(s('circle', { cx: px[il].toFixed(1), cy: py[il].toFixed(1), r: 4.5, style: 'fill:var(--series);stroke:var(--surface);stroke-width:2' }));
    rotulo(px[il], Math.max(14, py[il] - 12), `${fmtTempo(ultimo.t)}${ultimo.data === dHoje ? ' hoje' : ''}`);
  }

  const cruz = s('line', { y1: m.t, y2: base, style: 'stroke:var(--axis);stroke-width:1', visibility: 'hidden' });
  const ponto = s('circle', { r: 5, style: 'fill:var(--series);stroke:var(--surface);stroke-width:2', visibility: 'hidden' });
  const alvo = s('rect', { x: m.l, y: 0, width: iw, height: H, style: 'fill:transparent' });
  svg.append(cruz, ponto, alvo);
  const balao = h('div', { class: 'balao', hidden: true });
  host.append(svg, balao);

  let atual = il;
  function mostrar(i) {
    atual = i;
    const esc = svg.getBoundingClientRect().width / W || 1;
    cruz.setAttribute('x1', px[i]); cruz.setAttribute('x2', px[i]); cruz.setAttribute('visibility', 'visible');
    ponto.setAttribute('cx', px[i]); ponto.setAttribute('cy', py[i]); ponto.setAttribute('visibility', 'visible');
    balao.textContent = '';
    balao.append(h('b', { text: fmtTempo(pts[i].t) }),
      h('span', { text: `${dataLonga(pts[i].data)}${pts[i].data === dHoje ? ' · hoje' : ''}${i === ib ? ' · melhor' : ''}` }));
    balao.hidden = false;
    const bw = balao.offsetWidth, cw = host.clientWidth;
    let esq = px[i] * esc + 12;
    if (esq + bw > cw) esq = px[i] * esc - bw - 12;
    balao.style.left = Math.max(0, esq) + 'px';
    balao.style.top = (m.t * esc) + 'px';
  }
  function esconder() {
    cruz.setAttribute('visibility', 'hidden');
    ponto.setAttribute('visibility', 'hidden');
    balao.hidden = true;
  }
  function maisPerto(clientX) {
    const r = svg.getBoundingClientRect();
    const x = (clientX - r.left) * (W / r.width);
    let b = 0, bd = Infinity;
    px.forEach((v, i) => { const d = Math.abs(v - x); if (d < bd) { bd = d; b = i; } });
    return b;
  }
  alvo.addEventListener('pointermove', e => mostrar(maisPerto(e.clientX)));
  alvo.addEventListener('pointerdown', e => mostrar(maisPerto(e.clientX)));
  svg.addEventListener('pointerleave', esconder);
  host.tabIndex = 0;
  host.onfocus = () => mostrar(atual);
  host.onblur = esconder;
  host.onkeydown = e => {
    if (e.key === 'ArrowLeft') { mostrar(Math.max(0, atual - 1)); e.preventDefault(); }
    else if (e.key === 'ArrowRight') { mostrar(Math.min(il, atual + 1)); e.preventDefault(); }
    else if (e.key === 'Escape') esconder();
  };
}

// Mini gráfico dos últimos treinos, usado no cartão de cada nadador no cronômetro.
export function minigrafico(pts) {
  if (pts.length < 2) return null;
  const W = 64, H = 22, p = 3;
  const ts = pts.map(q => q.t);
  const lo = Math.min(...ts), hi = Math.max(...ts), sp = (hi - lo) || 1;
  const X = i => p + i * (W - 2 * p) / (pts.length - 1);
  const Y = v => p + (hi - v) / sp * (H - 2 * p);
  const svg = s('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, class: 'mini', 'aria-hidden': 'true' });
  svg.append(s('polyline', {
    points: pts.map((q, i) => `${X(i).toFixed(1)},${Y(q.t).toFixed(1)}`).join(' '),
    style: 'fill:none;stroke:var(--series);stroke-width:1.5;stroke-linejoin:round;stroke-linecap:round'
  }));
  const l = pts.length - 1;
  svg.append(s('circle', { cx: X(l).toFixed(1), cy: Y(pts[l].t).toFixed(1), r: 2.5, style: 'fill:var(--series)' }));
  return svg;
}
