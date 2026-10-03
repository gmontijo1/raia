// Gráficos em SVG puro (sem biblioteca, funciona sem internet).
// Eixo Y em segundos, valores maiores em cima: linha descendo = nadando mais rápido.

import { h, s, fmtTempo, dataCurta, dataLonga, isoLocal, MESES, pad, hoje } from './util.js';

const ALTURA = 230;
const MARGEM = { l: 46, r: 14, t: 28, b: 28 };
const ESTILO_EIXO = 'fill:var(--muted);font-size:11px;font-family:var(--font-body)';
// contorno na cor do fundo: o rótulo continua legível quando cruza a linha
const ESTILO_ROTULO = 'fill:var(--ink);font-size:12px;font-weight:600;font-family:var(--font-mono);paint-order:stroke;stroke:var(--surface);stroke-width:4px;stroke-linejoin:round';

function passo(bruto) {
  const p = Math.pow(10, Math.floor(Math.log10(bruto)));
  const f = bruto / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
}
function rotuloY(v) {
  if (v >= 60) return `${Math.floor(v / 60)}:${pad(Math.round(v % 60))}`;
  return `${String(+v.toFixed(1)).replace('.', ',')} s`;
}

// Redesenha quando o espaço muda de largura (girar o celular, abrir painel, etc.).
function aoMudarLargura(host, desenhar) {
  let largura = 0;
  const talvez = () => {
    const w = Math.round(host.clientWidth);
    if (!w || w === largura) return;
    largura = w;
    desenhar(w);
  };
  if (window.ResizeObserver) {
    const ro = new ResizeObserver(() => {
      if (!host.isConnected && largura) { ro.disconnect(); return; }
      talvez();
    });
    ro.observe(host);
  }
  requestAnimationFrame(talvez);
}

// Escala vertical a partir dos tempos (e de uma referência opcional).
function escalaY(valores, folgaBaixo, folgaCima) {
  const lo = Math.min(...valores), hi = Math.max(...valores);
  const span = Math.max(hi - lo, 0.8);
  const st = passo(span / 4);
  const y0 = Math.max(0, Math.floor((lo - span * folgaBaixo) / st) * st);
  const y1 = Math.ceil((hi + span * folgaCima) / st) * st;
  return { y0, y1, st, Y: v => MARGEM.t + (y1 - v) / (y1 - y0) * (ALTURA - MARGEM.t - MARGEM.b) };
}

function base(W, rotulo) {
  const svg = s('svg', { viewBox: `0 0 ${W} ${ALTURA}`, width: W, height: ALTURA, role: 'img', 'aria-label': rotulo });
  const texto = (x, y, txt, ancora, estilo) => {
    const t = s('text', { x: x.toFixed(1), y: y.toFixed(1), 'text-anchor': ancora, style: estilo });
    t.textContent = txt;
    svg.append(t);
  };
  return { svg, texto };
}

function grade(svg, texto, W, { y0, y1, st, Y }) {
  const n = Math.round((y1 - y0) / st);
  for (let i = 0; i <= n; i++) {
    const v = y0 + i * st, y = Y(v);
    svg.append(s('line', { x1: MARGEM.l, x2: W - MARGEM.r, y1: y.toFixed(1), y2: y.toFixed(1), style: `stroke:var(${i === 0 ? '--axis' : '--line'});stroke-width:1` }));
    texto(MARGEM.l - 8, y + 4, rotuloY(v), 'end', ESTILO_EIXO);
  }
}

// Linha, área, pontos e os dois rótulos que importam: o melhor e o último.
function serie(svg, texto, W, px, py, ts, { pontos, rotuloMelhor, rotuloUltimo }) {
  const fundo = ALTURA - MARGEM.b;
  const caminho = px.map((x, i) => `${x.toFixed(1)},${py[i].toFixed(1)}`).join(' L');
  if (px.length > 1) {
    svg.append(s('path', { d: `M${px[0].toFixed(1)},${fundo} L${caminho} L${px[px.length - 1].toFixed(1)},${fundo} Z`, style: 'fill:var(--series-soft);stroke:none' }));
    svg.append(s('path', { d: `M${caminho}`, style: 'fill:none;stroke:var(--series);stroke-width:2;stroke-linejoin:round;stroke-linecap:round' }));
  }
  if (pontos) px.forEach((x, i) => svg.append(s('circle', { cx: x.toFixed(1), cy: py[i].toFixed(1), r: 4, style: 'fill:var(--series);stroke:var(--surface);stroke-width:2' })));

  let ib = 0;
  ts.forEach((t, i) => { if (t < ts[ib]) ib = i; });
  const il = ts.length - 1;
  const ancora = x => (x > W - MARGEM.r - 50 ? 'end' : x < MARGEM.l + 50 ? 'start' : 'middle');
  svg.append(s('circle', { cx: px[ib].toFixed(1), cy: py[ib].toFixed(1), r: 5.5, style: 'fill:var(--good);stroke:var(--surface);stroke-width:2' }));
  if (ib === il) {
    texto(px[il], py[il] - 12, rotuloMelhor(il, true), ancora(px[il]), ESTILO_ROTULO);
  } else {
    const yb = py[ib] + 20 <= fundo - 2 ? py[ib] + 20 : py[ib] - 12;
    texto(px[ib], yb, rotuloMelhor(ib, false), ancora(px[ib]), ESTILO_ROTULO);
    svg.append(s('circle', { cx: px[il].toFixed(1), cy: py[il].toFixed(1), r: 4.5, style: 'fill:var(--series);stroke:var(--surface);stroke-width:2' }));
    texto(px[il], Math.max(14, py[il] - 12), rotuloUltimo(il), ancora(px[il]), ESTILO_ROTULO);
  }
  return ib;
}

// Cruz que acompanha o dedo/mouse, balão com o valor e navegação pelas setas do teclado.
function interacao(host, svg, W, px, py, conteudo) {
  const fundo = ALTURA - MARGEM.b;
  const cruz = s('line', { y1: MARGEM.t, y2: fundo, style: 'stroke:var(--axis);stroke-width:1', visibility: 'hidden' });
  const ponto = s('circle', { r: 5, style: 'fill:var(--series);stroke:var(--surface);stroke-width:2', visibility: 'hidden' });
  const alvo = s('rect', { x: MARGEM.l, y: 0, width: W - MARGEM.l - MARGEM.r, height: ALTURA, style: 'fill:transparent' });
  svg.append(cruz, ponto, alvo);
  const balao = h('div', { class: 'balao', hidden: true });
  host.append(svg, balao);

  const ultimo = px.length - 1;
  let atual = ultimo;
  function mostrar(i) {
    atual = i;
    const esc = svg.getBoundingClientRect().width / W || 1;
    cruz.setAttribute('x1', px[i]); cruz.setAttribute('x2', px[i]); cruz.setAttribute('visibility', 'visible');
    ponto.setAttribute('cx', px[i]); ponto.setAttribute('cy', py[i]); ponto.setAttribute('visibility', 'visible');
    balao.textContent = '';
    const [forte, fraco] = conteudo(i);
    balao.append(h('b', { text: forte }), h('span', { text: fraco }));
    balao.hidden = false;
    const bw = balao.offsetWidth, cw = host.clientWidth;
    let esq = px[i] * esc + 12;
    if (esq + bw > cw) esq = px[i] * esc - bw - 12;
    balao.style.left = Math.max(0, esq) + 'px';
    balao.style.top = (MARGEM.t * esc) + 'px';
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
    else if (e.key === 'ArrowRight') { mostrar(Math.min(ultimo, atual + 1)); e.preventDefault(); }
    else if (e.key === 'Escape') esconder();
  };
}

/* ---------- evolução entre treinos (eixo X = data) ---------- */

// pts: [{ data: 'AAAA-MM-DD', t: segundos }] em ordem de data (melhor tempo de cada treino).
export function graficoEvolucao(host, pts, titulo) {
  aoMudarLargura(host, larg => {
    host.textContent = '';
    const W = Math.max(260, larg);
    const iw = W - MARGEM.l - MARGEM.r;
    const fundo = ALTURA - MARGEM.b;
    const dHoje = hoje();
    const xs = pts.map(p => Date.parse(p.data + 'T12:00:00'));
    let x0 = Math.min(...xs), x1 = Math.max(...xs);
    if (x1 - x0 < 864e5 * 14) { const c = (x0 + x1) / 2; x0 = c - 864e5 * 7; x1 = c + 864e5 * 7; }
    const X = v => MARGEM.l + (v - x0) / (x1 - x0) * iw;
    const esc = escalaY(pts.map(p => p.t), 0.22, 0.12);
    const ult = pts[pts.length - 1];
    const { svg, texto } = base(W, `${titulo}: ${pts.length} treinos, de ${fmtTempo(pts[0].t)} no primeiro para ${fmtTempo(ult.t)} no último`);
    grade(svg, texto, W, esc);

    const meses = [];
    const d0 = new Date(x0);
    for (let mm = new Date(d0.getFullYear(), d0.getMonth() + 1, 1); mm.getTime() <= x1; mm = new Date(mm.getFullYear(), mm.getMonth() + 1, 1)) meses.push(mm);
    if (meses.length) {
      const pulo = iw / meses.length < 34 ? 2 : 1;
      meses.forEach((mm, i) => {
        const x = X(mm.getTime());
        svg.append(s('line', { x1: x.toFixed(1), x2: x.toFixed(1), y1: fundo, y2: fundo + 4, style: 'stroke:var(--axis);stroke-width:1' }));
        if (i % pulo === 0) texto(x, ALTURA - 6, MESES[mm.getMonth()], 'middle', ESTILO_EIXO);
      });
    } else {
      texto(X(x0), ALTURA - 6, dataCurta(isoLocal(new Date(x0))), 'start', ESTILO_EIXO);
      texto(X(x1), ALTURA - 6, dataCurta(isoLocal(new Date(x1))), 'end', ESTILO_EIXO);
    }

    const px = xs.map(X), py = pts.map(p => esc.Y(p.t));
    const ib = serie(svg, texto, W, px, py, pts.map(p => p.t), {
      pontos: pts.length <= 24,
      rotuloMelhor: (i, eUltimo) => `★ melhor ${fmtTempo(pts[i].t)}${eUltimo && pts[i].data === dHoje ? ' (hoje)' : ''}`,
      rotuloUltimo: i => `${fmtTempo(pts[i].t)}${pts[i].data === dHoje ? ' hoje' : ''}`
    });
    interacao(host, svg, W, px, py, i => [fmtTempo(pts[i].t),
      `${dataLonga(pts[i].data)}${pts[i].data === dHoje ? ' · hoje' : ''}${i === ib ? ' · melhor' : ''}`]);
  });
}

/* ---------- repetições de um mesmo treino (eixo X = repetição) ---------- */

// reps: [{ t: segundos, hora: 'HH:MM' }] na ordem em que foram nadadas.
// referencia: melhor tempo pessoal antes de hoje (linha verde), ou null.
export function graficoRepeticoes(host, reps, { referencia = null, titulo = '' } = {}) {
  aoMudarLargura(host, larg => {
    host.textContent = '';
    const W = Math.max(260, larg);
    const iw = W - MARGEM.l - MARGEM.r;
    const N = reps.length;
    const X = i => MARGEM.l + (i + 0.5) / N * iw;
    const ts = reps.map(r => r.t);
    const esc = escalaY(referencia != null ? ts.concat(referencia) : ts, 0.25, 0.15);
    const { svg, texto } = base(W, `${titulo}: ${N} ${N === 1 ? 'repetição' : 'repetições'}, de ${fmtTempo(ts[0])} na primeira para ${fmtTempo(ts[N - 1])} na última`);
    grade(svg, texto, W, esc);

    if (referencia != null) {
      const yr = esc.Y(referencia);
      svg.append(s('line', { x1: MARGEM.l, x2: W - MARGEM.r, y1: yr.toFixed(1), y2: yr.toFixed(1), style: 'stroke:var(--good);stroke-width:1.5' }));
      texto(MARGEM.l + 4, yr - 6, `melhor pessoal ${fmtTempo(referencia)}`, 'start', 'fill:var(--ink-2);font-size:11px;font-family:var(--font-body);paint-order:stroke;stroke:var(--surface);stroke-width:4px');
    }

    const pulo = Math.ceil(N / Math.max(1, Math.floor(iw / 30)));
    reps.forEach((r, i) => { if (i % pulo === 0 || i === N - 1) texto(X(i), ALTURA - 6, `${i + 1}ª`, 'middle', ESTILO_EIXO); });

    const px = reps.map((r, i) => X(i)), py = ts.map(esc.Y);
    const ib = serie(svg, texto, W, px, py, ts, {
      pontos: true,
      rotuloMelhor: i => `★ ${fmtTempo(ts[i])}`,
      rotuloUltimo: i => fmtTempo(ts[i])
    });
    interacao(host, svg, W, px, py, i => [fmtTempo(ts[i]), `${i + 1}ª repetição · ${reps[i].hora}${i === ib ? ' · melhor de hoje' : ''}`]);
  });
}

/* ---------- mini gráfico do cartão ---------- */
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
