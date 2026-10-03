// Tela de treino: o cronômetro de beira de piscina.
// O professor larga a raia e toca no nome de cada nadador quando ele chega: o tempo já
// fica gravado no aparelho, sem caderno e sem planilha.

import { h, aviso, fmtTempo, fmtDelta, combo, hoje, hora, dataLonga, ESTILOS, DISTANCIAS, porTreino, doCombo, melhorDe, naoEncontrado } from '../util.js';
import * as db from '../db.js';
import { minigrafico } from '../grafico.js';
import { abrirLancamento } from '../lancar.js';

// Estado do cronômetro por turma. Fica na memória enquanto o app está aberto, então dá
// para olhar outra tela e voltar sem perder uma raia que está nadando.
const sessoes = new Map();
function sessao(turmaId) {
  if (!sessoes.has(turmaId)) sessoes.set(turmaId, { ausentes: new Set(), raias: new Map() });
  return sessoes.get(turmaId);
}
function estado(R) {
  if (!R || R.t0 == null) return 'parada';
  return R.membros.every(id => R.cheg[id]) ? 'fim' : 'rodando';
}
const algumaRodando = () => [...sessoes.values()].some(S => [...S.raias.values()].some(R => estado(R) === 'rodando'));

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

const rotuloRaia = k => (k === 0 ? 'Sem raia' : `Raia ${k}`);

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
  const cfg = { dist: 50, estilo: 'crawl', intervalo: 5, ...(await db.config.get('treino', {})) };
  const S = sessao(turmaId);
  const dHoje = hoje();
  const porId = new Map(nads.map(n => [n.id, n]));

  caixa.append(h('div', null, h('a', { class: 'voltar', href: `#/turma/${t.id}` }, `← ${t.nome}`)));
  caixa.append(h('div', { class: 'cabeca' },
    h('div', null, h('h2', { text: 'Treino' }), h('p', { class: 'sub', text: `${dataLonga(dHoje)} · ${t.nome}` })),
    nads.length ? h('div', { class: 'acoes' }, h('button', {
      class: 'btn', type: 'button',
      onclick: () => abrirLancamento({ turmaId, nadadores: nads, dist: cfg.dist, estilo: cfg.estilo, aoSalvar: reg => { tempos.push(reg); montar(); listarSessao(); } })
    }, 'Lançar tempo à mão')) : null));

  if (!nads.length) {
    caixa.append(h('div', { class: 'card vazio' },
      h('h3', { text: 'Essa turma ainda não tem nadadores' }),
      h('p', { text: 'Cadastre os nadadores e a raia de costume de cada um. Depois volte aqui para cronometrar.' }),
      h('a', { class: 'btn primario', href: `#/turma/${t.id}` }, 'Cadastrar nadadores')));
    return;
  }

  /* ajustes da repetição */
  const salvarCfg = () => db.config.set('treino', cfg);
  caixa.append(h('div', { class: 'ajustes' },
    segmentado('dist', 'Distância', DISTANCIAS.map(d => [d, `${d} m`]), cfg.dist, v => { cfg.dist = +v; salvarCfg(); montar(); }),
    segmentado('estilo', 'Estilo', ESTILOS.map(e => [e, e[0].toUpperCase() + e.slice(1)]), cfg.estilo, v => { cfg.estilo = v; salvarCfg(); montar(); }),
    segmentado('intervalo', 'Saída entre nadadores da raia', [[0, 'Juntos'], [5, '5 s'], [10, '10 s']], cfg.intervalo, v => { cfg.intervalo = +v; salvarCfg(); })));

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
    h('p', { class: 'sub', style: 'margin-top:8px', text: 'Desmarque quem faltou: a pessoa some das raias de hoje.' }), listaPresenca));

  caixa.append(h('p', { class: 'dica' }, 'Toque em ', h('b', { text: 'Largar' }), ' quando a raia sair. Quando cada nadador tocar a borda, toque no nome dele: o tempo fica salvo neste aparelho na hora.'));
  const gradeRaias = h('div', { class: 'raias' });
  caixa.append(gradeRaias);

  const listaSessao = h('ol', { class: 'lista sessao' });
  const contaSessao = h('span', { class: 'sub' });
  caixa.append(h('div', { class: 'card' },
    h('div', { class: 'card-head' }, h('h3', null, 'Tempos de hoje ', contaSessao)),
    listaSessao));

  /* ---------- raias ---------- */
  const els = new Map();

  function grupos() {
    const g = new Map();
    for (const n of nads) {
      if (S.ausentes.has(n.id)) continue;
      const k = n.raia || 0;
      if (!g.has(k)) g.set(k, []);
      g.get(k).push(n);
    }
    return g;
  }
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
    els.clear();
    gradeRaias.textContent = '';
    const g = grupos();
    const chaves = new Set([...g.keys()]);
    for (const [k, R] of S.raias) if (estado(R) !== 'parada') chaves.add(k);
    const ordem = [...chaves].sort((a, b) => (a === 0) - (b === 0) || a - b);
    for (const k of ordem) {
      const R = S.raias.get(k);
      const membros = estado(R) === 'parada' ? (g.get(k) || []).map(n => n.id) : R.membros;
      if (!membros.length) continue;
      const relogio = h('div', { class: 'relogio', text: '0,00' });
      const oque = h('div', { class: 'raia-oque' });
      const btn = h('button', { class: 'btn primario', type: 'button', onclick: () => acaoRaia(k) }, 'Largar');
      const lista = h('div', { class: 'nadadores' });
      const cards = new Map();
      for (const id of membros) {
        const n = porId.get(id);
        const rep = h('span', { class: 'nad-rep', hidden: true });
        const melhor = h('span');
        const mini = h('span');
        const grande = h('div', { class: 'nad-grande', text: '–' });
        const nota = h('div', { class: 'nad-nota' });
        const card = h('button', { class: 'nad', type: 'button', 'data-st': 'espera', onclick: () => tocar(k, id) },
          h('div', { class: 'nad-nome' }, h('span', { text: n.nome }), rep),
          grande,
          h('div', { class: 'nad-melhor' }, melhor, mini),
          nota);
        cards.set(id, { card, rep, melhor, mini, grande, nota, nome: n.nome });
        lista.append(card);
      }
      gradeRaias.append(h('div', { class: 'raia' },
        h('div', { class: 'raia-topo' }, h('div', { class: 'raia-n', text: rotuloRaia(k) }), h('div', { class: 'raia-meta' }, relogio, oque), btn),
        lista));
      els.set(k, { relogio, oque, btn, cards });
      pintarRaia(k);
    }
    // presença: quem está numa raia nadando não pode ser desmarcado agora
    const nadando = new Set();
    for (const R of S.raias.values()) if (estado(R) === 'rodando') R.membros.forEach(id => nadando.add(id));
    for (const [id, cb] of caixasPresenca) cb.disabled = nadando.has(id);
    const presentes = nads.length - S.ausentes.size;
    resumoPresenca.textContent = `Presença: ${presentes} de ${nads.length}`;
    iniciarTick();
  }

  function pintarRaia(k) {
    const R = S.raias.get(k), E = els.get(k);
    if (!E) return;
    const st = estado(R);
    const d = st === 'parada' ? cfg.dist : R.dist;
    const e = st === 'parada' ? cfg.estilo : R.estilo;
    E.oque.textContent = st === 'parada' ? `Próxima: ${combo(d, e)}` : `${combo(d, e)} · ${st === 'fim' ? 'todos chegaram' : 'nadando'}`;
    E.btn.textContent = st === 'rodando' ? 'Cancelar' : st === 'fim' ? 'Largar de novo' : 'Largar';
    E.btn.className = 'btn ' + (st === 'rodando' ? 'fantasma' : 'primario');
    if (st === 'parada') E.relogio.textContent = '0,00';
    for (const [id, c] of E.cards) {
      const seus = temposDe(id, d, e);
      const m = melhorDe(seus);
      c.melhor.textContent = m == null ? 'sem tempo ainda' : `melhor ${fmtTempo(m)}`;
      c.mini.textContent = '';
      const g = minigrafico(porTreino(seus).slice(-8));
      if (g) c.mini.append(g);
      const reps = seus.filter(r => r.data === dHoje).length;
      c.rep.hidden = !reps;
      c.rep.textContent = `${reps} hoje`;
      const ch = R && R.cheg[id];
      c.nota.textContent = '';
      if (ch) {
        c.card.dataset.st = 'chegou';
        c.grande.textContent = fmtTempo(ch.t);
        if (ch.id) c.nota.append(chip(ch));
        c.card.setAttribute('aria-label', `${c.nome}: chegou em ${fmtTempo(ch.t)}`);
      } else if (st === 'parada') {
        c.card.dataset.st = 'espera';
        c.grande.textContent = '–';
        c.card.setAttribute('aria-label', `${c.nome}: esperando a largada da ${rotuloRaia(k).toLowerCase()}`);
      } else {
        c.card.setAttribute('aria-label', `Registrar a chegada de ${c.nome}`);
      }
    }
  }

  function acaoRaia(k) {
    const R = S.raias.get(k);
    if (estado(R) === 'rodando') {
      S.raias.delete(k);
      montar();
      return;
    }
    const membros = (grupos().get(k) || []).map(n => n.id);
    if (!membros.length) return;
    const offs = {};
    membros.forEach((id, i) => { offs[id] = i * cfg.intervalo * 1000; });
    S.raias.set(k, { t0: performance.now(), dist: cfg.dist, estilo: cfg.estilo, membros, offs, cheg: {} });
    montar();
    manterTelaAcesa();
  }

  async function tocar(k, id) {
    const R = S.raias.get(k);
    const st = estado(R);
    const nome = porId.get(id).nome;
    if (st === 'parada') { aviso(`Toque em Largar na ${rotuloRaia(k).toLowerCase()} primeiro.`); return; }
    if (st !== 'rodando' || R.cheg[id]) return;
    const seg = (performance.now() - R.t0 - R.offs[id]) / 1000;
    if (seg < 0) { aviso(`${nome} ainda não saiu.`); return; }
    if (seg < 2) { aviso('Toque rápido demais (menos de 2 s). Marque quando o nadador tocar a borda.'); return; }
    const tt = Math.round(seg * 100) / 100;
    R.cheg[id] = { t: tt };          // marca na hora, antes de gravar, para não contar toque duplo
    pintarRaia(k);
    const seus = temposDe(id, R.dist, R.estilo);
    const p = melhorDe(seus);
    try {
      const reg = await db.registrarTempo({
        turmaId, nadadorId: id, data: dHoje, dist: R.dist, estilo: R.estilo, t: tt,
        rep: seus.filter(r => r.data === dHoje).length + 1
      });
      tempos.push(reg);
      R.cheg[id] = reg;
      const recorde = p != null && tt < p;
      vibrar(recorde ? [30, 40, 30] : 25);
      pintarRaia(k);
      listarSessao();
      montarSeFim(k);
      if (recorde) aviso(`★ Melhor tempo de ${nome} nos ${combo(R.dist, R.estilo)}: ${fmtTempo(tt)}`);
    } catch (e) {
      delete R.cheg[id];
      pintarRaia(k);
      aviso('Não consegui salvar esse tempo. Toque de novo.');
    }
  }
  // Quando a raia inteira chegou, libera a presença de quem estava nela.
  function montarSeFim(k) { if (estado(S.raias.get(k)) === 'fim') montar(); }

  /* ---------- relógio ---------- */
  let raf = 0;
  function tick() {
    raf = 0;
    const agora = performance.now();
    let algum = false;
    for (const [k, E] of els) {
      const R = S.raias.get(k);
      if (estado(R) !== 'rodando') continue;
      algum = true;
      E.relogio.textContent = fmtTempo((agora - R.t0) / 1000);
      for (const [id, c] of E.cards) {
        if (R.cheg[id]) continue;
        const dt = (agora - R.t0 - R.offs[id]) / 1000;
        if (dt < 0) { c.card.dataset.st = 'aguarda'; c.grande.textContent = `sai em ${Math.ceil(-dt)} s`; }
        else { c.card.dataset.st = 'nadando'; c.grande.textContent = fmtTempo(dt); }
      }
    }
    if (algum) raf = requestAnimationFrame(tick);
  }
  function iniciarTick() { if (!raf) raf = requestAnimationFrame(tick); }

  /* ---------- lista da sessão ---------- */
  function listarSessao() {
    listaSessao.textContent = '';
    const doDia = tempos.filter(r => r.data === dHoje).sort((a, b) => (a.criadoEm < b.criadoEm ? 1 : -1));
    contaSessao.textContent = doDia.length ? `· ${doDia.length} ${doDia.length === 1 ? 'tempo' : 'tempos'}` : '';
    if (!doDia.length) {
      listaSessao.append(h('li', { class: 'nada', text: 'Nenhum tempo hoje ainda. Largue uma raia e toque em cada nadador quando ele chegar.' }));
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
    for (const R of S.raias.values()) if (R.cheg[r.nadadorId] && R.cheg[r.nadadorId].id === id) delete R.cheg[r.nadadorId];
    montar();
    listarSessao();
    aviso('Tempo apagado.');
  }

  const aoVoltar = () => { if (document.visibilityState === 'visible' && algumaRodando()) manterTelaAcesa(); };
  document.addEventListener('visibilitychange', aoVoltar);

  montar();
  listarSessao();

  return () => {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    document.removeEventListener('visibilitychange', aoVoltar);
    if (!algumaRodando()) liberarTela();
  };
}
