// Tela de treino: o cronômetro de beira de piscina.
// Cada nadador tem o próprio cronômetro: LARGADA quando ele sai, PARAR quando ele chega.
// O tempo fica gravado no aparelho na hora, sem caderno e sem planilha.

import { h, aviso, fmtTempo, fmtDelta, combo, hoje, hora, dataLonga, ESTILOS, DISTANCIAS, porTreino, doCombo, melhorDe, naoEncontrado } from '../util.js';
import * as db from '../db.js';
import { minigrafico } from '../grafico.js';
import { abrirLancamento } from '../lancar.js';

// Estado do cronômetro por turma. Fica na memória enquanto o app está aberto, então dá
// para olhar outra tela e voltar sem perder quem está nadando.
const sessoes = new Map();
function sessao(turmaId) {
  if (!sessoes.has(turmaId)) sessoes.set(turmaId, { ausentes: new Set(), rodando: new Map(), ultimo: new Map(), pausa: new Map() });
  return sessoes.get(turmaId);
}
const algumRodando = () => [...sessoes.values()].some(S => S.rodando.size > 0);

const MINIMO_S = 2;      // menos que isso é toque sem querer
const PAUSA_MS = 1000;   // depois do PARAR, a LARGADA fica travada um instante (evita toque duplo)

/* tela sempre acesa enquanto alguém nada */
let trava = null;
async function manterTelaAcesa() {
  try {
    if (!trava && navigator.wakeLock) {
      trava = await navigator.wakeLock.request('screen');
      trava.addEventListener('release', () => { trava = null; });
    }
  } catch (e) { /* o aparelho recusou; segue sem */ }
}
function liberarTela() { if (trava) { trava.release().catch(() => {}); trava = null; } }
function vibrar(padrao) { try { if (navigator.vibrate) navigator.vibrate(padrao); } catch (e) { /* sem vibração */ } }

function segmentado(nome, rotulo, opcoes, valor, aoMudar) {
  const idL = `lbl-${nome}`;
  const g = h('div', { class: 'seg', role: 'radiogroup', 'aria-labelledby': idL });
  for (const [v, txt] of opcoes) {
    const id = `${nome}-${v}`;
    const inp = h('input', { type: 'radio', name: nome, id, value: v });
    if (String(v) === String(valor)) inp.checked = true;
    inp.addEventListener('change', () => aoMudar(v));
    g.append(inp, h('label', { for: id, text: txt }));
  }
  return h('div', { class: 'campo' }, h('span', { class: 'lbl', id: idL, text: rotulo }), g);
}

export async function render(caixa, turmaId) {
  const t = await db.turma(turmaId);
  if (!t || t.apagado) { caixa.append(naoEncontrado('Turma')); return; }
  const nads = await db.nadadoresDaTurma(turmaId);
  const tempos = await db.temposDaTurma(turmaId);
  const cfg = { dist: 50, estilo: 'crawl', ...(await db.config.get('treino', {})) };
  const S = sessao(turmaId);
  const dHoje = hoje();
  const porId = new Map(nads.map(n => [n.id, n]));

  caixa.append(h('div', null, h('a', { class: 'voltar', href: `#/turma/${t.id}` }, `← ${t.nome}`)));
  caixa.append(h('div', { class: 'cabeca' },
    h('div', null, h('h2', { text: 'Treino' }), h('p', { class: 'sub', text: `${dataLonga(dHoje)} · ${t.nome}` })),
    nads.length ? h('div', { class: 'acoes' }, h('button', {
      class: 'btn', type: 'button',
      onclick: () => abrirLancamento({ turmaId, nadadores: nads, dist: cfg.dist, estilo: cfg.estilo, aoSalvar: reg => { tempos.push(reg); pintarTodos(); listarSessao(); } })
    }, 'Lançar tempo à mão')) : null));

  if (!nads.length) {
    caixa.append(h('div', { class: 'card vazio' },
      h('h3', { text: 'Essa turma ainda não tem nadadores' }),
      h('p', { text: 'Cadastre os nadadores da turma. Depois volte aqui para cronometrar.' }),
      h('a', { class: 'btn primario', href: `#/turma/${t.id}` }, 'Cadastrar nadadores')));
    return;
  }

  /* distância e estilo da próxima largada */
  const salvarCfg = () => db.config.set('treino', { dist: cfg.dist, estilo: cfg.estilo });
  caixa.append(h('div', { class: 'ajustes' },
    segmentado('dist', 'Distância', DISTANCIAS.map(d => [d, `${d} m`]), cfg.dist, v => { cfg.dist = +v; salvarCfg(); pintarTodos(); }),
    segmentado('estilo', 'Estilo', ESTILOS.map(e => [e, e[0].toUpperCase() + e.slice(1)]), cfg.estilo, v => { cfg.estilo = v; salvarCfg(); pintarTodos(); })));

  /* presença */
  const resumoPresenca = h('summary');
  const caixasPresenca = new Map();
  const listaPresenca = h('div', { class: 'presenca' });
  for (const n of nads) {
    const cb = h('input', { type: 'checkbox', id: `pres-${n.id}` });
    cb.checked = !S.ausentes.has(n.id);
    cb.addEventListener('change', () => {
      if (cb.checked) S.ausentes.delete(n.id); else S.ausentes.add(n.id);
      montar();
    });
    caixasPresenca.set(n.id, cb);
    listaPresenca.append(h('label', { for: `pres-${n.id}` }, cb, n.nome));
  }
  caixa.append(h('details', { class: 'card' }, resumoPresenca,
    h('p', { class: 'sub', style: 'margin-top:8px', text: 'Desmarque quem faltou: a pessoa some da lista de hoje.' }), listaPresenca));

  const btnTodos = h('button', { class: 'btn', type: 'button', onclick: largarTodos });
  caixa.append(h('div', { class: 'barra-largada' },
    h('p', { class: 'dica' }, 'Toque em ', h('b', { text: 'LARGADA' }), ' quando o nadador sair e em ', h('b', { text: 'PARAR' }), ' quando ele tocar a borda. O tempo fica salvo na hora.'),
    btnTodos));
  const grade = h('div', { class: 'atletas' });
  caixa.append(grade);

  const listaSessao = h('ol', { class: 'lista sessao' });
  const contaSessao = h('span', { class: 'sub' });
  caixa.append(h('div', { class: 'card' },
    h('div', { class: 'card-head' }, h('h3', null, 'Tempos de hoje ', contaSessao)),
    listaSessao));

  /* ---------- cartões ---------- */
  const cards = new Map();
  const temposDe = (id, d, e) => doCombo(tempos.filter(r => r.nadadorId === id), d, e);

  // Melhor tempo anterior a este registro (para dizer se foi recorde pessoal).
  function anterior(r) {
    let b = null;
    for (const x of tempos) {
      if (x.nadadorId === r.nadadorId && x.dist === r.dist && x.estilo === r.estilo && x.id !== r.id &&
          x.criadoEm < r.criadoEm && (b == null || x.t < b)) b = x.t;
    }
    return b;
  }
  function chip(r) {
    const p = anterior(r);
    if (p == null) return h('span', { class: 'chip neutro', text: 'primeiro tempo registrado' });
    if (r.t < p) return h('span', { class: 'chip recorde', text: `★ Melhor tempo (${fmtDelta(r.t - p)})` });
    return h('span', { class: 'chip neutro', text: `${fmtDelta(r.t - p)} do melhor` });
  }

  function montar() {
    cards.clear();
    grade.textContent = '';
    for (const n of nads) {
      if (S.ausentes.has(n.id)) continue;
      const rep = h('span', { class: 'nad-rep', hidden: true });
      const melhor = h('span');
      const mini = h('span');
      const nota = h('div', { class: 'at-nota' });
      const cancelar = h('button', { class: 'link', type: 'button', hidden: true, onclick: () => cancelarLargada(n.id) }, 'Cancelar largada');
      const relogio = h('div', { class: 'at-relogio', 'aria-live': 'off' });
      const botao = h('button', { class: 'btn-cron', type: 'button', onclick: () => tocar(n.id) });
      const card = h('div', { class: 'atleta', 'data-st': 'pronto' },
        h('div', { class: 'at-info' },
          h('div', { class: 'at-nome' }, h('span', { text: n.nome }), rep),
          h('div', { class: 'at-melhor' }, melhor, mini),
          nota, cancelar),
        h('div', { class: 'at-acao' }, relogio, botao));
      cards.set(n.id, { card, rep, melhor, mini, nota, cancelar, relogio, botao, nome: n.nome });
      grade.append(card);
    }
    for (const [id, cb] of caixasPresenca) cb.disabled = S.rodando.has(id);
    resumoPresenca.textContent = `Presença: ${nads.length - S.ausentes.size} de ${nads.length}`;
    pintarTodos();
    iniciarTick();
  }

  function pintar(id) {
    const c = cards.get(id);
    if (!c) return;
    const R = S.rodando.get(id);
    const d = R ? R.dist : cfg.dist, e = R ? R.estilo : cfg.estilo;
    const seus = temposDe(id, d, e);
    const m = melhorDe(seus);
    c.melhor.textContent = m == null ? `sem tempo nos ${combo(d, e)}` : `melhor ${fmtTempo(m)}`;
    c.mini.textContent = '';
    const g = minigrafico(porTreino(seus).slice(-8));
    if (g) c.mini.append(g);
    const reps = seus.filter(r => r.data === dHoje).length;
    c.rep.hidden = !reps;
    c.rep.textContent = `${reps} hoje`;
    c.nota.textContent = '';
    if (R) {
      c.card.dataset.st = 'nadando';
      c.botao.textContent = 'PARAR';
      c.botao.className = 'btn-cron parar';
      c.botao.setAttribute('aria-label', `Parar o tempo de ${c.nome}`);
      c.cancelar.hidden = false;
      c.nota.append(h('span', { text: `nadando ${combo(R.dist, R.estilo)}` }));
    } else {
      const ult = S.ultimo.get(id);
      c.card.dataset.st = ult ? 'chegou' : 'pronto';
      c.botao.textContent = 'LARGADA';
      c.botao.className = 'btn-cron largar';
      c.botao.setAttribute('aria-label', `Largada de ${c.nome}`);
      c.cancelar.hidden = true;
      c.relogio.textContent = ult ? fmtTempo(ult.t) : '';
      if (ult) c.nota.append(h('span', { text: `último: ${combo(ult.dist, ult.estilo)}` }), ult.id ? chip(ult) : null);
    }
    c.botao.disabled = (S.pausa.get(id) || 0) > performance.now();
  }
  function pintarTodos() {
    for (const id of cards.keys()) pintar(id);
    const prontos = [...cards.keys()].filter(id => !S.rodando.has(id)).length;
    btnTodos.textContent = `Largar todos (${prontos})`;
    btnTodos.hidden = prontos < 2;
  }

  function largar(id, t0) {
    if ((S.pausa.get(id) || 0) > performance.now() || S.rodando.has(id)) return;
    S.rodando.set(id, { t0, dist: cfg.dist, estilo: cfg.estilo });
    const cb = caixasPresenca.get(id);
    if (cb) cb.disabled = true;
  }
  function largarTodos() {
    const t0 = performance.now();
    for (const id of cards.keys()) largar(id, t0);
    vibrar(20);
    pintarTodos();
    manterTelaAcesa();
    iniciarTick();
  }
  function cancelarLargada(id) {
    S.rodando.delete(id);
    const cb = caixasPresenca.get(id);
    if (cb) cb.disabled = false;
    pintarTodos();
    if (!algumRodando()) liberarTela();
  }

  async function tocar(id) {
    const R = S.rodando.get(id);
    if (!R) {
      largar(id, performance.now());
      vibrar(15);
      pintarTodos();
      manterTelaAcesa();
      iniciarTick();
      return;
    }
    const agora = performance.now();
    const seg = (agora - R.t0) / 1000;
    if (seg < MINIMO_S) { aviso(`Toque rápido demais (menos de ${MINIMO_S} s). Toque em PARAR quando o nadador tocar a borda.`); return; }
    const tt = Math.round(seg * 100) / 100;
    const nome = porId.get(id).nome;
    S.rodando.delete(id);
    S.pausa.set(id, agora + PAUSA_MS);
    setTimeout(() => pintar(id), PAUSA_MS + 20);
    S.ultimo.set(id, { t: tt, dist: R.dist, estilo: R.estilo });   // mostra na hora, antes de gravar
    const cb = caixasPresenca.get(id);
    if (cb) cb.disabled = false;
    pintarTodos();
    const seus = temposDe(id, R.dist, R.estilo);
    const p = melhorDe(seus);
    try {
      const reg = await db.registrarTempo({
        turmaId, nadadorId: id, data: dHoje, dist: R.dist, estilo: R.estilo, t: tt,
        rep: seus.filter(r => r.data === dHoje).length + 1
      });
      tempos.push(reg);
      S.ultimo.set(id, reg);
      const recorde = p != null && tt < p;
      vibrar(recorde ? [30, 40, 30] : 25);
      pintar(id);
      listarSessao();
      if (recorde) aviso(`★ Melhor tempo de ${nome} nos ${combo(R.dist, R.estilo)}: ${fmtTempo(tt)}`);
    } catch (e) {
      S.ultimo.delete(id);
      S.pausa.delete(id);
      S.rodando.set(id, R);          // volta a correr: o professor pode tocar PARAR de novo
      pintarTodos();
      iniciarTick();
      aviso('Não consegui salvar esse tempo. Toque em PARAR de novo.');
    }
    if (!algumRodando()) liberarTela();
  }

  /* ---------- relógio ---------- */
  let raf = 0;
  function tick() {
    raf = 0;
    const agora = performance.now();
    let algum = false;
    for (const [id, R] of S.rodando) {
      const c = cards.get(id);
      if (!c) continue;
      algum = true;
      c.relogio.textContent = fmtTempo((agora - R.t0) / 1000);
    }
    if (algum) raf = requestAnimationFrame(tick);
  }
  function iniciarTick() { if (!raf) raf = requestAnimationFrame(tick); }

  /* ---------- lista do dia ---------- */
  function listarSessao() {
    listaSessao.textContent = '';
    const doDia = tempos.filter(r => r.data === dHoje).sort((a, b) => (a.criadoEm < b.criadoEm ? 1 : -1));
    contaSessao.textContent = doDia.length ? `· ${doDia.length} ${doDia.length === 1 ? 'tempo' : 'tempos'}` : '';
    if (!doDia.length) {
      listaSessao.append(h('li', { class: 'nada', text: 'Nenhum tempo hoje ainda. Toque em LARGADA quando o primeiro nadador sair.' }));
      return;
    }
    for (const r of doDia) {
      const nome = porId.get(r.nadadorId)?.nome || 'Nadador arquivado';
      listaSessao.append(h('li', null,
        h('span', { class: 't', text: fmtTempo(r.t) }),
        h('div', { class: 'quem' },
          h('b', { text: nome }),
          h('span', { class: 'meta', text: `${combo(r.dist, r.estilo)} · ${r.rep}ª repetição · ${hora(r.criadoEm)}${r.origem === 'manual' ? ' · lançado à mão' : ''}` }),
          chip(r)),
        h('button', { class: 'btn pequeno fantasma', type: 'button', 'aria-label': `Desfazer o tempo ${fmtTempo(r.t)} de ${nome}`, onclick: () => desfazer(r.id) }, 'Desfazer')));
    }
  }

  async function desfazer(id) {
    await db.apagarTempo(id);
    const i = tempos.findIndex(r => r.id === id);
    if (i < 0) return;
    const r = tempos.splice(i, 1)[0];
    if (S.ultimo.get(r.nadadorId)?.id === id) S.ultimo.delete(r.nadadorId);
    pintarTodos();
    listarSessao();
    aviso('Tempo apagado.');
  }

  const aoVoltar = () => { if (document.visibilityState === 'visible' && algumRodando()) manterTelaAcesa(); };
  document.addEventListener('visibilitychange', aoVoltar);

  montar();
  listarSessao();

  return () => {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    document.removeEventListener('visibilitychange', aoVoltar);
    if (!algumRodando()) liberarTela();
  };
}
