// Evolução de um nadador entre treinos: resumo da distância principal e um gráfico por
// distância e estilo, com a lista de todos os tempos. Usado pelo professor (tela do
// nadador, com botão de apagar) e pelo aluno (só leitura).

import { h, fmtTempo, combo, dec1, dataCurta, dataLonga, porTreino, combos, doCombo, botaoConfirmar } from './util.js';
import { graficoEvolucao } from './grafico.js';
import { bloco } from './repeticoes.js';

const ORIGEM = { cronometro: 'cronômetro', manual: 'à mão', exemplo: 'exemplo', importado: 'importado' };

// aoApagar(tempo): se vier, a tabela ganha um botão "Apagar" em cada linha.
export function secaoEvolucao(tempos, nome, { aoApagar } = {}) {
  const cs = combos(tempos);
  if (!cs.length) return [];

  const [d0, e0] = cs[0];
  const pts0 = porTreino(doCombo(tempos, d0, e0));
  const prim = pts0[0], ult = pts0[pts0.length - 1];
  const top = pts0.reduce((a, b) => (b.t < a.t ? b : a));
  const dl = top.t - prim.t;
  const resumo = h('div', { class: 'blocos' },
    bloco(`Melhor · ${combo(d0, e0)}`, fmtTempo(top.t), dataLonga(top.data)),
    dl < 0
      ? bloco('Desde o primeiro treino', `↓ ${fmtTempo(-dl)} s`, `${dec1(-dl / prim.t * 100)}% mais rápido que em ${dataCurta(prim.data)}`, 'bom')
      : bloco('Desde o primeiro treino', '–', pts0.length > 1 ? 'ainda sem melhora registrada' : 'só um treino registrado'),
    bloco('Último treino', fmtTempo(ult.t), dataLonga(ult.data)),
    bloco('Treinos com tempo', String(pts0.length), `nos ${combo(d0, e0)}`));

  const grade = h('div', { class: 'graficos' });
  for (const [d, e] of cs) {
    const lista = doCombo(tempos, d, e);
    const pts = porTreino(lista);
    const melhor = Math.min(...lista.map(r => r.t));
    const host = h('div', { class: 'grafico' });
    const tab = h('div', { class: 'tabela', hidden: true });
    const botao = h('button', { class: 'link', type: 'button', 'aria-expanded': 'false' }, 'Ver todos os tempos');
    botao.addEventListener('click', () => {
      const abrir = tab.hidden;
      tab.hidden = !abrir;
      botao.setAttribute('aria-expanded', String(abrir));
      botao.textContent = abrir ? 'Esconder os tempos' : 'Ver todos os tempos';
      if (abrir && !tab.firstChild) tab.append(tabelaTempos(lista, melhor, aoApagar));
    });
    grade.append(h('div', { class: 'card' },
      h('h3', { text: combo(d, e) }),
      h('p', { class: 'sub', text: `${pts.length} ${pts.length === 1 ? 'treino' : 'treinos'} · melhor ${fmtTempo(melhor)} · primeiro ${fmtTempo(pts[0].t)}` }),
      host,
      h('p', { class: 'dica-eixo', text: 'Melhor tempo de cada treino. Linha descendo quer dizer nadando mais rápido.' }),
      botao, tab));
    graficoEvolucao(host, pts, `${nome}, ${combo(d, e)}`);
  }
  return [resumo, grade];
}

function tabelaTempos(lista, melhor, aoApagar) {
  const ord = lista.slice().sort((a, b) => (a.data === b.data ? (a.criadoEm < b.criadoEm ? 1 : -1) : a.data < b.data ? 1 : -1));
  return h('table', null,
    h('thead', null, h('tr', null, h('th', { text: 'Treino' }), h('th', { class: 'n', text: 'Tempo' }), h('th', { text: 'Como' }), aoApagar ? h('th', null) : null)),
    h('tbody', null, ord.map(r => h('tr', null,
      h('td', { text: `${dataLonga(r.data)}${r.rep > 1 ? ` · ${r.rep}ª` : ''}` }),
      h('td', { class: 'n' + (r.t === melhor ? ' bom' : ''), text: (r.t === melhor ? '★ ' : '') + fmtTempo(r.t) }),
      h('td', { class: 'mut', text: ORIGEM[r.origem] || r.origem || '' }),
      aoApagar ? h('td', { class: 'n' }, botaoConfirmar('Apagar', 'Confirmar', () => aoApagar(r), 'btn pequeno fantasma')) : null))));
}
