// Tela de treino: o cronômetro de beira de piscina.
// Cada nadador tem o próprio cronômetro: LARGADA quando ele sai, PARAR quando ele chega.
// O tempo fica gravado no aparelho na hora, sem caderno e sem planilha.
// Tocar no nome abre o painel do nadador com as repetições de hoje, atualizado a cada PARAR.
// "Encerrar treino" tira o nadador da lista de hoje e manda os dados dele para a nuvem na hora;
// "Encerrar treino da turma" faz isso com todos e abre o resumo (telas/resumo.js).

import { h, aviso, perguntar, fmtTempo, fmtDelta, combo, combos, hoje, hora, dataLonga, ESTILOS, DISTANCIAS, porTreino, doCombo, melhorDe, naoEncontrado } from '../util.js';
import * as db from '../db.js';
import { minigrafico } from '../grafico.js';
import { abrirLancamento } from '../lancar.js';
import { conteudoRepeticoes } from '../repeticoes.js';
import { nuvemLigada } from '../nuvem.js';
import { sincronizar, estadoSincronia, aoMudarEstado } from '../sincronia.js';
import { doDia, repeticoes, statusNuvem } from '../resumo-dia.js';
import { semanaDe, treinoDaTurma, professoresDaTurma, blocoTreino, temVcrit } from '../semana.js';
import { vcritAtual, alvoVcrit } from '../vcrit.js';
import { perguntarPse, chipPse, DURACAO_PADRAO } from '../pse.js';

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
  // Quem já encerrou o treino de hoje (guardado no aparelho; vale só para o dia).
  const chaveEnc = `encerrados:${turmaId}`;
  const guardados = await db.config.get(chaveEnc, null);
  S.encerrados = new Set(guardados && guardados.data === dHoje ? guardados.ids : []);
  const salvarEncerrados = () => db.config.set(chaveEnc, { data: dHoje, ids: [...S.encerrados] });
  // PSE de hoje (uma por aluno) e a duração da aula desta turma (a última usada)
  const psesHoje = new Map((await db.psesDaTurma(turmaId)).filter(p => p.data === dHoje).map(p => [p.nadadorId, p]));
  let duracaoAula = await db.config.get(`duracao:${turmaId}`, DURACAO_PADRAO);
  const planoHoje = (await db.planosDaTurma(turmaId)).find(p => p.data === dHoje);
  const [semanas, escala] = await Promise.all([db.listarSemanas(), db.listarEscala()]);
  const semana = semanaDe(semanas, dHoje);
  const treinoHoje = treinoDaTurma(semana, t, dHoje);
  const professores = professoresDaTurma(escala, t, dHoje);

  caixa.append(h('div', null, h('a', { class: 'voltar', href: `#/turma/${t.id}` }, `← ${t.nome}`)));
  caixa.append(h('div', { class: 'cabeca' },
    h('div', null, h('h2', { text: 'Treino' }), h('p', { class: 'sub', text: `${dataLonga(dHoje)} · ${t.nome}` })),
    nads.length ? h('div', { class: 'acoes' }, h('button', {
      class: 'btn', type: 'button',
      onclick: () => abrirLancamento({ turmaId, nadadores: nads, dist: cfg.dist, estilo: cfg.estilo, aoSalvar: reg => { tempos.push(reg); pintarTodos(); listarSessao(); pintarEncerrados(); } })
    }, 'Lançar tempo à mão')) : null));
  // Semana do planejamento e quem dá aula hoje neste horário
  if (semana || professores) {
    caixa.append(h('div', { class: 'linha contexto-treino' },
      semana ? h('a', { class: 'etiqueta semana-link', href: `#/planejamento/${semana.numero}` },
        `Semana ${semana.numero}${semana.periodo ? ` · ${semana.periodo}` : ''}${semana.conteudo ? ` · ${semana.conteudo}` : ''}`) : null,
      professores ? h('span', { class: 'sub', text: `Professores: ${professores}` }) : null));
  }
  // Treino do dia: o escrito para esta turma e data manda; senão, o do planejamento da semana
  if (planoHoje) caixa.append(h('div', { class: 'card plano' }, h('span', { class: 'lbl', text: 'Treino planejado para hoje' }), h('p', { class: 'plano-texto', text: planoHoje.descricao })));
  else if (treinoHoje) caixa.append(h('div', { class: 'card plano' }, h('span', { class: 'lbl', text: `Treino de hoje · semana ${semana.numero}` }), blocoTreino(treinoHoje, `Dia ${treinoHoje.dia}`)));
  if (semana && temVcrit(semana)) {
    caixa.append(h('p', { class: 'dica' }, h('b', { text: 'Semana de teste de Vcrit: ' }), 'cronometre 400 m e 200 m crawl no máximo. A Vcrit de cada aluno aparece na evolução dele.'));
  }

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

  /* quem já encerrou, e o fim do treino da turma */
  const listaEnc = h('div', { class: 'atletas' });
  const secEnc = h('div', { class: 'encerrados', hidden: true }, h('span', { class: 'lbl', text: 'Treino encerrado' }), listaEnc);
  const btnEncerrarTurma = h('button', { class: 'btn grande', type: 'button', onclick: encerrarTurma }, 'Encerrar treino da turma');
  const btnResumo = h('a', { class: 'btn primario grande', href: `#/resumo/${turmaId}`, hidden: true }, 'Ver resumo do treino');
  caixa.append(secEnc, btnEncerrarTurma, btnResumo);

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
      if (S.ausentes.has(n.id) || S.encerrados.has(n.id)) continue;
      const rep = h('span', { class: 'nad-rep', hidden: true });
      const melhor = h('span');
      const mini = h('span');
      const nota = h('div', { class: 'at-nota' });
      const cancelar = h('button', { class: 'link', type: 'button', hidden: true, onclick: () => cancelarLargada(n.id) }, 'Cancelar largada');
      const encerrar = h('button', { class: 'btn pequeno at-encerrar', type: 'button', onclick: () => encerrarNadador(n.id) }, 'Encerrar treino');
      const relogio = h('div', { class: 'at-relogio', 'aria-live': 'off' });
      const botao = h('button', { class: 'btn-cron', type: 'button', onclick: () => tocar(n.id) });
      const nomeBtn = h('button', { class: 'at-nome-btn', type: 'button', 'aria-label': `Ver as repetições de hoje de ${n.nome}`, onclick: () => abrirPainel(n.id) },
        h('span', { text: n.nome }), h('span', { class: 'seta', 'aria-hidden': 'true', text: '›' }));
      const card = h('div', { class: 'atleta', 'data-st': 'pronto' },
        h('div', { class: 'at-info' },
          h('div', { class: 'at-nome' }, nomeBtn, rep),
          h('div', { class: 'at-melhor' }, melhor, mini),
          nota, cancelar, encerrar),
        h('div', { class: 'at-acao' }, relogio, botao));
      cards.set(n.id, { card, rep, melhor, mini, nota, cancelar, encerrar, relogio, botao, nomeBtn, nome: n.nome });
      grade.append(card);
    }
    for (const [id, cb] of caixasPresenca) cb.disabled = S.rodando.has(id);
    resumoPresenca.textContent = `Presença: ${nads.length - S.ausentes.size} de ${nads.length}`;
    pintarTodos();
    pintarEncerrados();
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
    // alvo no ritmo de Vcrit (só crawl, quando o nadador já tem teste)
    const vc = e === 'crawl' ? vcritAtual(tempos.filter(r => r.nadadorId === id)) : null;
    if (vc) c.melhor.textContent += ` · Vcrit ${fmtTempo(alvoVcrit(vc, d))}`;
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
    c.encerrar.disabled = !!R;
    if (painelId === id) desenharPainel();
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
    if (painelId === id) painelCombo = `${cfg.dist}|${cfg.estilo}`;
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
      if (painelId === id) painelCombo = `${R.dist}|${R.estilo}`;
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

  /* ---------- painel do nadador: repetições de hoje, em tempo real ---------- */
  const painel = h('aside', { class: 'painel', role: 'dialog', 'aria-modal': 'false', 'aria-labelledby': 'painel-titulo', hidden: true });
  caixa.append(painel);
  let painelId = null;       // nadador aberto no painel
  let painelCombo = null;    // "dist|estilo" mostrado; null = escolher sozinho
  let painelRelogio = null;  // relógio do painel, atualizado pelo tick

  function abrirPainel(id) {
    painelId = id;
    painelCombo = null;
    painel.hidden = false;
    painel.scrollTop = 0;
    desenharPainel();
    document.getElementById('painel-titulo')?.focus();
  }
  function fecharPainel() {
    const id = painelId;
    painelId = null;
    painelRelogio = null;
    painel.hidden = true;
    painel.textContent = '';
    cards.get(id)?.nomeBtn.focus();
  }
  const teclaPainel = e => { if (e.key === 'Escape' && painelId) fecharPainel(); };
  document.addEventListener('keydown', teclaPainel);

  function desenharPainel() {
    if (!painelId) return;
    const id = painelId;
    const n = porId.get(id);
    const R = S.rodando.get(id);
    const doDia = tempos.filter(r => r.nadadorId === id && r.data === dHoje)
      .sort((a, b) => (a.criadoEm < b.criadoEm ? -1 : 1));
    const chave = (d, e) => `${d}|${e}`;
    const ultimo = doDia[doDia.length - 1];
    const atual = painelCombo || (R ? chave(R.dist, R.estilo) : ultimo ? chave(ultimo.dist, ultimo.estilo) : chave(cfg.dist, cfg.estilo));
    const [dTxt, estilo] = atual.split('|');
    const dist = +dTxt;
    const reps = doDia.filter(r => r.dist === dist && r.estilo === estilo);
    const recorde = melhorDe(tempos.filter(r => r.nadadorId === id && r.dist === dist && r.estilo === estilo && r.data < dHoje));

    /* cabeçalho com o cronômetro do próprio nadador */
    painelRelogio = h('div', { class: 'at-relogio' });
    const botao = h('button', { class: 'btn-cron', type: 'button', onclick: () => tocar(id) });
    if (R) {
      botao.textContent = 'PARAR';
      botao.className = 'btn-cron parar';
      botao.setAttribute('aria-label', `Parar o tempo de ${n.nome}`);
      painelRelogio.textContent = fmtTempo((performance.now() - R.t0) / 1000);
    } else {
      botao.textContent = 'LARGADA';
      botao.className = 'btn-cron largar';
      botao.setAttribute('aria-label', `Largada de ${n.nome}`);
    }
    botao.disabled = (S.pausa.get(id) || 0) > performance.now();
    const cab = h('div', { class: 'painel-cab', 'data-st': R ? 'nadando' : 'pronto' },
      h('div', { class: 'at-info' },
        h('h3', { id: 'painel-titulo', class: 'painel-nome', tabindex: '-1', text: n.nome }),
        h('p', { class: 'sub', text: `Treino de hoje · ${dataLonga(dHoje)}` }),
        h('p', { class: 'at-nota', text: R ? `nadando ${combo(R.dist, R.estilo)}` : `próxima largada: ${combo(cfg.dist, cfg.estilo)}` }),
        R ? h('button', { class: 'link', type: 'button', onclick: () => cancelarLargada(id) }, 'Cancelar largada') : null),
      h('div', { class: 'at-acao' }, painelRelogio, botao));
    const encerrarBtn = h('button', { class: 'btn grande', type: 'button', disabled: !!R, onclick: () => encerrarNadador(id) }, `Encerrar treino de ${n.nome}`);

    /* escolha de distância e estilo, se ele nadou mais de um hoje */
    const opcoes = combos(doDia).map(([d, e]) => chave(d, e));
    if (!opcoes.includes(atual)) opcoes.push(atual);
    const seletor = opcoes.length > 1 ? h('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'Distância e estilo' },
      opcoes.map(o => {
        const [d, e] = o.split('|');
        const idr = `pc-${d}-${e}`;
        const inp = h('input', { type: 'radio', name: 'painel-combo', id: idr, value: o });
        if (o === atual) inp.checked = true;
        inp.addEventListener('change', () => { painelCombo = o; desenharPainel(); });
        return [inp, h('label', { for: idr, text: combo(+d, e) })];
      })) : null;

    const corpo = [];
    if (!reps.length) {
      corpo.push(h('div', { class: 'card vazio' },
        h('h3', { text: `Nenhuma repetição de ${combo(dist, estilo)} hoje` }),
        h('p', { text: `Toque em LARGADA quando ${n.nome} sair. Cada repetição aparece aqui na hora.` }),
        recorde != null ? h('p', { class: 'sub', text: `Melhor tempo pessoal nos ${combo(dist, estilo)}: ${fmtTempo(recorde)}` }) : null));
    } else {
      corpo.push(...conteudoRepeticoes({ reps, recorde, nome: n.nome, dist, estilo }));
    }
    corpo.push(h('a', { class: 'link', href: `#/nadador/${id}` }, 'Ver a evolução em todos os treinos →'));

    painel.textContent = '';
    painel.append(h('div', { class: 'painel-in' },
      h('div', { class: 'painel-topo' }, h('button', { class: 'link', type: 'button', onclick: fecharPainel }, '← Voltar ao treino')),
      cab, encerrarBtn, seletor, ...corpo));
  }

  /* ---------- encerrar o treino (de um nadador ou da turma) ---------- */
  const vaiParaNuvem = () => nuvemLigada() && !t.exemplo;

  async function encerrarNadador(id) {
    if (S.rodando.has(id) || S.encerrados.has(id)) return;
    const n = porId.get(id);
    const d = doDia(tempos, id, dHoje);
    // Ao encerrar, o professor pergunta a PSE ao aluno e toca no número (pode pular).
    const resp = await perguntarPse({
      titulo: `Encerrar o treino de ${n.nome}`,
      texto: `${d.reps ? `${repeticoes(d.reps)} hoje, melhor ${fmtTempo(d.melhor)}.` : 'Nenhuma repetição hoje.'} ` +
        (vaiParaNuvem() ? 'Os dados do dia vão para a nuvem.' : 'Os dados do dia ficam salvos neste aparelho.') +
        ' Pergunte ao aluno a PSE do treino:',
      valor: psesHoje.get(id)?.valor ?? null, duracao: duracaoAula,
      botao: 'Encerrar e salvar', semPse: 'Encerrar sem PSE'
    });
    if (!resp || S.rodando.has(id)) return;
    if (resp.valor != null) await gravarPse(id, resp);
    if (painelId === id) fecharPainel();
    S.encerrados.add(id);
    await salvarEncerrados();
    montar();
    enviarAgora(`Treino de ${n.nome}`);
  }

  async function encerrarTurma() {
    const ativos = [...cards.keys()];
    if (!ativos.length) return;
    const nadando = ativos.filter(id => S.rodando.has(id)).length;
    const ok = await perguntar({
      titulo: 'Encerrar o treino da turma?',
      texto: `${ativos.length === 1 ? '1 nadador ainda está' : `${ativos.length} nadadores ainda estão`} no treino. ` +
        (vaiParaNuvem() ? 'Os dados de todos vão para a nuvem.' : 'Os dados de todos ficam salvos neste aparelho.') +
        (nadando ? ' Tempos em andamento são descartados.' : ''),
      botao: 'Encerrar e ver resumo'
    });
    if (!ok) return;
    for (const id of cards.keys()) { S.rodando.delete(id); S.encerrados.add(id); }
    await salvarEncerrados();
    if (!algumRodando()) liberarTela();
    enviarAgora('Treino da turma');
    location.hash = `#/resumo/${turmaId}`;
  }

  async function reabrir(id) {
    S.encerrados.delete(id);
    await salvarEncerrados();
    montar();
  }

  // Envia agora, sem esperar a próxima rodada da sincronização, e avisa como ficou.
  async function enviarAgora(oque) {
    if (!vaiParaNuvem()) { aviso(`${oque} encerrado e salvo no aparelho.`); return; }
    await sincronizar();
    if (estadoSincronia().fase === 'ok' && estadoSincronia().pendentes) await sincronizar();
    const e = estadoSincronia();
    if (e.fase === 'ok' && !e.pendentes) aviso(`${oque} salvo na nuvem.`);
    else if (e.fase === 'offline') aviso(`${oque} encerrado. Sem internet: os dados sobem quando a conexão voltar.`);
    else aviso(`${oque} encerrado e salvo no aparelho. O app tenta enviar de novo sozinho.`);
  }

  async function gravarPse(id, resp) {
    const p = await db.salvarPse({ turmaId, nadadorId: id, data: dHoje, valor: resp.valor, duracao: resp.duracao, origem: 'professor' });
    if (p && !p.apagado) psesHoje.set(id, p); else psesHoje.delete(id);
    if (resp.duracao) { duracaoAula = resp.duracao; await db.config.set(`duracao:${turmaId}`, resp.duracao); }
  }

  // PSE de quem já encerrou (marcar depois, corrigir ou apagar)
  async function marcarPse(id) {
    const atual = psesHoje.get(id);
    const resp = await perguntarPse({
      titulo: `PSE de ${porId.get(id).nome} · hoje`, valor: atual?.valor ?? null,
      duracao: atual?.duracao ?? duracaoAula, botao: 'Salvar PSE', apagar: !!atual
    });
    if (!resp) return;
    await gravarPse(id, resp === 'apagar' ? { valor: null } : resp);
    pintarEncerrados();
    if (vaiParaNuvem()) sincronizar();
  }

  function pintarEncerrados() {
    const lista = nads.filter(n => S.encerrados.has(n.id));
    const s = statusNuvem(t);
    listaEnc.textContent = '';
    for (const n of lista) {
      const d = doDia(tempos, n.id, dHoje);
      const p = psesHoje.get(n.id);
      listaEnc.append(h('div', { class: 'atleta encerrado' },
        h('div', { class: 'at-info' },
          h('span', { class: 'at-nome', text: n.nome }),
          h('span', { class: 'at-melhor', text: d.reps ? `${repeticoes(d.reps)} · melhor hoje ${fmtTempo(d.melhor)}` : 'Sem repetições' }),
          h('div', { class: 'linha encerrado-acoes' },
            h('button', { class: 'link pse-marcar', type: 'button', 'aria-label': p ? `PSE ${p.valor}: mudar a PSE de ${n.nome}` : `Marcar a PSE de ${n.nome}`, onclick: () => marcarPse(n.id) },
              p ? ['PSE ', chipPse(p.valor)] : 'Marcar PSE'),
            h('button', { class: 'link', type: 'button', 'aria-label': `Reabrir o treino de ${n.nome}`, onclick: () => reabrir(n.id) }, 'Reabrir'))),
        h('span', { class: 'sincronia', 'data-fase': s.fase, title: s.frase }, s.texto)));
    }
    secEnc.hidden = !lista.length;
    btnEncerrarTurma.hidden = !cards.size;
    btnResumo.hidden = cards.size > 0 || !lista.length;
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
      if (painelId === id && painelRelogio) painelRelogio.textContent = c.relogio.textContent;
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
    pintarEncerrados();
    aviso('Tempo apagado.');
  }

  const aoVoltar = () => { if (document.visibilityState === 'visible' && algumRodando()) manterTelaAcesa(); };
  document.addEventListener('visibilitychange', aoVoltar);

  montar();
  listarSessao();
  const pararDeOuvir = aoMudarEstado(() => pintarEncerrados());   // "Enviando…" → "Salvo na nuvem"

  return () => {
    pararDeOuvir();
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    document.removeEventListener('visibilitychange', aoVoltar);
    document.removeEventListener('keydown', teclaPainel);
    if (!algumRodando()) liberarTela();
  };
}
