// Tela inicial: lista de turmas e criação de turma nova.

import { h, aviso } from '../util.js';
import * as db from '../db.js';
import { criarTurmaExemplo } from '../exemplo.js';

export async function render(caixa) {
  const turmas = await db.listarTurmas();
  const temExemplo = turmas.some(t => t.exemplo);

  caixa.append(h('div', { class: 'cabeca' },
    h('div', null, h('h2', { text: 'Turmas' }), h('p', { class: 'sub', text: 'Escolha a turma para começar o treino ou ver a evolução.' }))));

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
  const contas = await Promise.all(turmas.map(t => db.nadadoresDaTurma(t.id)));
  turmas.forEach((t, i) => {
    grade.append(h('a', { class: 'card turma-card', href: `#/turma/${t.id}` },
      h('span', { class: 'nome', text: t.nome }),
      t.horario ? h('span', { class: 'sub', text: t.horario }) : null,
      h('span', { class: 'linha' },
        h('span', { class: 'mut', text: `${contas[i].length} ${contas[i].length === 1 ? 'nadador' : 'nadadores'}` }),
        t.exemplo ? h('span', { class: 'etiqueta', text: 'exemplo' }) : null)));
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

export function formTurma(aoSalvar, atual) {
  const nome = h('input', { id: 'turma-nome', type: 'text', required: true, maxlength: 60, autocomplete: 'off', placeholder: 'Ex.: Recreativo manhã' });
  const horario = h('input', { id: 'turma-horario', type: 'text', maxlength: 60, autocomplete: 'off', placeholder: 'Ex.: terças e quintas, 7h' });
  if (atual) { nome.value = atual.nome || ''; horario.value = atual.horario || ''; }
  const form = h('form', { class: 'form' },
    h('label', { class: 'campo', for: 'turma-nome' }, h('span', { class: 'lbl', text: 'Nome da turma' }), nome),
    h('label', { class: 'campo', for: 'turma-horario' }, h('span', { class: 'lbl', text: 'Dias e horário (opcional)' }), horario),
    h('div', { class: 'acoes' }, h('button', { class: 'btn primario', type: 'submit' }, atual ? 'Salvar' : 'Criar turma')));
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const n = nome.value.trim();
    if (!n) { nome.focus(); return; }
    await aoSalvar({ ...(atual || {}), nome: n, horario: horario.value.trim() });
  });
  return form;
}
