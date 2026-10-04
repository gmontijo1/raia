// Telas de entrada: "Entrar com Google" e, na primeira vez, o código de convite.

import { h } from '../util.js';
import { entrarComGoogle, resgatarCodigo, sair, perfil, explicar } from '../nuvem.js';
import { NOME_PROJETO } from '../marca.js';

// Topo das duas telas: logo grande, corda de raia e título (o cabeçalho do app fica escondido aqui).
function topoEntrada(titulo, texto) {
  return [
    h('span', { class: 'logo-projeto', role: 'img', 'aria-label': NOME_PROJETO }),
    h('div', { class: 'corda', 'aria-hidden': 'true' }),
    h('div', { class: 'entrada-titulo' }, h('h2', { text: titulo }), h('p', { class: 'dica', text: texto }))
  ];
}

export async function render(caixa) {
  const msg = h('p', { class: 'erro-campo', role: 'alert' });
  const botao = h('button', { class: 'btn primario grande', type: 'button' }, 'Entrar com Google');
  botao.addEventListener('click', async () => {
    if (!navigator.onLine) { msg.textContent = 'Sem internet. Conecte para entrar pela primeira vez.'; return; }
    botao.disabled = true;
    msg.textContent = '';
    try { await entrarComGoogle(); }
    catch (e) { msg.textContent = explicar(e); botao.disabled = false; }
  });
  caixa.append(h('div', { class: 'entrada' },
    ...topoEntrada('Entrar', 'Use a sua conta Google. Na primeira vez, você vai digitar o código que recebeu do professor.'),
    h('div', { class: 'entrada-form' }, botao, msg),
    h('p', { class: 'sub', text: 'Alunos veem só os próprios treinos. Professores usam o cronômetro e veem a turma toda.' })));
}

export async function renderCodigo(caixa) {
  const p = perfil();
  const campo = h('input', {
    id: 'codigo', class: 'campo-codigo', type: 'text', inputmode: 'text', autocomplete: 'one-time-code',
    autocapitalize: 'characters', spellcheck: 'false', maxlength: 9, placeholder: 'ABCD-2345', required: true
  });
  campo.addEventListener('input', () => {
    const limpo = campo.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
    campo.value = limpo.length > 4 ? `${limpo.slice(0, 4)}-${limpo.slice(4)}` : limpo;
  });
  const msg = h('p', { class: 'erro-campo', role: 'alert' });
  const botao = h('button', { class: 'btn primario grande', type: 'submit' }, 'Confirmar código');
  const form = h('form', { class: 'entrada-form' },
    h('label', { class: 'lbl', for: 'codigo', text: 'Código de acesso' }), campo, botao, msg);
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const codigo = campo.value.replace(/[^A-Z0-9]/gi, '');
    if (codigo.length !== 8) { msg.textContent = 'O código tem 8 letras e números.'; campo.focus(); return; }
    botao.disabled = true;
    msg.textContent = '';
    try {
      await resgatarCodigo(codigo);
      location.replace(location.pathname + '#/');
      location.reload();
    } catch (err) {
      msg.textContent = explicar(err);
      botao.disabled = false;
    }
  });
  caixa.append(h('div', { class: 'entrada' },
    ...topoEntrada('Seu código', 'Digite o código de 8 letras e números que você recebeu do professor (ou do coordenador). Ele liga a sua conta ao seu cadastro no projeto.'),
    form,
    h('p', { class: 'sub' }, `Conta: ${(p && p.email) || ''} · `,
      h('button', { class: 'link', type: 'button', onclick: async () => { await sair(); location.replace(location.pathname + '#/entrar'); location.reload(); } }, 'Entrar com outra conta'))));
  setTimeout(() => campo.focus(), 0);
}
