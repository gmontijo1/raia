// Repetições de um mesmo treino: resumo, gráfico repetição por repetição e tabela.
// Usado no painel do nadador durante o treino e na tela de treino do aluno.

import { h, fmtTempo, fmtDelta, combo, hora } from './util.js';
import { graficoRepeticoes } from './grafico.js';

export function bloco(rotulo, valor, detalhe, classe) {
  return h('div', { class: 'bloco' },
    h('span', { class: 'lbl', text: rotulo }),
    h('span', { class: 'v' + (classe ? ' ' + classe : ''), text: valor }),
    h('span', { class: 'd', text: detalhe }));
}

// reps: tempos do dia nessa distância e estilo, na ordem em que foram nadados.
// recorde: melhor tempo pessoal antes desse dia (ou null).
export function conteudoRepeticoes({ reps, recorde, nome, dist, estilo, quando = 'hoje' }) {
  const ts = reps.map(r => r.t);
  const N = ts.length;
  const media = ts.reduce((a, b) => a + b, 0) / N;
  let ib = 0;
  ts.forEach((t, i) => { if (t < ts[ib]) ib = i; });
  const melhor = ts[ib], pior = Math.max(...ts);
  const novoRecorde = recorde != null && melhor < recorde;
  const variacao = ts[N - 1] - ts[0];

  const resumo = h('div', { class: 'blocos' },
    bloco('Repetições', String(N), combo(dist, estilo)),
    bloco('Média', fmtTempo(media), N > 1 ? `de ${fmtTempo(melhor)} a ${fmtTempo(pior)}` : 'só uma repetição'),
    bloco(`Melhor ${quando === 'hoje' ? 'de hoje' : 'do dia'}`, fmtTempo(melhor),
      novoRecorde ? `★ novo melhor pessoal (${fmtDelta(melhor - recorde)})`
        : recorde != null ? `na ${ib + 1}ª · ${fmtDelta(melhor - recorde)} do melhor pessoal` : `na ${ib + 1}ª repetição`,
      novoRecorde ? 'bom' : null),
    N > 1 ? bloco('Da 1ª para a última', `${fmtDelta(variacao)} s`,
      variacao > 0.005 ? 'mais lento no fim' : variacao < -0.005 ? 'mais rápido no fim' : 'mesmo tempo') : null);

  // A linha do melhor pessoal só entra no gráfico se estiver perto dos tempos do dia;
  // longe demais, ela esmagaria a diferença entre as repetições (o que importa ver aqui).
  const ref = recorde != null && Math.abs(recorde - media) <= media * 0.15 ? recorde : null;
  const host = h('div', { class: 'grafico' });
  const grafico = h('div', { class: 'card' },
    h('h3', { text: `Repetição por repetição · ${combo(dist, estilo)}` }),
    host,
    h('p', { class: 'dica-eixo', text: ref != null
      ? 'Cada ponto é uma repetição, na ordem em que foi nadada. A linha verde é o melhor tempo pessoal de antes.'
      : 'Cada ponto é uma repetição, na ordem em que foi nadada.' }));
  graficoRepeticoes(host, reps.map(r => ({ t: r.t, hora: hora(r.criadoEm) })), { referencia: ref, titulo: `${nome}, ${combo(dist, estilo)}` });

  const tabela = h('div', { class: 'card' },
    h('h3', { text: 'Todas as repetições' }),
    h('div', { class: 'tabela' }, h('table', null,
      h('thead', null, h('tr', null,
        h('th', { text: 'Rep.' }), h('th', { class: 'n', text: 'Tempo' }), h('th', { class: 'n', text: 'vs anterior' }), h('th', { class: 'n', text: 'Hora' }))),
      h('tbody', null, reps.map((r, i) => h('tr', null,
        h('td', { text: `${i + 1}ª` }),
        h('td', { class: 'n' + (i === ib ? ' bom' : ''), text: (i === ib ? '★ ' : '') + fmtTempo(r.t) }),
        h('td', { class: 'n mut', text: i ? fmtDelta(r.t - reps[i - 1].t) : '–' }),
        h('td', { class: 'n mut', text: hora(r.criadoEm) })))))));

  return [resumo, grafico, tabela];
}
