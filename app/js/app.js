// Ponto de entrada: quem está usando (login e papel), navegação entre telas, menu,
// sincronização e instalação para funcionar sem internet.
//
// Modos:
//   local      → nuvem não configurada: o app funciona só no aparelho, sem login.
//   visitante  → nuvem ligada, ninguém entrou: só a tela "Entrar".
//   sem-papel  → entrou com Google, mas ainda não usou um código: só a tela do código.
//   aluno      → só os próprios treinos.
//   equipe     → professor ou master: o app inteiro (master também vê "Acessos").

import { $, h } from './util.js';
import * as inicio from './telas/inicio.js';
import * as turma from './telas/turma.js';
import * as treino from './telas/treino.js';
import * as nadador from './telas/nadador.js';
import * as dados from './telas/dados.js';
import * as entrar from './telas/entrar.js';
import * as aluno from './telas/aluno.js';
import * as acessos from './telas/acessos.js';
import * as db from './db.js';
import { criarTurmaExemplo } from './exemplo.js';
import { nuvemLigada, sb, sessaoAtual, carregarPerfil, perfilGuardado, eMaster } from './nuvem.js';
import { ligarSincronia, aoMudarEstado, sincronizar } from './sincronia.js';

const EQUIPE = [
  [/^#\/?$/, inicio.render, 'turmas'],
  [/^#\/turma\/([\w-]+)$/, turma.render, 'turmas'],
  [/^#\/treino\/([\w-]+)$/, treino.render, 'turmas'],
  [/^#\/nadador\/([\w-]+)$/, nadador.render, 'turmas'],
  [/^#\/dados$/, dados.render, 'dados']
];
const ROTAS = {
  local: EQUIPE,
  equipe: EQUIPE,
  master: [...EQUIPE, [/^#\/acessos$/, acessos.render, 'acessos']],
  aluno: [
    [/^#\/?$/, aluno.render, 'meus'],
    [/^#\/meu-treino\/(\d{4}-\d{2}-\d{2})$/, aluno.renderTreino, 'meus']
  ],
  visitante: [[/^#\/entrar$/, entrar.render, '']],
  'sem-papel': [[/^#\/codigo$/, entrar.renderCodigo, '']]
};
const INICIO = { visitante: '#/entrar', 'sem-papel': '#/codigo' };
const MENU = {
  local: [['#/', 'turmas', 'Turmas'], ['#/dados', 'dados', 'Dados']],
  equipe: [['#/', 'turmas', 'Turmas'], ['#/dados', 'dados', 'Dados']],
  master: [['#/', 'turmas', 'Turmas'], ['#/acessos', 'acessos', 'Acessos'], ['#/dados', 'dados', 'Dados']],
  aluno: [['#/', 'meus', 'Meus treinos']]
};

let modo = 'local';
let geracao = 0;
let limpar = null;

const chaveModo = () => (modo === 'equipe' && eMaster() ? 'master' : modo);

async function navegar() {
  const hash = location.hash || '#/';
  const rotas = ROTAS[chaveModo()];
  if (hash === '#/carregar-exemplo' && (modo === 'local' || modo === 'equipe')) {
    const existente = (await db.listarTurmas()).find(t => t.exemplo);
    const t = existente || await criarTurmaExemplo();
    location.replace(`#/turma/${t.id}`);
    return;
  }
  const rota = rotas.map(([re, fn, menu]) => [hash.match(re), fn, menu]).find(([m]) => m);
  if (!rota) { location.replace(INICIO[modo] || '#/'); return; }
  const [m, render, menu] = rota;

  const minha = ++geracao;
  if (limpar) { try { limpar(); } catch (e) { /* tela anterior já saiu */ } limpar = null; }
  document.querySelectorAll('#menu a').forEach(a => {
    if (a.dataset.menu === menu) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });

  const caixa = h('div', { class: 'tela' });
  $('#tela').replaceChildren(caixa);
  let fim = null;
  try {
    fim = await render(caixa, ...m.slice(1));
  } catch (e) {
    console.error(e);
    caixa.replaceChildren(h('div', { class: 'card vazio' },
      h('h3', { text: 'Algo deu errado nesta tela' }),
      h('p', { text: String((e && e.message) || e) }),
      h('a', { class: 'btn', href: '#/' }, 'Voltar ao início')));
  }
  if (minha !== geracao) { if (typeof fim === 'function') fim(); return; }
  limpar = typeof fim === 'function' ? fim : null;
  window.scrollTo(0, 0);
}

window.addEventListener('hashchange', navegar);

/* ---------- menu e indicador de sincronização ---------- */
function montarMenu() {
  const itens = MENU[chaveModo()] || [];
  $('#menu').replaceChildren(...itens.map(([href, menu, rotulo]) => h('a', { href, 'data-menu': menu }, rotulo)));
}

function montarSincronia() {
  const botao = $('#sincronia');
  botao.hidden = false;
  botao.addEventListener('click', () => sincronizar());
  aoMudarEstado(e => {
    const textos = {
      parado: ['', 'Sincronizar'],
      enviando: ['enviando', 'Sincronizando…'],
      ok: ['ok', e.pendentes ? `${e.pendentes} para enviar` : 'Sincronizado'],
      offline: ['offline', e.pendentes ? `Sem internet · ${e.pendentes} esperando` : 'Sem internet'],
      erro: ['erro', 'Erro ao sincronizar']
    };
    const [classe, texto] = textos[e.fase] || textos.parado;
    botao.dataset.fase = classe;
    botao.textContent = texto;
    botao.title = e.erro || (e.ultimaVez ? `Última sincronização: ${new Date(e.ultimaVez).toLocaleTimeString('pt-BR')}` : 'Toque para sincronizar agora');
  });
}

// Quando chegam dados de outro aparelho, redesenha a tela (menos o treino, que tem
// cronômetros rodando, e menos quando alguém está digitando).
window.addEventListener('raia:recebido', e => {
  if (!e.detail || !e.detail.total) return;
  if (/^#\/treino\//.test(location.hash)) return;
  const ativo = document.activeElement;
  if (ativo && /^(INPUT|TEXTAREA|SELECT)$/.test(ativo.tagName)) return;
  if (document.querySelector('dialog[open], .caixa-codigo')) return;
  navegar();
});

/* ---------- funcionamento sem internet ---------- */
function registrarServiceWorker() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  let pediuAtualizacao = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (pediuAtualizacao) location.reload(); });
  navigator.serviceWorker.register('sw.js').then(reg => {
    const oferecer = () => {
      if (!reg.waiting || !navigator.serviceWorker.controller) return;
      $('#faixa-atualizacao').hidden = false;
      $('#btn-atualizar').onclick = () => { pediuAtualizacao = true; reg.waiting.postMessage('atualizar'); };
    };
    oferecer();
    reg.addEventListener('updatefound', () => {
      const novo = reg.installing;
      if (novo) novo.addEventListener('statechange', () => { if (novo.state === 'installed') oferecer(); });
    });
  }).catch(e => console.warn('Sem modo offline:', e));
}

/* ---------- quem está usando ---------- */
async function descobrirModo() {
  if (!nuvemLigada()) return 'local';
  let sessao = null;
  try { sessao = await sessaoAtual(); } catch (e) { /* sem internet ou sessão vencida */ }
  // volta do login do Google: tira o ?code= do endereço
  if (/[?&]code=/.test(location.search)) history.replaceState(null, '', location.pathname + (location.hash || '#/'));
  let p = null;
  if (sessao) {
    try { p = await carregarPerfil(sessao); } catch (e) { p = await perfilGuardado(); }
  } else if (!navigator.onLine) {
    p = await perfilGuardado();   // professor na piscina sem Wi-Fi: segue com o último perfil
  }
  if (!p) return 'visitante';
  if (!p.papel) return 'sem-papel';
  return p.papel === 'aluno' ? 'aluno' : 'equipe';
}

async function iniciar() {
  registrarServiceWorker();
  try { modo = await descobrirModo(); } catch (e) { console.error(e); modo = 'visitante'; }
  document.documentElement.dataset.modo = modo;
  montarMenu();
  if (modo === 'equipe') { montarSincronia(); ligarSincronia(); }
  if (nuvemLigada()) {
    sb().auth.onAuthStateChange(evento => {
      if (evento === 'SIGNED_OUT' && modo !== 'visitante') { location.replace(location.pathname + '#/entrar'); location.reload(); }
    });
  }
  await navegar();
}

iniciar().finally(() => { document.documentElement.dataset.pronto = '1'; });
