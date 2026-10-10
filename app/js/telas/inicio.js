// Tela inicial: lista de turmas e criação de turma nova.

import { h, aviso, dec1 } from '../util.js';
import * as db from '../db.js';
import { criarTurmaExemplo } from '../exemplo.js';
import { DIAS_CURTOS, normalizar, textoAgenda, descricaoTurma } from '../agenda.js';
import { nuvemLigada } from '../nuvem.js';
import { NOME_PROJETO } from '../marca.js';
import { mvpDaSemana } from '../painel-turma.js';

export async function render(caixa) {
  const turmas = await db.listarTurmas();
  const temExemplo = turmas.some(t => t.exemplo);

  caixa.append(h('div', { class: 'cabeca' },
    h('div', null, h('span', { class: 'lbl', text: NOME_PROJETO }), h('h2', { text: 'Turmas' }), h('p', { class: 'sub', text: 'Escolha a turma para começar o treino ou ver a evolução.' }))));

  const form = formTurma(async t => {
    const nova = await db.salvarTurma(t);
    aviso(`Turma "${nova.nome}" criada.`);
    location.hash = `#/turma/${nova.id}`;
  });

  const cartaoNova = h('div', { class: 'card' }, h('h3', { text: 'Nova turma' }), form);

  if (!turmas.length) {
    cartaoNova.hidden = true;
    caixa.append(h('div', { class: 'card vazio' },
      h('h3', { text: 'Nenhuma turma ainda' }),
      h('p', { text: 'Crie a primeira turma e cadastre os nadadores. Se quiser só conhecer o app, carregue uma turma de exemplo com nomes e tempos inventados.' }),
      h('div', { class: 'acoes' },
        h('button', { class: 'btn primario', type: 'button', onclick: () => { cartaoNova.hidden = false; form.querySelector('input').focus(); } }, 'Criar turma'),
        botaoExemplo())), cartaoNova);
    return;
  }

  const grade = h('div', { class: 'turmas' });
  const [contas, tempos] = await Promise.all([
    Promise.all(turmas.map(t => db.nadadoresDaTurma(t.id))),
    Promise.all(turmas.map(t => db.temposDaTurma(t.id)))
  ]);
  turmas.forEach((t, i) => {
    const mvp = mvpDaSemana(tempos[i], contas[i]);
    grade.append(h('a', { class: 'card turma-card', href: `#/turma/${t.id}` },
      h('span', { class: 'nome', text: t.nome }),
      descricaoTurma(t) ? h('span', { class: 'sub', text: descricaoTurma(t) }) : null,
      mvp ? h('span', { class: 'turma-mvp' }, h('span', { class: 'mvp-mini', text: 'MVP' }),
        h('span', { text: `${mvp.nadador.nome} · ${dec1(mvp.melhor.pct)}% mais rápido` })) : null,
      h('span', { class: 'linha' },
        h('span', { class: 'mut', text: `${contas[i].length} ${contas[i].length === 1 ? 'nadador' : 'nadadores'}` }),
        t.exemplo ? h('span', { class: 'etiqueta', text: nuvemLigada() ? 'exemplo · só neste aparelho' : 'exemplo' }) : null)));
  });
  caixa.append(grade, cartaoNova);
  if (!temExemplo) caixa.append(h('p', { class: 'sub' }, 'Quer testar sem dados reais? ', botaoExemplo('link')));
}

function botaoExemplo(estilo = 'btn') {
  return h('button', {
    class: estilo, type: 'button',
    onclick: async e => {
      e.currentTarget.disabled = true;
      const t = await criarTurmaExemplo();
      aviso('Turma de exemplo carregada.');
      location.hash = `#/turma/${t.id}`;
    }
  }, 'Carregar turma de exemplo');
}

// Nome, dias da semana e horário. A agenda vira as "datas de treino" que o aluno vê.
export function formTurma(aoSalvar, atual) {
  const nome = h('input', { id: 'turma-nome', type: 'text', required: true, maxlength: 60, autocomplete: 'off', placeholder: 'Ex.: Recreativo manhã' });
  const agenda = normalizar(atual && atual.agenda);
  const hora = h('input', { id: 'turma-hora', type: 'time', step: 300 });
  hora.value = (agenda[0] && agenda[0].hora) || '';
  const dias = DIAS_CURTOS.map((rot, d) => {
    const cb = h('input', { type: 'checkbox', id: `turma-dia-${d}`, value: d });
    cb.checked = agenda.some(a => a.dia === d);
    return { cb, el: h('label', { for: `turma-dia-${d}` }, cb, rot) };
  });
  if (atual) nome.value = atual.nome || '';
  const form = h('form', { class: 'form' },
    h('label', { class: 'campo', for: 'turma-nome' }, h('span', { class: 'lbl', text: 'Nome da turma' }), nome),
    h('div', { class: 'campo cheio' },
      h('span', { class: 'lbl', text: 'Dias de treino' }),
      h('div', { class: 'presenca dias' }, dias.map(x => x.el))),
    h('label', { class: 'campo', for: 'turma-hora' }, h('span', { class: 'lbl', text: 'Horário' }), hora),
    h('div', { class: 'acoes' }, h('button', { class: 'btn primario', type: 'submit' }, atual ? 'Salvar' : 'Criar turma')));
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const n = nome.value.trim();
    if (!n) { nome.focus(); return; }
    const nova = dias.filter(x => x.cb.checked).map(x => ({ dia: +x.cb.value, hora: hora.value || '' }));
    await aoSalvar({ ...(atual || {}), nome: n, agenda: nova, horario: textoAgenda(nova) || (nova.length ? '' : (atual && atual.horario) || '') });
  });
  return form;
}
