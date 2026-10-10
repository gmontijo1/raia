// Tela do nadador (professor): evolução, histórico de tempos, cadastro e código de acesso.

import { h, aviso, fmtTempo, mesAno, naoEncontrado, botaoConfirmar, dataCurta, dataLonga, isoLocal } from '../util.js';
import * as db from '../db.js';
import { abrirLancamento } from '../lancar.js';
import { secaoEvolucao } from '../evolucao.js';
import { nuvemLigada, criarConvite, convitesPendentes, cancelarConvite, formatarCodigo, explicar } from '../nuvem.js';
import { sincronizar } from '../sincronia.js';
import { caixaCodigo } from '../convite.js';
import { cartaoPse, perguntarPse } from '../pse.js';

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
        h('p', { class: 'sub', text: [t ? t.nome : null, `cadastro em ${mesAno(n.criadoEm.slice(0, 10))}`, n.arquivado ? 'arquivado' : null].filter(Boolean).join(' · ') })),
      h('div', { class: 'acoes' }, n.arquivado ? null : h('button', { class: 'btn', type: 'button', onclick: lancar }, 'Lançar tempo à mão'))));

  const evolucao = secaoEvolucao(tempos, n.nome, {
    aoApagar: async r => {
      await db.apagarTempo(r.id);
      aviso(`Tempo ${fmtTempo(r.t)} apagado.`);
      recarregar();
    }
  });
  if (evolucao.length) caixa.append(...evolucao);
  else {
    caixa.append(h('div', { class: 'card vazio' },
      h('h3', { text: 'Nenhum tempo ainda' }),
      h('p', { text: 'Os tempos aparecem aqui assim que forem marcados no treino ou lançados à mão.' }),
      h('a', { class: 'btn primario', href: `#/treino/${n.turmaId}` }, 'Ir para o treino')));
  }

  // PSE dos treinos (tocar num registro corrige ou apaga)
  const pse = cartaoPse(await db.psesDoNadador(nadadorId), {
    aoEditar: async p => {
      const resp = await perguntarPse({ titulo: `PSE de ${n.nome} · ${dataLonga(p.data)}`, valor: p.valor, duracao: p.duracao, botao: 'Salvar PSE', apagar: true });
      if (!resp) return;
      await db.salvarPse({ turmaId: p.turmaId, nadadorId: n.id, data: p.data, valor: resp === 'apagar' ? null : resp.valor, duracao: resp.duracao ?? p.duracao, origem: 'professor' });
      aviso(resp === 'apagar' ? 'PSE apagada.' : 'PSE salva.');
      recarregar();
    }
  });
  if (pse) caixa.append(pse);

  if (nuvemLigada() && !(t && t.exemplo) && !n.arquivado) caixa.append(cartaoAcesso(n));

  /* cadastro */
  const nome = h('input', { id: 'ed-nome', type: 'text', maxlength: 60, autocomplete: 'off' });
  nome.value = n.nome;
  const form = h('form', { class: 'form' },
    h('label', { class: 'campo', for: 'ed-nome' }, h('span', { class: 'lbl', text: 'Nome' }), nome),
    h('div', { class: 'acoes' }, h('button', { class: 'btn primario', type: 'submit' }, 'Salvar')));
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const nv = nome.value.trim();
    if (!nv) { nome.focus(); return; }
    await db.salvarNadador({ ...n, nome: nv });
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
      h('span', { class: 'sub', text: 'Arquivar tira o nadador do treino, mas guarda o histórico.' }))));
}

// Código para o aluno entrar no app e ver só os próprios dados.
function cartaoAcesso(n) {
  const area = h('div', { class: 'area-codigo' });
  const pendentes = h('div');
  const msg = h('p', { class: 'erro-campo', role: 'alert' });
  const gerar = h('button', { class: 'btn primario', type: 'button' }, 'Gerar código de acesso');

  async function listar() {
    pendentes.textContent = '';
    try {
      const lista = (await convitesPendentes()).filter(c => c.nadador_id === n.id);
      if (!lista.length) return;
      pendentes.append(h('p', { class: 'lbl', style: 'margin-top:12px', text: 'Códigos ainda não usados' }),
        h('ul', { class: 'lista' }, lista.map(c => h('li', null, h('div', { class: 'item' },
          h('b', { class: 'mono', text: formatarCodigo(c.codigo) }),
          h('span', { class: 'lado' }, botaoConfirmar('Cancelar', 'Confirmar', async () => { await cancelarConvite(c.codigo); listar(); }, 'btn pequeno fantasma')),
          h('span', { class: 'sub', text: `vale até ${dataCurta(isoLocal(new Date(c.expira_em)))}` }))))));
    } catch (e) { /* sem internet: a lista fica para depois */ }
  }

  gerar.addEventListener('click', async () => {
    gerar.disabled = true;
    msg.textContent = '';
    try {
      await sincronizar();   // o nadador precisa estar na nuvem antes de ganhar um código
      const codigo = await criarConvite('aluno', n.id);
      area.replaceChildren(caixaCodigo({ codigo, papel: 'aluno', para: n.nome, expiraEm: Date.now() + 30 * 864e5 }));
      listar();
    } catch (e) {
      msg.textContent = explicar(e);
    } finally { gerar.disabled = false; }
  });
  listar();
  return h('div', { class: 'card' },
    h('h3', { text: 'Acesso do aluno' }),
    h('p', { class: 'dica', style: 'margin-top:6px', text: `Gere um código e mande para ${n.nome}. Com ele, a pessoa entra com a conta Google e vê só os próprios treinos, tempos e gráficos.` }),
    h('div', { class: 'acoes', style: 'margin-top:12px' }, gerar), msg, area, pendentes);
}
