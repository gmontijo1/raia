// Tela do nadador: evolução por distância e estilo, histórico de tempos e cadastro.

import { h, aviso, fmtTempo, combo, dec1, dataCurta, dataLonga, mesAno, porTreino, combos, doCombo, naoEncontrado, botaoConfirmar } from '../util.js';
import * as db from '../db.js';
import { graficoEvolucao } from '../grafico.js';
import { abrirLancamento } from '../lancar.js';
import { seletorRaia } from './turma.js';

function bloco(rotulo, valor, detalhe, classe) {
  return h('div', { class: 'bloco' },
    h('span', { class: 'lbl', text: rotulo }),
    h('span', { class: 'v' + (classe ? ' ' + classe : ''), text: valor }),
    h('span', { class: 'd', text: detalhe }));
}

export async function render(caixa, nadadorId) {
  const n = await db.nadador(nadadorId);
  if (!n || n.apagado) { caixa.append(naoEncontrado('Nadador')); return; }
  const [t, tempos, colegas] = await Promise.all([db.turma(n.turmaId), db.temposDoNadador(nadadorId), db.nadadoresDaTurma(n.turmaId)]);
  const recarregar = () => { caixa.textContent = ''; return render(caixa, nadadorId); };
  const lancar = () => abrirLancamento({ turmaId: n.turmaId, nadadores: colegas.length ? colegas : [n], nadadorId, aoSalvar: recarregar });

  caixa.append(
    h('div', null, h('a', { class: 'voltar', href: `#/turma/${n.turmaId}` }, `← ${t ? t.nome : 'Turma'}`)),
    h('div', { class: 'cabeca' },
      h('div', null,
        h('h2', { text: n.nome }),
        h('p', { class: 'sub', text: [n.raia ? `Raia ${n.raia}` : 'Sem raia', `cadastro em ${mesAno(n.criadoEm.slice(0, 10))}`, n.arquivado ? 'arquivado' : null].filter(Boolean).join(' · ') })),
      h('div', { class: 'acoes' }, n.arquivado ? null : h('button', { class: 'btn', type: 'button', onclick: lancar }, 'Lançar tempo à mão'))));

  const cs = combos(tempos);
  if (!cs.length) {
    caixa.append(h('div', { class: 'card vazio' },
      h('h3', { text: 'Nenhum tempo ainda' }),
      h('p', { text: 'Os tempos aparecem aqui assim que forem marcados no treino ou lançados à mão.' }),
      h('a', { class: 'btn primario', href: `#/treino/${n.turmaId}` }, 'Ir para o treino')));
  } else {
    /* resumo da distância principal */
    const [d0, e0] = cs[0];
    const pts0 = porTreino(doCombo(tempos, d0, e0));
    const prim = pts0[0], ult = pts0[pts0.length - 1];
    const top = pts0.reduce((a, b) => (b.t < a.t ? b : a));
    const dl = top.t - prim.t;
    caixa.append(h('div', { class: 'blocos' },
      bloco(`Melhor · ${combo(d0, e0)}`, fmtTempo(top.t), dataLonga(top.data)),
      dl < 0
        ? bloco('Desde o primeiro treino', `↓ ${fmtTempo(-dl)} s`, `${dec1(-dl / prim.t * 100)}% mais rápido que em ${dataCurta(prim.data)}`, 'bom')
        : bloco('Desde o primeiro treino', '–', pts0.length > 1 ? 'ainda sem melhora registrada' : 'só um treino registrado'),
      bloco('Último treino', fmtTempo(ult.t), dataLonga(ult.data)),
      bloco('Treinos com tempo', String(pts0.length), `nos ${combo(d0, e0)}`)));

    /* um gráfico por distância e estilo */
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
        if (abrir && !tab.firstChild) tab.append(tabelaTempos(lista, melhor, recarregar));
      });
      grade.append(h('div', { class: 'card' },
        h('h3', { text: combo(d, e) }),
        h('p', { class: 'sub', text: `${pts.length} ${pts.length === 1 ? 'treino' : 'treinos'} · melhor ${fmtTempo(melhor)} · primeiro ${fmtTempo(pts[0].t)}` }),
        host,
        h('p', { class: 'dica-eixo', text: 'Melhor tempo de cada treino. Linha descendo quer dizer nadando mais rápido.' }),
        botao, tab));
      graficoEvolucao(host, pts, `${n.nome}, ${combo(d, e)}`);
    }
    caixa.append(grade);
  }

  /* cadastro */
  const nome = h('input', { id: 'ed-nome', type: 'text', maxlength: 60, autocomplete: 'off' });
  nome.value = n.nome;
  const raia = seletorRaia('ed-raia', n.raia);
  const form = h('form', { class: 'form' },
    h('label', { class: 'campo', for: 'ed-nome' }, h('span', { class: 'lbl', text: 'Nome' }), nome),
    h('label', { class: 'campo', for: 'ed-raia' }, h('span', { class: 'lbl', text: 'Raia de costume' }), raia),
    h('div', { class: 'acoes' }, h('button', { class: 'btn primario', type: 'submit' }, 'Salvar')));
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const nv = nome.value.trim();
    if (!nv) { nome.focus(); return; }
    await db.salvarNadador({ ...n, nome: nv, raia: raia.value ? +raia.value : null });
    aviso('Cadastro salvo.');
    recarregar();
  });
  const arquivar = n.arquivado
    ? h('button', { class: 'btn pequeno', type: 'button', onclick: async () => { await db.salvarNadador({ ...n, arquivado: false }); aviso(`${n.nome} voltou para a turma.`); recarregar(); } }, 'Reativar')
    : botaoConfirmar('Arquivar nadador', 'Toque de novo para arquivar', async () => {
      await db.salvarNadador({ ...n, arquivado: true });
      aviso(`${n.nome} arquivado. Os tempos continuam guardados.`);
      location.hash = `#/turma/${n.turmaId}`;
    });
  caixa.append(h('details', { class: 'card' }, h('summary', { text: 'Editar cadastro' }),
    h('div', { style: 'margin-top:12px' }, form),
    h('div', { class: 'acoes', style: 'margin-top:16px' }, arquivar,
      h('span', { class: 'sub', text: 'Arquivar tira o nadador das raias, mas guarda o histórico.' }))));
}

function tabelaTempos(lista, melhor, recarregar) {
  const ord = lista.slice().sort((a, b) => (a.data === b.data ? (a.criadoEm < b.criadoEm ? 1 : -1) : a.data < b.data ? 1 : -1));
  const origem = { cronometro: 'cronômetro', manual: 'à mão', exemplo: 'exemplo', importado: 'importado' };
  return h('table', null,
    h('thead', null, h('tr', null, h('th', { text: 'Treino' }), h('th', { class: 'n', text: 'Tempo' }), h('th', { text: 'Como' }), h('th', null))),
    h('tbody', null, ord.map(r => h('tr', null,
      h('td', { text: `${dataLonga(r.data)}${r.rep > 1 ? ` · ${r.rep}ª` : ''}` }),
      h('td', { class: 'n' + (r.t === melhor ? ' bom' : ''), text: (r.t === melhor ? '★ ' : '') + fmtTempo(r.t) }),
      h('td', { class: 'mut', text: origem[r.origem] || r.origem || '' }),
      h('td', { class: 'n' }, botaoConfirmar('Apagar', 'Confirmar', async () => {
        await db.apagarTempo(r.id);
        aviso(`Tempo ${fmtTempo(r.t)} apagado.`);
        recarregar();
      }, 'btn pequeno fantasma'))))));
}
