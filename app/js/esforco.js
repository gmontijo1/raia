// Acompanhamento do esforço: a PSE média de cada treino (calculada das respostas salvas, então
// sempre atualizada) comparada com o esforço planejado.
// Planejado de um treino: a faixa de PSE escrita no treino do dia ("PSE-6-8", "PSE 6-7") ou,
// se não houver, a intensidade da semana × 10 (85% → 8,5).

import { h, s, dataCurta, dataLonga, dec1, isoLocal } from './util.js';
import { semanaDe, treinoDaTurma, pct } from './semana.js';
import { mediaPse, fmtPse, corPse } from './pse.js';

const RX_PSE = /PSE\s*[-:]?\s*(\d{1,2})(?:\s*[-–a]\s*(\d{1,2}))?/i;
const dentro = v => v >= 0 && v <= 10;

// { min, max, alvo, fonte: 'treino' | 'semana', semana } ou null
export function planejadoDoTreino(semanas, turma, data) {
  const semana = semanaDe(semanas, data);
  if (!semana) return null;
  const treino = turma ? treinoDaTurma(semana, turma, data) : null;
  const m = treino && `${treino.principal || ''} ${treino.principalObs || ''}`.match(RX_PSE);
  if (m) {
    let a = Number(m[1]), b = m[2] != null ? Number(m[2]) : a;
    if (dentro(a) && dentro(b)) {
      if (b < a) [a, b] = [b, a];
      return { min: a, max: b, alvo: (a + b) / 2, fonte: 'treino', semana };
    }
  }
  if (semana.intensidade != null) {
    const v = Math.round(semana.intensidade * 100) / 10;
    return { min: v, max: v, alvo: v, fonte: 'semana', semana };
  }
  return null;
}

// Uma linha por treino (data, e turma quando filtrado): média, respostas, menor e maior, planejado.
export function sessoes(pses, turmas, semanas, { turmaId = null } = {}) {
  const porId = new Map(turmas.map(t => [t.id, t]));
  const grupos = new Map();
  for (const p of pses) {
    if (p.apagado || (turmaId && p.turmaId !== turmaId) || !porId.has(p.turmaId)) continue;
    if (!turmaId && porId.get(p.turmaId).exemplo) continue;   // "Todas" não mistura a turma de exemplo
    const chave = p.data;
    if (!grupos.has(chave)) grupos.set(chave, []);
    grupos.get(chave).push(p);
  }
  return [...grupos.entries()].map(([data, lista]) => {
    const ts = [...new Set(lista.map(p => p.turmaId))];
    const valores = lista.map(p => p.valor);
    return {
      data, turmas: ts.map(id => porId.get(id).nome),
      media: mediaPse(lista), n: lista.length, min: Math.min(...valores), max: Math.max(...valores),
      planejado: planejadoDoTreino(semanas, porId.get(ts[0]), data)
    };
  }).sort((a, b) => a.data.localeCompare(b.data));
}

/* ---------- o cartão: resumo, filtro, gráfico e tabela ---------- */
// fixo: id da turma (tela da turma) — sem filtro. Devolve { el, limpar }.
export function cartaoEsforco({ pses, turmas, semanas, fixo = null }) {
  const turmasComPse = turmas.filter(t => pses.some(p => p.turmaId === t.id && !p.apagado));
  // Sem PSE nas turmas reais (aparelho só com a turma de exemplo), já abre na de exemplo.
  const temReal = turmasComPse.some(t => !t.exemplo);
  let filtro = fixo || (temReal ? null : turmasComPse.find(t => t.exemplo)?.id || null);
  const corpo = h('div');
  const el = h('section', { class: 'card esforco' },
    h('div', { class: 'card-head' }, h('h3', { text: 'Esforço: planejado × PSE' }), h('a', { class: 'link', href: '#/pse' }, 'Escala de PSE')),
    !fixo && turmasComPse.length > 1 ? filtroTurmas() : null,
    corpo);
  let ro = null, quadro = 0;

  function filtroTurmas() {
    const g = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'Turma', style: 'margin-top:10px' });
    const todasTxt = turmasComPse.some(t => t.exemplo) ? 'Todas (sem o exemplo)' : 'Todas';
    for (const [v, txt] of [[null, todasTxt], ...turmasComPse.map(t => [t.id, t.nome])]) {
      const id = `esf-${v || 'todas'}`;
      const inp = h('input', { type: 'radio', name: 'esf-turma', id, value: v || '' });
      if (v === filtro) inp.checked = true;
      inp.addEventListener('change', () => { filtro = v; pintar(); });
      g.append(inp, h('label', { for: id, text: txt }));
    }
    return g;
  }

  function pintar() {
    const lista = sessoes(pses, turmas, semanas, { turmaId: filtro });
    corpo.textContent = '';
    if (!lista.length) {
      corpo.append(h('p', { class: 'sub', style: 'margin-top:10px', text: 'Ainda não há PSE marcada. A média de cada treino aparece aqui conforme os alunos respondem.' }));
      return;
    }
    // resumo das últimas 4 semanas (só treinos que têm planejado)
    const d = new Date(); d.setDate(d.getDate() - 28);
    const recentes = lista.filter(x => x.data > isoLocal(d));
    const comPlano = recentes.filter(x => x.planejado);
    const mReal = mediaPse(recentes.map(x => ({ valor: x.media })));
    const mPlano = comPlano.length ? comPlano.reduce((a, x) => a + x.planejado.alvo, 0) / comPlano.length : null;
    const mRealComPlano = comPlano.length ? comPlano.reduce((a, x) => a + x.media, 0) / comPlano.length : null;
    const dif = mPlano != null ? mRealComPlano - mPlano : null;
    const respostas = recentes.reduce((a, x) => a + x.n, 0);
    corpo.append(h('div', { class: 'blocos', style: 'margin-top:12px' },
      bloco('PSE média · 4 semanas', fmtPse(mReal), `${recentes.length} ${recentes.length === 1 ? 'treino' : 'treinos'} · ${respostas} ${respostas === 1 ? 'resposta' : 'respostas'}`),
      bloco('Planejado · 4 semanas', mPlano != null ? fmtPse(mPlano) : '–', mPlano != null ? 'média dos treinos com plano' : 'sem planejamento'),
      bloco('Diferença', dif != null ? `${comSinal(dif)}` : '–',
        dif == null ? 'sem planejamento' : Math.abs(dif) < 0.5 ? 'dentro do planejado' : dif < 0 ? 'mais leve que o planejado' : 'mais pesado que o planejado')));

    const host = h('div', { class: 'grafico grafico-esforco' });
    const balao = h('div', { class: 'balao', hidden: true });
    const nota = h('p', { class: 'dica-eixo', hidden: true });
    host.append(balao);
    corpo.append(
      h('div', { class: 'legenda' },
        h('span', { class: 'leg-item' }, h('span', { class: 'leg-faixa' }), 'planejado'),
        h('span', { class: 'leg-item' }, h('span', { class: 'leg-ponto-pse' }), 'PSE média do treino'),
        h('span', { class: 'leg-item' }, h('span', { class: 'leg-bigode' }), 'da menor à maior resposta')),
      host,
      nota,
      h('p', { class: 'dica-eixo', text: 'PSE de 0 a 10. A bolinha tem a média da PSE do treino, na cor da escala. Abaixo da faixa: os alunos sentiram o treino mais leve que o planejado; acima: mais pesado. O planejado vem da PSE escrita no treino do dia ou, sem ela, da intensidade da semana × 10.' }),
      tabela(lista));
    // cabem só os últimos treinos (cada bolinha precisa de espaço para o número); o resto fica na tabela
    const desenhar = () => {
      const mostrados = desenharEsforco(host, balao, lista);
      nota.hidden = mostrados >= lista.length;
      nota.textContent = `Mostrando os últimos ${mostrados} de ${lista.length} treinos. Todos estão na tabela abaixo.`;
    };
    desenhar();
    if (ro) ro.disconnect();
    if ('ResizeObserver' in window) {
      let largura = host.clientWidth;
      ro = new ResizeObserver(() => {
        cancelAnimationFrame(quadro);
        quadro = requestAnimationFrame(() => { if (Math.abs(host.clientWidth - largura) > 4) { largura = host.clientWidth; desenhar(); } });
      });
      ro.observe(host);
    }
  }

  pintar();
  return { el, limpar: () => { if (ro) ro.disconnect(); cancelAnimationFrame(quadro); } };
}

const bloco = (rotulo, valor, detalhe) => h('div', { class: 'bloco' }, h('span', { class: 'lbl', text: rotulo }), h('span', { class: 'v', text: valor }), h('span', { class: 'd', text: detalhe }));
// "+1,5", "−0,4", "0,0" (arredonda antes de pôr o sinal: −0,04 vira 0,0)
export const comSinal = v => { const r = Math.round(v * 10) / 10; return `${r > 0 ? '+' : r < 0 ? '−' : ''}${dec1(Math.abs(r))}`; };
const textoPlano = p => (!p ? 'sem planejamento' : p.min === p.max ? `${fmtPse(p.alvo)}${p.fonte === 'semana' ? ` (intensidade ${pct(p.semana.intensidade)})` : ''}` : `${p.min} a ${p.max}`);

function tabela(lista) {
  return h('details', { style: 'margin-top:10px' }, h('summary', { text: 'Ver os números de cada treino' }),
    h('div', { class: 'tabela' }, h('table', null,
      h('thead', null, h('tr', null, ['Treino', 'Turma', 'PSE média', 'Respostas', 'Planejado', 'Diferença'].map((c, i) => h('th', { class: i >= 2 && i !== 4 ? 'n' : null, text: c })))),
      h('tbody', null, lista.slice().reverse().map(x => h('tr', null,
        h('td', { text: dataLonga(x.data) }),
        h('td', { text: x.turmas.join(', ') }),
        h('td', { class: 'n', text: fmtPse(x.media) }),
        h('td', { class: 'n', text: String(x.n) }),
        h('td', { text: textoPlano(x.planejado) }),
        h('td', { class: 'n', text: x.planejado ? `${comSinal(x.media - x.planejado.alvo)}` : '–' })))))));
}

/* ---------- o gráfico ---------- */
// Devolve quantos treinos (os mais recentes) couberam no gráfico.
function desenharEsforco(host, balao, todos) {
  host.querySelector('svg')?.remove();
  balao.hidden = true;   // redesenhou (ex.: girou a tela): o balão antigo ficaria fora do lugar
  const W = Math.max(280, host.clientWidth || 340), H = 220;
  const m = { l: 28, r: 8, t: 18, b: 30 };
  const pw = W - m.l - m.r, ph = H - m.t - m.b;
  const lista = todos.slice(-Math.max(4, Math.floor(pw / 30)));
  const n = lista.length, banda = pw / Math.max(n, 1);
  const raio = Math.min(13, Math.max(7, banda * 0.42));
  const y = v => m.t + ph - (v / 10) * ph;
  const xc = i => m.l + banda * (i + 0.5);
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', 'aria-label': `PSE média de ${n} treinos comparada com o planejado. Os números estão na tabela abaixo do gráfico.` });
  for (const v of [0, 2, 4, 6, 8, 10]) {
    svg.append(s('line', { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v), class: v ? 'g-grade' : 'g-base' }));
    const t = s('text', { x: m.l - 6, y: y(v) + 4, class: 'g-rotulo', 'text-anchor': 'end' });
    t.textContent = String(v);
    svg.append(t);
  }
  const larg = Math.max(6, Math.min(30, banda * 0.72));
  // planejado: faixa (ou traço) cinza em cada treino
  lista.forEach((x, i) => {
    const p = x.planejado;
    if (!p) return;
    const topo = y(p.max), base = y(p.min);
    svg.append(s('rect', { x: xc(i) - larg / 2, y: topo - (p.min === p.max ? 2 : 0), width: larg, height: Math.max(4, base - topo), rx: 3, class: 'g-plano' }));
  });
  // linha da PSE média, bigodes (menor → maior) e pontos
  if (n > 1) svg.append(s('polyline', { points: lista.map((x, i) => `${xc(i)},${y(x.media)}`).join(' '), class: 'g-pse-linha' }));
  lista.forEach((x, i) => {
    if (x.max > x.min) svg.append(s('line', { x1: xc(i), x2: xc(i), y1: y(x.max), y2: y(x.min), class: 'g-bigode' }));
  });
  // bolinha na cor da escala de PSE, com a média escrita dentro
  lista.forEach((x, i) => {
    const { cor, tinta } = corPse(x.media);
    svg.append(s('circle', { cx: xc(i), cy: y(x.media), r: raio, class: 'g-pse-ponto', style: `fill:${cor}` }));
    if (raio >= 10) {
      const t = s('text', { x: xc(i), y: y(x.media), class: 'g-pse-num', 'text-anchor': 'middle', 'dominant-baseline': 'central', style: `fill:${tinta}` });
      t.textContent = fmtPse(x.media);
      svg.append(t);
    }
  });
  // datas embaixo (algumas, sem encavalar)
  const passo = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(pw / 46))));
  lista.forEach((x, i) => {
    if (i % passo && i !== n - 1) return;
    const t = s('text', { x: xc(i), y: H - 8, class: 'g-rotulo', 'text-anchor': 'middle' });
    t.textContent = dataCurta(x.data).replace(' ', '/');
    svg.append(t);
  });
  // áreas de toque com o balão
  lista.forEach((x, i) => {
    const alvo = s('rect', { x: m.l + banda * i, y: m.t, width: banda, height: ph, class: 'g-alvo', tabindex: '0', 'aria-label': `${dataLonga(x.data)}: PSE média ${fmtPse(x.media)}, planejado ${textoPlano(x.planejado)}` });
    const mostrar = () => {
      balao.textContent = '';
      balao.append(h('b', { text: dataLonga(x.data) }),
        h('span', { text: x.turmas.join(', ') }),
        h('span', { text: `PSE média ${fmtPse(x.media)} · ${x.n} ${x.n === 1 ? 'resposta' : 'respostas'}` }),
        x.max > x.min ? h('span', { text: `de ${x.min} a ${x.max}` }) : null,
        h('span', { text: `Planejado: ${textoPlano(x.planejado)}` }));
      balao.hidden = false;
      const bw = balao.offsetWidth;
      balao.style.left = `${Math.min(Math.max(0, xc(i) - bw / 2), W - bw)}px`;
      balao.style.top = `${Math.max(0, y(Math.max(x.max, x.planejado ? x.planejado.max : 0)) - balao.offsetHeight - 10)}px`;
    };
    const esconder = () => { balao.hidden = true; };
    alvo.addEventListener('pointerenter', mostrar);
    alvo.addEventListener('pointerleave', esconder);
    alvo.addEventListener('focus', mostrar);
    alvo.addEventListener('blur', esconder);
    alvo.addEventListener('click', mostrar);
    svg.append(alvo);
  });
  host.prepend(svg);
  return n;
}

/* ---------- planilha das médias (separador ";", vírgula decimal) ---------- */
export function planilhaMedias(pses, turmas, semanas) {
  const linhas = [['data', 'turma', 'pse_media', 'respostas', 'menor', 'maior', 'planejado_min', 'planejado_max', 'origem_do_planejado'].join(';')];
  const num = v => (v == null ? '' : String(Math.round(v * 10) / 10).replace('.', ','));
  for (const t of turmas.filter(x => !x.exemplo)) {
    for (const x of sessoes(pses, turmas, semanas, { turmaId: t.id })) {
      linhas.push([x.data, t.nome, num(x.media), x.n, x.min, x.max, num(x.planejado?.min), num(x.planejado?.max),
        x.planejado ? (x.planejado.fonte === 'treino' ? 'PSE escrita no treino' : 'intensidade da semana') : ''].join(';'));
    }
  }
  return '﻿' + linhas.join('\r\n');
}
