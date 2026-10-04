// Tela do master: convidar professores e masters, ver quem tem acesso e remover acessos.
// Códigos de aluno são gerados na tela de cada nadador.

import { h, aviso, dataCurta, isoLocal, botaoConfirmar } from '../util.js';
import { perfil, criarConvite, convitesPendentes, cancelarConvite, listarAcessos, removerAcesso, formatarCodigo, explicar } from '../nuvem.js';
import { caixaCodigo } from '../convite.js';

const PAPEL = { master: 'Master', professor: 'Professor', aluno: 'Aluno' };
const PLURAL = { master: 'Masters', professor: 'Professores', aluno: 'Alunos' };

export async function render(caixa) {
  const recarregar = () => { caixa.textContent = ''; return render(caixa); };
  caixa.append(h('div', { class: 'cabeca' }, h('div', null,
    h('h2', { text: 'Acessos' }),
    h('p', { class: 'sub', text: 'Quem pode entrar no app e o que cada um vê.' }))));

  if (!navigator.onLine) {
    caixa.append(h('div', { class: 'card vazio' }, h('h3', { text: 'Sem internet' }), h('p', { text: 'Os acessos ficam na nuvem. Conecte para ver e convidar.' })));
    return;
  }

  /* convidar */
  const area = h('div', { class: 'area-codigo' });
  const msg = h('p', { class: 'erro-campo', role: 'alert' });
  const convidar = papel => async e => {
    const b = e.currentTarget;
    b.disabled = true;
    msg.textContent = '';
    try {
      const codigo = await criarConvite(papel);
      area.replaceChildren(caixaCodigo({ codigo, papel, expiraEm: Date.now() + 30 * 864e5 }));
      listarPendentes();
    } catch (err) { msg.textContent = explicar(err); }
    finally { b.disabled = false; }
  };
  caixa.append(h('div', { class: 'card' },
    h('h3', { text: 'Convidar' }),
    h('p', { class: 'dica', style: 'margin-top:6px', text: 'Professor usa o cronômetro e vê todos os alunos. Master também convida e remove pessoas. O código de cada aluno é gerado na tela do nadador.' }),
    h('div', { class: 'acoes', style: 'margin-top:12px' },
      h('button', { class: 'btn primario', type: 'button', onclick: convidar('professor') }, 'Convidar professor'),
      h('button', { class: 'btn', type: 'button', onclick: convidar('master') }, 'Convidar master')),
    msg, area));

  /* códigos ainda não usados */
  const pendentes = h('div', { class: 'card' }, h('h3', { text: 'Códigos ainda não usados' }));
  caixa.append(pendentes);
  async function listarPendentes() {
    pendentes.replaceChildren(h('h3', { text: 'Códigos ainda não usados' }));
    try {
      const lista = await convitesPendentes();
      if (!lista.length) { pendentes.append(h('p', { class: 'sub', style: 'margin-top:6px', text: 'Nenhum.' })); return; }
      pendentes.append(h('ul', { class: 'lista' }, lista.map(c => h('li', null, h('div', { class: 'item' },
        h('b', { class: 'mono', text: formatarCodigo(c.codigo) }),
        h('span', { class: 'lado' }, botaoConfirmar('Cancelar', 'Confirmar', async () => { await cancelarConvite(c.codigo); aviso('Código cancelado.'); listarPendentes(); }, 'btn pequeno fantasma')),
        h('span', { class: 'sub', text: `${PAPEL[c.papel]} · vale até ${dataCurta(isoLocal(new Date(c.expira_em)))}` }))))));
    } catch (err) { pendentes.append(h('p', { class: 'erro-campo', text: explicar(err) })); }
  }
  listarPendentes();

  /* quem tem acesso */
  const eu = perfil();
  try {
    const pessoas = await listarAcessos();
    const grupos = ['master', 'professor', 'aluno'].map(p => [p, pessoas.filter(x => x.papel === p)]);
    caixa.append(h('div', { class: 'card' },
      h('h3', { text: `Quem tem acesso (${pessoas.length})` }),
      ...grupos.filter(([, l]) => l.length).map(([papel, l]) => [
        h('p', { class: 'lbl', style: 'margin-top:14px', text: `${(l.length > 1 ? PLURAL : PAPEL)[papel]} (${l.length})` }),
        h('ul', { class: 'lista' }, l.map(x => h('li', null, h('div', { class: 'item' },
          h('b', { text: x.nome || x.email || 'Sem nome' }),
          h('span', { class: 'lado' }, x.usuario_id === eu.uid
            ? h('span', { class: 'etiqueta', text: 'você' })
            : botaoConfirmar('Remover', 'Confirmar remoção', async () => { await removerAcesso(x.usuario_id); aviso('Acesso removido.'); recarregar(); }, 'btn pequeno perigo')),
          h('span', { class: 'sub', text: [x.email, x.nadador_nome ? `cadastro: ${x.nadador_nome}` : null].filter(Boolean).join(' · ') })))))
      ])));
  } catch (err) {
    caixa.append(h('div', { class: 'card' }, h('p', { class: 'erro-campo', text: explicar(err) })));
  }
}
