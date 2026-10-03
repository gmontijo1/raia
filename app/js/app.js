// Ponto de entrada: navegação entre telas, menu e instalação para funcionar sem internet.

import { $, h } from './util.js';
import * as inicio from './telas/inicio.js';
import * as turma from './telas/turma.js';
import * as treino from './telas/treino.js';
import * as nadador from './telas/nadador.js';
import * as dados from './telas/dados.js';
import * as db from './db.js';
import { criarTurmaExemplo } from './exemplo.js';

const ROTAS = [
  [/^#\/?$/, inicio.render, 'turmas'],
  [/^#\/turma\/([\w-]+)$/, turma.render, 'turmas'],
  [/^#\/treino\/([\w-]+)$/, treino.render, 'turmas'],
  [/^#\/nadador\/([\w-]+)$/, nadador.render, 'turmas'],
  [/^#\/dados$/, dados.render, 'dados']
];

let geracao = 0;
let limpar = null;

async function navegar() {
  const hash = location.hash || '#/';
  if (hash === '#/carregar-exemplo') {
    const existente = (await db.listarTurmas()).find(t => t.exemplo);
    const t = existente || await criarTurmaExemplo();
    location.replace(`#/turma/${t.id}`);
    return;
  }
  const rota = ROTAS.map(([re, fn, menu]) => [hash.match(re), fn, menu]).find(([m]) => m);
  if (!rota) { location.replace('#/'); return; }
  const [m, render, menu] = rota;

  const minha = ++geracao;
  if (limpar) { try { limpar(); } catch (e) { /* tela anterior já saiu */ } limpar = null; }
  document.querySelectorAll('.nav a').forEach(a => {
    if (a.dataset.menu === menu) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });

  const caixa = h('div', { class: 'tela' });
  const main = $('#tela');
  main.replaceChildren(caixa);
  let fim = null;
  try {
    fim = await render(caixa, ...m.slice(1));
  } catch (e) {
    console.error(e);
    caixa.replaceChildren(h('div', { class: 'card vazio' },
      h('h3', { text: 'Algo deu errado nesta tela' }),
      h('p', { text: String(e && e.message || e) }),
      h('a', { class: 'btn', href: '#/' }, 'Voltar para as turmas')));
  }
  if (minha !== geracao) { if (typeof fim === 'function') fim(); return; }
  limpar = typeof fim === 'function' ? fim : null;
  window.scrollTo(0, 0);
}

window.addEventListener('hashchange', navegar);

/* ---------- funcionamento sem internet ---------- */
function registrarServiceWorker() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  let pediuAtualizacao = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (pediuAtualizacao) location.reload(); });
  navigator.serviceWorker.register('sw.js').then(reg => {
    const oferecer = () => {
      if (!reg.waiting || !navigator.serviceWorker.controller) return;
      const faixa = $('#faixa-atualizacao');
      faixa.hidden = false;
      $('#btn-atualizar').onclick = () => { pediuAtualizacao = true; reg.waiting.postMessage('atualizar'); };
    };
    oferecer();
    reg.addEventListener('updatefound', () => {
      const novo = reg.installing;
      if (novo) novo.addEventListener('statechange', () => { if (novo.state === 'installed') oferecer(); });
    });
  }).catch(e => console.warn('Sem modo offline:', e));
}

registrarServiceWorker();
navegar().finally(() => { document.documentElement.dataset.pronto = '1'; });
