// Tela da turma: próximos treinos (agenda e planos), nadadores, cadastro e atalhos.

import { h, aviso, fmtTempo, melhorDe, doCombo, naoEncontrado, botaoConfirmar, dataLonga, hoje } from '../util.js';
import * as db from '../db.js';
import { formTurma } from './inicio.js';
import { abrirLancamento } from '../lancar.js';
import { proximasDatas, descricaoTurma, horaCurta } from '../agenda.js';
import { cartaoEsforco } from '../esforco.js';
import { painelDaTurma } from '../painel-turma.js';

export async function render(caixa, turmaId) {
  const t = await db.turma(turmaId);
  if (!t || t.apagado) { caixa.append(naoEncontrado('Turma')); return; }
  const [nads, arquivados, tempos, planos, pses, semanas] = await Promise.all([
    db.nadadoresDaTurma(turmaId),
    db.nadadoresDaTurma(turmaId, { incluirArquivados: true }).then(l => l.filter(n => n.arquivado)),
    db.temposDaTurma(turmaId),
    db.planosDaTurma(turmaId),
    db.psesDaTurma(turmaId),
    db.listarSemanas()
  ]);
  const recarregar = () => { caixa.textContent = ''; return render(caixa, turmaId); };

  /* cabeçalho */
  const edicao = h('div', { class: 'card', hidden: true }, h('h3', { text: 'Editar turma' }),
    formTurma(async novo => { await db.salvarTurma(novo); aviso('Turma salva.'); recarregar(); }, t),
    h('div', { class: 'acoes', style: 'margin-top:12px' },
      t.exemplo
        ? botaoConfirmar('Apagar turma de exemplo', 'Toque de novo para apagar', async () => { await db.apagarTurmaDeVez(t.id); aviso('Turma de exemplo apagada.'); location.hash = '#/'; })
        : botaoConfirmar('Arquivar turma', 'Toque de novo para arquivar', async () => { await db.salvarTurma({ ...t, arquivada: true }); aviso('Turma arquivada. Os tempos continuam guardados.'); location.hash = '#/'; })));

  caixa.append(
    h('div', null, h('a', { class: 'voltar', href: '#/' }, '← Turmas')),
    h('div', { class: 'cabeca' },
      h('div', null,
        h('h2', { text: t.nome }),
        h('p', { class: 'sub' }, descricaoTurma(t) || 'Sem dias de treino definidos', t.exemplo ? ' · ' : '', t.exemplo ? h('span', { class: 'etiqueta', text: 'exemplo' }) : null)),
      h('div', { class: 'acoes' },
        nads.length ? h('a', { class: 'btn primario', href: `#/treino/${t.id}` }, 'Começar treino') : null,
        nads.length ? h('button', { class: 'btn', type: 'button', onclick: () => abrirLancamento({ turmaId, nadadores: nads, aoSalvar: recarregar }) }, 'Lançar tempo à mão') : null,
        h('button', { class: 'btn fantasma', type: 'button', 'aria-expanded': 'false', onclick: e => { edicao.hidden = !edicao.hidden; e.currentTarget.setAttribute('aria-expanded', String(!edicao.hidden)); } }, 'Editar turma'))),
    edicao);

  /* painel da semana: MVP, pódio, números e evolução da turma */
  const painel = tempos.length || pses.length ? painelDaTurma({ turma: t, tempos, nadadores: [...nads, ...arquivados], pses, semanas }) : null;
  if (painel) caixa.append(painel.el);
  caixa.append(cartaoAgenda(t, planos, recarregar));

  /* nadadores */
  const lista = h('ul', { class: 'lista' });
  for (const n of nads) {
    const seus = tempos.filter(r => r.nadadorId === n.id);
    const m50 = melhorDe(doCombo(seus, 50, 'crawl'));
    lista.append(h('li', null, h('a', { class: 'item', href: `#/nadador/${n.id}` },
      h('b', { text: n.nome }),
      h('span', { class: 'lado', text: m50 == null ? '–' : fmtTempo(m50) }),
      h('span', { class: 'sub', text: `${seus.length} ${seus.length === 1 ? 'tempo registrado' : 'tempos registrados'}` }))));
  }
  caixa.append(h('div', { class: 'card' },
    h('div', { class: 'card-head' },
      h('h3', { text: `Nadadores (${nads.length})` }),
      nads.length ? h('span', { class: 'lbl', text: 'Melhor 50 m crawl' }) : null),
    nads.length ? lista : h('p', { class: 'sub', style: 'margin-top:8px', text: 'Nenhum nadador ainda. Cadastre abaixo.' })));

  /* esforço da turma: PSE média de cada treino × planejado */
  let esforco = null;
  if (pses.length) {
    esforco = cartaoEsforco({ pses, turmas: [t], semanas, fixo: t.id });
    caixa.append(esforco.el);
  }

  /* cadastro */
  const nome = h('input', { id: 'nad-nome', type: 'text', maxlength: 60, autocomplete: 'off', placeholder: 'Nome do nadador' });
  const umSo = h('form', { class: 'form' },
    h('label', { class: 'campo', for: 'nad-nome' }, h('span', { class: 'lbl', text: 'Nome' }), nome),
    h('div', { class: 'acoes' }, h('button', { class: 'btn primario', type: 'submit' }, 'Adicionar')));
  umSo.addEventListener('submit', async e => {
    e.preventDefault();
    const n = nome.value.trim();
    if (!n) { nome.focus(); return; }
    await db.salvarNadador({ turmaId, nome: n });
    aviso(`${n} adicionado.`);
    await recarregar();
    document.getElementById('nad-nome')?.focus();
  });

  const nomes = h('textarea', { id: 'nad-varios', placeholder: 'Um nome por linha' });
  const varios = h('form', { class: 'form' },
    h('label', { class: 'campo cheio', for: 'nad-varios' }, h('span', { class: 'lbl', text: 'Nomes' }), nomes, h('small', { text: 'Cole a lista da turma, um nome por linha.' })),
    h('div', { class: 'acoes' }, h('button', { class: 'btn', type: 'submit' }, 'Adicionar todos')));
  varios.addEventListener('submit', async e => {
    e.preventDefault();
    const lst = nomes.value.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
    if (!lst.length) { nomes.focus(); return; }
    await db.salvarNadadores(lst.map(n => ({ turmaId, nome: n.slice(0, 60) })));
    aviso(`${lst.length} ${lst.length === 1 ? 'nadador adicionado' : 'nadadores adicionados'}.`);
    recarregar();
  });

  caixa.append(h('div', { class: 'card' },
    h('h3', { text: 'Cadastrar nadador' }), umSo,
    h('details', { style: 'margin-top:16px' }, h('summary', { text: 'Adicionar vários de uma vez' }), h('div', { style: 'margin-top:12px' }, varios))));

  if (arquivados.length) {
    const l = h('ul', { class: 'lista' });
    for (const n of arquivados) {
      l.append(h('li', null, h('div', { class: 'item' },
        h('b', { text: n.nome }),
        h('span', { class: 'lado' }, h('button', { class: 'btn pequeno', type: 'button', onclick: async () => { await db.salvarNadador({ ...n, arquivado: false }); aviso(`${n.nome} voltou para a turma.`); recarregar(); } }, 'Reativar')),
        h('span', { class: 'sub', text: 'arquivado' }))));
    }
    caixa.append(h('details', { class: 'card' }, h('summary', { text: `Arquivados (${arquivados.length})` }), l));
  }
  return () => { if (esforco) esforco.limpar(); if (painel) painel.limpar(); };
}

// Próximas datas de treino (pela agenda da turma) e o treino planejado de cada uma.
function cartaoAgenda(t, planos, recarregar) {
  const porData = new Map(planos.map(p => [p.data, p]));
  const datas = proximasDatas(t.agenda, 14);
  const dHoje = hoje();

  function editor(data, atual, aoFechar) {
    const id = `plano-${data}`;
    const texto = h('textarea', { id, rows: 3, maxlength: 2000, placeholder: 'Ex.: aquecimento 200 m; 8×50 crawl saída 1:30; soltar 100 m' });
    texto.value = atual || '';
    const form = h('form', { class: 'editor-plano' },
      h('label', { class: 'sr', for: id, text: `Treino planejado para ${dataLonga(data)}` }), texto,
      h('div', { class: 'acoes' },
        h('button', { class: 'btn pequeno primario', type: 'submit' }, 'Salvar'),
        h('button', { class: 'btn pequeno fantasma', type: 'button', onclick: aoFechar }, 'Cancelar')));
    form.addEventListener('submit', async e => {
      e.preventDefault();
      await db.salvarPlano(t.id, data, texto.value);
      aviso(texto.value.trim() ? 'Treino planejado.' : 'Plano apagado.');
      recarregar();
    });
    setTimeout(() => texto.focus(), 0);
    return form;
  }

  const lista = h('ul', { class: 'lista agenda' });
  for (const { data, hora } of datas) {
    const p = porData.get(data);
    const corpo = h('div', { class: 'agenda-corpo' }, p
      ? h('p', { class: 'plano-texto', text: p.descricao })
      : h('p', { class: 'sub', text: 'Treino ainda não planejado.' }));
    const botao = h('button', { class: 'btn pequeno fantasma', type: 'button' }, p ? 'Editar' : 'Planejar');
    botao.addEventListener('click', () => {
      botao.hidden = true;
      corpo.replaceChildren(editor(data, p && p.descricao, () => recarregar()));
    });
    lista.append(h('li', { class: 'agenda-item' },
      h('div', { class: 'agenda-topo' },
        h('b', { text: `${dataLonga(data)}${hora ? ` · ${horaCurta(hora)}` : ''}` }),
        data === dHoje ? h('span', { class: 'etiqueta', text: 'hoje' }) : null,
        botao),
      corpo));
  }

  // Data fora da agenda (treino extra, avaliação etc.)
  const outra = h('input', { type: 'date', id: 'plano-outra-data', min: dHoje });
  const extra = h('div', { class: 'agenda-extra' },
    h('label', { class: 'campo', for: 'plano-outra-data' }, h('span', { class: 'lbl', text: 'Planejar outra data' }), outra));
  outra.addEventListener('change', () => {
    if (!outra.value) return;
    const data = outra.value;
    extra.querySelector('.editor-plano')?.remove();
    extra.append(editor(data, porData.get(data) && porData.get(data).descricao, () => recarregar()));
  });

  return h('div', { class: 'card' },
    h('h3', { text: 'Próximos treinos' }),
    datas.length
      ? lista
      : h('p', { class: 'sub', style: 'margin-top:6px', text: 'Defina os dias de treino em "Editar turma" para as próximas datas aparecerem aqui.' }),
    extra,
    h('p', { class: 'sub', style: 'margin-top:8px', text: 'Os alunos veem as datas e o treino planejado no celular deles.' }));
}
