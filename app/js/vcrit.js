// Velocidade crítica (Vcrit): a maior velocidade que o nadador sustenta sem "quebrar",
// estimada por dois tiros máximos de crawl, 400 m e 200 m (feitos em até 14 dias):
//   Vcrit = (400 − 200) / (t400 − t200)   em m/s
// O ritmo de Vcrit (tempo por distância) é o alvo das séries "ritmo de nado Vcrit".

import { h, fmtTempo, dec2, dataCurta, dataLonga, fmtDelta } from './util.js';
import { bloco } from './repeticoes.js';

const JANELA_DIAS = 14;
const dias = (a, b) => Math.abs(Date.parse(`${a}T12:00:00`) - Date.parse(`${b}T12:00:00`)) / 864e5;

function melhorPorData(lista) {
  const m = new Map();
  for (const r of lista) if (!m.has(r.data) || r.t < m.get(r.data).t) m.set(r.data, r);
  return [...m.values()];
}

// Todos os testes do nadador, do mais antigo ao mais novo:
// { data, t400, t200, data200, vcrit (m/s), valido, motivo }
export function testesVcrit(tempos) {
  const crawl = tempos.filter(r => r.estilo === 'crawl' && !r.apagado);
  const de400 = melhorPorData(crawl.filter(r => r.dist === 400));
  const de200 = melhorPorData(crawl.filter(r => r.dist === 200));
  const testes = [];
  for (const r4 of de400) {
    const par = de200.filter(r => dias(r.data, r4.data) <= JANELA_DIAS)
      .sort((a, b) => dias(a.data, r4.data) - dias(b.data, r4.data) || a.t - b.t)[0];
    if (!par) continue;
    const vcrit = 200 / (r4.t - par.t);
    // O 400 precisa ser mais lento que dois 200 (senão a conta não fecha) e não absurdamente.
    let motivo = null;
    if (r4.t <= 2 * par.t) motivo = 'o 400 m saiu mais rápido que dois 200 m';
    else if (r4.t > 2.8 * par.t) motivo = 'o 400 m saiu lento demais perto do 200 m';
    else if (vcrit < 0.4 || vcrit > 2.2) motivo = 'velocidade fora do possível';
    testes.push({ data: r4.data, t400: r4.t, t200: par.t, data200: par.data, vcrit, valido: !motivo, motivo });
  }
  return testes.sort((a, b) => a.data.localeCompare(b.data));
}

export function vcritAtual(tempos) {
  const v = testesVcrit(tempos).filter(t => t.valido);
  return v.length ? v[v.length - 1] : null;
}

// Tempo-alvo no ritmo de Vcrit para uma distância (segundos).
export const alvoVcrit = (teste, dist) => dist / teste.vcrit;
export const fmtVelocidade = v => `${dec2(v)} m/s`;

// Cartão da evolução (professor e aluno). null se o nadador nunca nadou 200 ou 400 m crawl.
export function cartaoVcrit(tempos) {
  const temTiro = tempos.some(r => r.estilo === 'crawl' && (r.dist === 200 || r.dist === 400) && !r.apagado);
  if (!temTiro) return null;
  const testes = testesVcrit(tempos);
  const validos = testes.filter(t => t.valido);
  const atual = validos[validos.length - 1];
  const ultimo = testes[testes.length - 1];
  const como = h('p', { class: 'dica', text: 'Calculada com os melhores 400 m e 200 m crawl feitos em até 14 dias: Vcrit = 200 ÷ (tempo do 400 − tempo do 200).' });

  if (!atual) {
    return h('div', { class: 'card vcrit' },
      h('h3', { text: 'Velocidade crítica (Vcrit)' }),
      h('p', { class: 'sub', style: 'margin-top:6px', text: ultimo
        ? `O último teste não fechou: ${ultimo.motivo}. Repita o 400 m e o 200 m crawl no máximo.`
        : 'Falta o par do teste: cronometre 400 m e 200 m crawl no máximo, com até 14 dias de diferença.' }),
      como);
  }

  const anterior = validos[validos.length - 2];
  const ritmo100 = alvoVcrit(atual, 100);
  return h('div', { class: 'card vcrit' },
    h('div', { class: 'card-head' },
      h('h3', { text: 'Velocidade crítica (Vcrit)' }),
      h('span', { class: 'etiqueta', text: `teste de ${dataCurta(atual.data)}` })),
    h('div', { class: 'blocos', style: 'margin-top:12px' },
      bloco('Ritmo Vcrit', `${fmtTempo(ritmo100)}/100 m`, fmtVelocidade(atual.vcrit),
        anterior && alvoVcrit(anterior, 100) > ritmo100 ? 'bom' : undefined),
      bloco('400 m crawl', fmtTempo(atual.t400), dataLonga(atual.data)),
      bloco('200 m crawl', fmtTempo(atual.t200), dataLonga(atual.data200)),
      anterior ? bloco('Desde o teste anterior', `${fmtDelta(ritmo100 - alvoVcrit(anterior, 100))}/100 m`, `em ${dataCurta(anterior.data)}: ${fmtTempo(alvoVcrit(anterior, 100))}/100 m`) : null),
    h('span', { class: 'lbl', style: 'display:block;margin-top:14px', text: 'Tempo-alvo no ritmo de Vcrit' }),
    h('div', { class: 'linha', style: 'margin-top:6px' },
      [25, 50, 100, 200, 400].map(d => h('span', { class: 'chip neutro' }, `${d} m `, h('b', { class: 'mono', text: fmtTempo(alvoVcrit(atual, d)) })))),
    como);
}
