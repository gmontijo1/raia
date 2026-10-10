// Painel da semana de uma turma: MVP da semana, pódio das maiores evoluções, os números da semana,
// a evolução da turma semana a semana e a semana de cada aluno.
//
// Regras (para explicar à coordenação):
// - Semana = segunda a domingo (a mesma do planejamento).
// - Evolução de um aluno na semana = quanto o melhor tempo dele na semana ficou abaixo do melhor
//   tempo que ele tinha antes da semana, na mesma prova (distância + estilo), em %. Vale a prova em
//   que ele mais melhorou. Primeiro tempo numa prova não conta (não há com o que comparar).
// - MVP = maior evolução da semana (desempate: mais recordes pessoais, depois mais repetições).
//   Se ninguém melhorou, não há MVP naquela semana.
// - Evolução da turma = média de quanto cada aluno está mais rápido que na 1ª semana dele, na prova
//   principal da turma (a mais nadada).

import { h, s, fmtTempo, combo, combos, doCombo, melhorDe, dataCurta, dec1, hoje } from './util.js';
import { semanaDe, datasSemana, somarDias } from './semana.js';
import { fmtPse } from './pse.js';
import { sessoes, comSinal } from './esforco.js';

export const segundaDe = iso => { const d = new Date(`${iso}T12:00:00`); return somarDias(iso, -((d.getDay() + 6) % 7)); };
const naSemana = (iso, inicio) => iso >= inicio && iso < somarDias(inicio, 7);
const pctTxt = v => `${comSinal(v)}%`;

// Prova mais nadada pela turma ([dist, estilo]).
export function provaPrincipal(tempos) {
  const conta = new Map();
  for (const r of tempos) { const k = `${r.dist}|${r.estilo}`; conta.set(k, (conta.get(k) || 0) + 1); }
  let melhor = null;
  for (const [d, e] of combos(tempos)) { const n = conta.get(`${d}|${e}`); if (!melhor || n > melhor.n) melhor = { d, e, n }; }
  return melhor ? [melhor.d, melhor.e] : null;
}

export function resumoSemana({ tempos, nadadores, pses, semanas, turma, inicio }) {
  const porId = new Map(nadadores.map(n => [n.id, n]));
  const daSemana = tempos.filter(r => naSemana(r.data, inicio));
  const porNad = new Map();
  for (const r of daSemana) { if (!porNad.has(r.nadadorId)) porNad.set(r.nadadorId, []); porNad.get(r.nadadorId).push(r); }
  const alunos = [];
  for (const [id, lista] of porNad) {
    const n = porId.get(id);
    if (!n) continue;
    const antes = tempos.filter(r => r.nadadorId === id && r.data < inicio);
    let melhor = null, recordes = 0;
    for (const [d, e] of combos(lista)) {
      const agora = melhorDe(doCombo(lista, d, e)), ant = melhorDe(doCombo(antes, d, e));
      if (ant == null) continue;
      const pct = (ant - agora) / ant * 100;
      if (agora < ant) recordes++;
      if (!melhor || pct > melhor.pct) melhor = { pct, dist: d, estilo: e, antes: ant, agora };
    }
    const pseDoAluno = pses.filter(p => p.nadadorId === id && naSemana(p.data, inicio));
    alunos.push({
      nadador: n, reps: lista.length, dias: new Set(lista.map(r => r.data)).size, recordes, melhor,
      pse: pseDoAluno.length ? pseDoAluno.reduce((a, p) => a + p.valor, 0) / pseDoAluno.length : null
    });
  }
  const evoluiram = alunos.filter(a => a.melhor && a.melhor.pct > 0)
    .sort((a, b) => b.melhor.pct - a.melhor.pct || b.recordes - a.recordes || b.reps - a.reps);
  const ses = sessoes(pses.filter(p => naSemana(p.data, inicio)), [turma], semanas, { turmaId: turma.id });
  const comPlano = ses.filter(x => x.planejado);
  return {
    inicio, semana: semanaDe(semanas, inicio), alunos,
    mvp: evoluiram[0] || null, podio: evoluiram.slice(0, 3),
    dedicacao: alunos.slice().sort((a, b) => b.reps - a.reps || b.dias - a.dias)[0] || null,
    treinos: new Set(daSemana.map(r => r.data)).size, reps: daSemana.length,
    recordes: alunos.reduce((a, x) => a + x.recordes, 0),
    pseMedia: ses.length ? ses.reduce((a, x) => a + x.media, 0) / ses.length : null,
    planejado: comPlano.length ? comPlano.reduce((a, x) => a + x.planejado.alvo, 0) / comPlano.length : null
  };
}

// [{ inicio, valor (% mais rápido que na 1ª semana, média dos alunos), n }]
export function evolucaoSemanal(tempos, [d, e]) {
  const porSemana = new Map();
  for (const r of doCombo(tempos, d, e)) {
    const w = segundaDe(r.data);
    if (!porSemana.has(w)) porSemana.set(w, new Map());
    const m = porSemana.get(w);
    if (!m.has(r.nadadorId) || r.t < m.get(r.nadadorId)) m.set(r.nadadorId, r.t);
  }
  const base = new Map();
  return [...porSemana.keys()].sort().map(w => {
    const vals = [];
    for (const [id, t] of porSemana.get(w)) {
      if (!base.has(id)) base.set(id, t);
      vals.push((base.get(id) - t) / base.get(id) * 100);
    }
    return { inicio: w, valor: vals.reduce((a, b) => a + b, 0) / vals.length, n: vals.length };
  });
}

// MVP da semana atual (para a lista de turmas). null se não houver.
export function mvpDaSemana(tempos, nadadores, inicio = segundaDe(hoje())) {
  return resumoSemana({ tempos, nadadores, pses: [], semanas: [], turma: { id: null }, inicio }).mvp;
}

/* ---------------------------------------------------------------- o painel */
export function painelDaTurma({ turma, tempos, nadadores, pses, semanas }) {
  const semanasComDado = [...new Set([...tempos, ...pses].map(r => segundaDe(r.data)))].sort();
  const estaSemana = segundaDe(hoje());
  const primeira = semanasComDado[0] || estaSemana;
  const prova = provaPrincipal(tempos);
  const evolucao = prova ? evolucaoSemanal(tempos, prova) : [];
  let inicio = estaSemana;
  // começa na semana atual; se ela ainda não tem treino, mostra a última que tem
  if (!semanasComDado.includes(estaSemana) && semanasComDado.length) inicio = semanasComDado[semanasComDado.length - 1];
  const el = h('section', { class: 'painel-semana', 'aria-label': 'Resumo da semana da turma' });
  let ro = null, quadro = 0;

  function ir(novo) { inicio = novo; pintar(); el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }

  function pintar() {
    const r = resumoSemana({ tempos, nadadores, pses, semanas, turma, inicio });
    const total = nadadores.filter(n => !n.arquivado).length;
    el.textContent = '';

    /* navegação entre semanas */
    const ant = h('button', { class: 'btn pequeno semana-seta', type: 'button', 'aria-label': 'Semana anterior', disabled: inicio <= primeira || undefined, onclick: () => ir(somarDias(inicio, -7)) }, '‹');
    const prox = h('button', { class: 'btn pequeno semana-seta', type: 'button', 'aria-label': 'Próxima semana', disabled: inicio >= estaSemana || undefined, onclick: () => ir(somarDias(inicio, 7)) }, '›');
    el.append(h('div', { class: 'card semana-nav' }, ant,
      h('div', { class: 'semana-nav-titulo' },
        h('span', { class: 'lbl', text: [r.semana ? `Semana ${r.semana.numero}` : 'Semana', r.semana?.periodo, inicio === estaSemana ? 'esta semana' : null].filter(Boolean).join(' · ') }),
        h('b', { text: datasSemana({ inicio }) })),
      prox));

    if (!r.reps) {
      el.append(h('div', { class: 'card vazio' }, h('h3', { text: 'Nenhum tempo nesta semana' }),
        h('p', { text: inicio === estaSemana ? 'O resumo aparece assim que a turma tiver tempos marcados nesta semana.' : 'A turma não teve tempos cronometrados nesta semana.' })));
    } else {
      /* MVP */
      if (r.mvp) {
        const m = r.mvp;
        el.append(h('div', { class: 'card mvp' },
          h('div', { class: 'mvp-medalha', 'aria-hidden': 'true' }, h('span', { text: 'MVP' })),
          h('div', { class: 'mvp-texto' },
            h('span', { class: 'lbl', text: 'MVP da semana' }),
            h('a', { class: 'mvp-nome', href: `#/nadador/${m.nadador.id}`, text: m.nadador.nome }),
            h('span', { class: 'sub', text: `${dec1(m.melhor.pct)}% mais rápido nos ${combo(m.melhor.dist, m.melhor.estilo)}: ${fmtTempo(m.melhor.antes)} → ${fmtTempo(m.melhor.agora)}` }),
            h('div', { class: 'linha', style: 'margin-top:4px' },
              h('span', { class: 'chip recorde', text: `${m.recordes} ${m.recordes === 1 ? 'recorde pessoal' : 'recordes pessoais'}` }),
              h('span', { class: 'chip neutro', text: `${m.reps} ${m.reps === 1 ? 'repetição' : 'repetições'}` }),
              h('span', { class: 'chip neutro', text: `${m.dias} ${m.dias === 1 ? 'treino' : 'treinos'}` })))));
      } else {
        el.append(h('div', { class: 'card mvp sem-mvp' },
          h('div', { class: 'mvp-medalha', 'aria-hidden': 'true' }, h('span', { text: 'MVP' })),
          h('div', { class: 'mvp-texto' }, h('span', { class: 'lbl', text: 'MVP da semana' }),
            h('b', { class: 'mvp-nome', text: 'Ninguém bateu o próprio recorde' }),
            h('span', { class: 'sub', text: 'O MVP é quem mais melhora o próprio melhor tempo na semana.' }))));
      }

      /* números da semana */
      el.append(h('div', { class: 'blocos' },
        bloco('Alunos que nadaram', `${r.alunos.length}${total ? ` de ${total}` : ''}`, `${r.treinos} ${r.treinos === 1 ? 'treino' : 'treinos'} com tempo`),
        bloco('Repetições', String(r.reps), 'cronometradas na semana'),
        bloco('Recordes pessoais', String(r.recordes), r.recordes ? 'batidos na semana' : 'nenhum nesta semana', r.recordes ? 'bom' : null),
        bloco('PSE média', fmtPse(r.pseMedia), r.pseMedia == null ? 'sem respostas' : r.planejado != null ? `planejado ${fmtPse(r.planejado)}` : 'sem planejado')));

      /* pódio e dedicação */
      if (r.podio.length) {
        const ordem = [r.podio[1], r.podio[0], r.podio[2]];
        el.append(h('div', { class: 'card' },
          h('h3', { text: 'Maiores evoluções' }),
          h('div', { class: 'podio' }, ordem.map((a, i) => {
            const lugar = [2, 1, 3][i];
            if (!a) return h('div', { class: `podio-lugar p${lugar} vazio` });
            return h('div', { class: `podio-lugar p${lugar}` },
              h('a', { class: 'podio-nome', href: `#/nadador/${a.nadador.id}`, text: a.nadador.nome }),
              h('span', { class: 'podio-v', text: pctTxt(a.melhor.pct) }),
              h('span', { class: 'podio-prova', text: combo(a.melhor.dist, a.melhor.estilo) }),
              h('div', { class: 'podio-degrau' }, h('span', { class: 'podio-medalha', text: `${lugar}º` })));
          })),
          r.dedicacao ? h('p', { class: 'sub', style: 'margin-top:12px' }, h('b', { text: 'Mais dedicação: ' }),
            `${r.dedicacao.nadador.nome}, ${r.dedicacao.reps} ${r.dedicacao.reps === 1 ? 'repetição' : 'repetições'} em ${r.dedicacao.dias} ${r.dedicacao.dias === 1 ? 'treino' : 'treinos'}.`) : null));
      }
    }

    /* evolução da turma semana a semana */
    if (evolucao.length > 1) {
      const host = h('div', { class: 'grafico grafico-evolucao-turma' });
      const balao = h('div', { class: 'balao', hidden: true });
      host.append(balao);
      el.append(h('div', { class: 'card' },
        h('div', { class: 'card-head' }, h('h3', { text: 'Evolução da turma' }), h('span', { class: 'sub', text: combo(prova[0], prova[1]) })),
        host,
        h('p', { class: 'dica-eixo', text: 'Quanto, em média, cada aluno está mais rápido que na 1ª semana dele (melhor tempo da semana). Linha subindo: a turma está evoluindo. Toque numa semana para ver o resumo dela.' }),
        h('details', null, h('summary', { text: 'Ver os números de cada semana' }),
          h('div', { class: 'tabela' }, h('table', null,
            h('thead', null, h('tr', null, h('th', { text: 'Semana' }), h('th', { class: 'n', text: 'Mais rápida que no início' }), h('th', { class: 'n', text: 'Alunos' }))),
            h('tbody', null, evolucao.slice().reverse().map(x => h('tr', null,
              h('td', { text: datasSemana({ inicio: x.inicio }) }), h('td', { class: 'n', text: pctTxt(x.valor) }), h('td', { class: 'n', text: String(x.n) })))))))));
      const desenhar = () => desenharEvolucao(host, balao, evolucao, inicio, ir);
      desenhar();
      if (ro) ro.disconnect();
      if ('ResizeObserver' in window) {
        let largura = host.clientWidth;
        ro = new ResizeObserver(() => {
          cancelAnimationFrame(quadro);
          quadro = requestAnimationFrame(() => { if (Math.abs(host.clientWidth - largura) > 4) { largura = host.clientWidth; desenhar(); } });
        });
        ro.observe(host);
      }
    }

    /* a semana de cada aluno */
    if (r.alunos.length) {
      const ord = r.alunos.slice().sort((a, b) => (b.melhor?.pct ?? -Infinity) - (a.melhor?.pct ?? -Infinity) || b.reps - a.reps);
      el.append(h('details', { class: 'card' }, h('summary', { text: `A semana de cada aluno (${r.alunos.length})` }),
        h('div', { class: 'tabela' }, h('table', null,
          h('thead', null, h('tr', null, ['Aluno', 'Treinos', 'Reps', 'Evolução', 'Recordes', 'PSE'].map((c, i) => h('th', { class: i ? 'n' : null, text: c })))),
          h('tbody', null, ord.map(a => h('tr', null,
            h('td', null, h('a', { href: `#/nadador/${a.nadador.id}`, text: a.nadador.nome })),
            h('td', { class: 'n', text: String(a.dias) }),
            h('td', { class: 'n', text: String(a.reps) }),
            h('td', { class: 'n' + (a.melhor && a.melhor.pct > 0 ? ' bom' : ''), text: a.melhor ? pctTxt(a.melhor.pct) : '–', title: a.melhor ? combo(a.melhor.dist, a.melhor.estilo) : 'primeiro tempo nas provas da semana' }),
            h('td', { class: 'n', text: String(a.recordes) }),
            h('td', { class: 'n', text: fmtPse(a.pse) }))))))));
    }
  }

  pintar();
  return { el, limpar: () => { if (ro) ro.disconnect(); cancelAnimationFrame(quadro); } };
}

const bloco = (rotulo, valor, detalhe, classe) => h('div', { class: 'bloco' },
  h('span', { class: 'lbl', text: rotulo }), h('span', { class: 'v' + (classe ? ` ${classe}` : ''), text: valor }), h('span', { class: 'd', text: detalhe }));

function desenharEvolucao(host, balao, lista, escolhida, aoEscolher) {
  host.querySelector('svg')?.remove();
  balao.hidden = true;
  const W = Math.max(280, host.clientWidth || 340), H = 190;
  const m = { l: 40, r: 10, t: 14, b: 28 };
  const pw = W - m.l - m.r, ph = H - m.t - m.b;
  const vals = lista.map(x => x.valor);
  const passoY = Math.max(1, Math.ceil((Math.max(1, ...vals) - Math.min(0, ...vals)) / 4));
  const yMin = Math.floor(Math.min(0, ...vals) / passoY) * passoY;
  const yMax = Math.ceil(Math.max(1, ...vals) / passoY) * passoY;
  const n = lista.length, banda = pw / n;
  const x = i => m.l + banda * (i + 0.5);
  const y = v => m.t + ph - ((v - yMin) / (yMax - yMin || 1)) * ph;
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', 'aria-label': `Evolução da turma em ${n} semanas. Os números estão na tabela abaixo.` });
  for (let v = yMin; v <= yMax + 1e-9; v += passoY) {
    svg.append(s('line', { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v), class: v === 0 ? 'g-base' : 'g-grade' }));
    const t = s('text', { x: m.l - 6, y: y(v) + 4, class: 'g-rotulo', 'text-anchor': 'end' });
    t.textContent = `${v > 0 ? '+' : ''}${v}%`;
    svg.append(t);
  }
  const pts = lista.map((p, i) => `${x(i)},${y(p.valor)}`);
  svg.append(s('path', { d: `M${x(0)},${y(0)} L${pts.join(' L')} L${x(n - 1)},${y(0)} Z`, class: 'g-evo-area' }));
  svg.append(s('polyline', { points: pts.join(' '), class: 'g-evo-linha' }));
  const passoX = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(pw / 46))));
  lista.forEach((p, i) => {
    const sel = p.inicio === escolhida;
    if (sel) svg.append(s('circle', { cx: x(i), cy: y(p.valor), r: 9, class: 'g-evo-anel' }));
    svg.append(s('circle', { cx: x(i), cy: y(p.valor), r: sel ? 5.5 : 4, class: 'g-evo-ponto' }));
    if (i % passoX === 0 || i === n - 1 || sel) {
      const t = s('text', { x: x(i), y: H - 8, class: 'g-rotulo' + (sel ? ' g-forte' : ''), 'text-anchor': 'middle' });
      t.textContent = dataCurta(p.inicio).replace(' ', '/');
      svg.append(t);
    }
    const alvo = s('rect', { x: m.l + banda * i, y: m.t, width: banda, height: ph, class: 'g-alvo', tabindex: '0', role: 'button', 'aria-label': `Semana de ${datasSemana({ inicio: p.inicio })}: ${pctTxt(p.valor)}, ${p.n} alunos` });
    const mostrar = () => {
      balao.textContent = '';
      balao.append(h('b', { text: pctTxt(p.valor) }), h('span', { text: `semana de ${datasSemana({ inicio: p.inicio })}` }), h('span', { text: `${p.n} ${p.n === 1 ? 'aluno' : 'alunos'} com tempo` }));
      balao.hidden = false;
      const bw = balao.offsetWidth;
      balao.style.left = `${Math.min(Math.max(0, x(i) - bw / 2), W - bw)}px`;
      balao.style.top = `${Math.max(0, y(p.valor) - balao.offsetHeight - 12)}px`;
    };
    alvo.addEventListener('pointerenter', mostrar);
    alvo.addEventListener('pointerleave', () => { balao.hidden = true; });
    alvo.addEventListener('focus', mostrar);
    alvo.addEventListener('blur', () => { balao.hidden = true; });
    alvo.addEventListener('click', () => aoEscolher(p.inicio));
    alvo.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); aoEscolher(p.inicio); } });
    svg.append(alvo);
  });
  host.prepend(svg);
}
