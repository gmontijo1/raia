// Tela da turma: nadadores, cadastro, e atalhos para o treino.

import { h, aviso, fmtTempo, melhorDe, doCombo, naoEncontrado, botaoConfirmar } from '../util.js';
import * as db from '../db.js';
import { formTurma } from './inicio.js';
import { abrirLancamento } from '../lancar.js';

export const RAIAS = [1, 2, 3, 4, 5, 6, 7, 8];

export function seletorRaia(id, valor) {
  const sel = h('select', { id },
    h('option', { value: '', text: 'Sem raia' }),
    RAIAS.map(r => h('option', { value: r, text: `Raia ${r}` })));
  sel.value = valor ? String(valor) : '';
  return sel;
}

export async function render(caixa, turmaId) {
  const t = await db.turma(turmaId);
  if (!t || t.apagado) { caixa.append(naoEncontrado('Turma')); return; }
  const [nads, arquivados, tempos] = await Promise.all([
    db.nadadoresDaTurma(turmaId),
    db.nadadoresDaTurma(turmaId, { incluirArquivados: true }).then(l => l.filter(n => n.arquivado)),
    db.temposDaTurma(turmaId)
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
        h('p', { class: 'sub' }, t.horario || 'Sem horário definido', t.exemplo ? ' · ' : '', t.exemplo ? h('span', { class: 'etiqueta', text: 'exemplo' }) : null)),
      h('div', { class: 'acoes' },
        nads.length ? h('a', { class: 'btn primario', href: `#/treino/${t.id}` }, 'Começar treino') : null,
        nads.length ? h('button', { class: 'btn', type: 'button', onclick: () => abrirLancamento({ turmaId, nadadores: nads, aoSalvar: recarregar }) }, 'Lançar tempo à mão') : null,
        h('button', { class: 'btn fantasma', type: 'button', 'aria-expanded': 'false', onclick: e => { edicao.hidden = !edicao.hidden; e.currentTarget.setAttribute('aria-expanded', String(!edicao.hidden)); } }, 'Editar turma'))),
    edicao);

  /* nadadores */
  const lista = h('ul', { class: 'lista' });
  for (const n of nads) {
    const seus = tempos.filter(r => r.nadadorId === n.id);
    const m50 = melhorDe(doCombo(seus, 50, 'crawl'));
    lista.append(h('li', null, h('a', { class: 'item', href: `#/nadador/${n.id}` },
      h('b', { text: n.nome }),
      h('span', { class: 'lado', text: m50 == null ? '–' : fmtTempo(m50) }),
      h('span', { class: 'sub', text: `${n.raia ? `Raia ${n.raia}` : 'Sem raia'} · ${seus.length} ${seus.length === 1 ? 'tempo' : 'tempos'}` }))));
  }
  caixa.append(h('div', { class: 'card' },
    h('div', { class: 'card-head' },
      h('h3', { text: `Nadadores (${nads.length})` }),
      nads.length ? h('span', { class: 'lbl', text: 'Melhor 50 m crawl' }) : null),
    nads.length ? lista : h('p', { class: 'sub', style: 'margin-top:8px', text: 'Nenhum nadador ainda. Cadastre abaixo.' })));

  /* cadastro */
  const nome = h('input', { id: 'nad-nome', type: 'text', maxlength: 60, autocomplete: 'off', placeholder: 'Nome do nadador' });
  const raia = seletorRaia('nad-raia', null);
  const umSo = h('form', { class: 'form' },
    h('label', { class: 'campo', for: 'nad-nome' }, h('span', { class: 'lbl', text: 'Nome' }), nome),
    h('label', { class: 'campo', for: 'nad-raia' }, h('span', { class: 'lbl', text: 'Raia de costume' }), raia),
    h('div', { class: 'acoes' }, h('button', { class: 'btn primario', type: 'submit' }, 'Adicionar')));
  umSo.addEventListener('submit', async e => {
    e.preventDefault();
    const n = nome.value.trim();
    if (!n) { nome.focus(); return; }
    await db.salvarNadador({ turmaId, nome: n, raia: raia.value ? +raia.value : null });
    aviso(`${n} adicionado.`);
    await recarregar();
    document.getElementById('nad-nome')?.focus();
  });

  const nomes = h('textarea', { id: 'nad-varios', placeholder: 'Um nome por linha' });
  const raiaV = seletorRaia('nad-varios-raia', null);
  const varios = h('form', { class: 'form' },
    h('label', { class: 'campo cheio', for: 'nad-varios' }, h('span', { class: 'lbl', text: 'Nomes' }), nomes, h('small', { text: 'Cole a lista da turma, um nome por linha.' })),
    h('label', { class: 'campo', for: 'nad-varios-raia' }, h('span', { class: 'lbl', text: 'Raia para todos' }), raiaV),
    h('div', { class: 'acoes' }, h('button', { class: 'btn', type: 'submit' }, 'Adicionar todos')));
  varios.addEventListener('submit', async e => {
    e.preventDefault();
    const lst = nomes.value.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
    if (!lst.length) { nomes.focus(); return; }
    await db.salvarNadadores(lst.map(n => ({ turmaId, nome: n.slice(0, 60), raia: raiaV.value ? +raiaV.value : null })));
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
}
