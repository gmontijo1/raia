// Planejamento do semestre (o mesmo para todas as turmas):
// - a raia: um nadador que avança conforme as semanas passam, e a barra das semanas;
// - o gráfico do semestre: volume por treino em cada semana, colorido pelo período;
// - a semana escolhida, com os treinos (Dia 1, 2, 3) e o editor;
// - o índice das semanas e a escala de professores.

import { h, s, aviso, hoje, pad, dataCurta, DIAS, botaoConfirmar } from '../util.js';
import * as db from '../db.js';
import { horaCurta } from '../agenda.js';
import {
  VOLUME_MAX, PERIODOS, semanaDe, progresso, tipoPeriodo, datasSemana, fimDaSemana, somarDias, fmtMetros, pct,
  volumeMetros, cargaMetros, mediaTreinos, extrasDe, temVcrit, temAvaliacao, blocoTreino
} from '../semana.js';

const ORDEM_DIAS = [1, 2, 3, 4, 5, 6, 0];   // segunda primeiro
const segundaDe = iso => { const d = new Date(`${iso}T12:00:00`); return somarDias(iso, -((d.getDay() + 6) % 7)); };

export async function render(caixa, numeroPedido) {
  const [todas, escala] = await Promise.all([db.listarSemanas(), db.listarEscala()]);
  const dHoje = hoje();
  const atualGeral = semanaDe(todas, dHoje);
  const semestre = (atualGeral || todas[todas.length - 1] || {}).semestre;
  const semanas = todas.filter(x => x.semestre === semestre);
  const atual = semanaDe(semanas, dHoje);
  const limpezas = [];

  caixa.append(h('div', { class: 'cabeca' },
    h('div', null,
      h('span', { class: 'lbl', text: semanas.length ? `Semestre ${semestre} · ${dataCurta(semanas[0].inicio)} a ${dataCurta(fimDaSemana(semanas[semanas.length - 1]))}` : 'Semestre' }),
      h('h2', { text: 'Planejamento' }))));

  if (!semanas.length) {
    caixa.append(h('div', { class: 'card vazio' },
      h('h3', { text: 'Nenhuma semana planejada' }),
      h('p', { text: 'Monte o semestre semana a semana: período, conteúdo, volume, intensidade e os treinos de cada dia. Vale para todas as turmas.' }),
      h('button', { class: 'btn primario', type: 'button', onclick: () => editarSemana(novaSemana(null)) }, 'Planejar a primeira semana')));
    caixa.append(cartaoEscala(escala, dHoje));
    return;
  }

  let sel = semanas.find(x => String(x.numero) === String(numeroPedido)) || atual
    || (dHoje < semanas[0].inicio ? semanas[0] : semanas[semanas.length - 1]);

  /* ---------- a raia ---------- */
  const p = progresso(semanas, dHoje);
  const raia = cartaoRaia(semanas, p, dHoje, x => escolher(x, { rolar: true }));
  caixa.append(raia.el);

  /* ---------- o gráfico do semestre ---------- */
  const host = h('div', { class: 'grafico grafico-semestre' });
  const balao = h('div', { class: 'balao', hidden: true });
  host.append(balao);
  caixa.append(h('div', { class: 'card' },
    h('div', { class: 'card-head' }, h('h3', { text: 'O semestre' }), h('span', { class: 'sub', text: 'volume por treino' })),
    legenda(semanas),
    host,
    h('p', { class: 'dica-eixo', text: `Metros por treino (100% = ${fmtMetros(VOLUME_MAX)}). Toque numa semana para ver os treinos.` })));
  const desenhar = () => desenharGrafico(host, balao, semanas, { atual, sel, aoEscolher: x => escolher(x, { rolar: true }) });
  desenhar();
  if ('ResizeObserver' in window) {
    let largura = host.clientWidth, quadro = 0;
    // redesenha no próximo quadro (redesenhar dentro do aviso de tamanho gera um alerta do navegador)
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(quadro);
      quadro = requestAnimationFrame(() => { if (Math.abs(host.clientWidth - largura) > 4) { largura = host.clientWidth; desenhar(); } });
    });
    ro.observe(host);
    limpezas.push(() => { ro.disconnect(); cancelAnimationFrame(quadro); });
  }

  /* ---------- a semana escolhida ---------- */
  const detalhe = h('section', { class: 'card semana-detalhe', tabindex: '-1', 'aria-live': 'polite' });
  caixa.append(detalhe);

  /* ---------- índice ---------- */
  const listaIndice = h('ul', { class: 'lista indice' });
  caixa.append(h('section', { class: 'card', id: 'indice', tabindex: '-1' },
    h('div', { class: 'card-head' }, h('h3', { text: 'Índice das semanas' }),
      h('button', { class: 'btn pequeno', type: 'button', onclick: () => editarSemana(novaSemana(semanas[semanas.length - 1])) }, 'Adicionar semana')),
    listaIndice));
  raia.aoIndice(() => { const el = document.getElementById('indice'); el.scrollIntoView({ behavior: 'smooth', block: 'start' }); el.focus({ preventScroll: true }); });

  caixa.append(cartaoEscala(escala, dHoje));

  function pintarDetalhe() {
    const x = sel;
    const tipo = tipoPeriodo(x.periodo);
    const vol = volumeMetros(x), media = mediaTreinos(x);
    detalhe.textContent = '';
    detalhe.append(
      h('div', { class: 'card-head' },
        h('span', { class: 'lbl', text: `Semana ${x.numero} · ${datasSemana(x)}` }),
        x === atual ? h('span', { class: 'etiqueta', text: 'esta semana' }) : null),
      h('h3', { class: 'semana-periodo' }, h('span', { class: 'cor-periodo', style: `background:${tipo.cor}`, 'aria-hidden': 'true' }), x.periodo || 'Sem período definido'),
      h('div', { class: 'linha', style: 'margin-top:8px' },
        String(x.conteudo || '').split(/,| e /i).map(c => c.trim()).filter(Boolean).map(c => h('span', { class: 'etiqueta', text: c })),
        extrasDe(x).map(e => h('span', { class: 'chip recorde', text: /vcrit/i.test(e) ? 'Teste de Vcrit' : e }))),
      h('div', { class: 'blocos', style: 'margin-top:12px' },
        h('div', { class: 'bloco' }, h('span', { class: 'lbl', text: 'Volume' }), h('span', { class: 'v', text: vol != null ? fmtMetros(vol) : '–' }), h('span', { class: 'd', text: x.volume != null ? `${pct(x.volume)} de ${fmtMetros(VOLUME_MAX)}` : 'não definido' })),
        h('div', { class: 'bloco' }, h('span', { class: 'lbl', text: 'Intensidade' }), h('span', { class: 'v', text: x.intensidade != null ? pct(x.intensidade) : '–' }), h('span', { class: 'd', text: 'do máximo' })),
        h('div', { class: 'bloco' }, h('span', { class: 'lbl', text: 'Treinos' }), h('span', { class: 'v', text: String((x.treinos || []).length) }), h('span', { class: 'd', text: media ? `média ${fmtMetros(media)}` : 'ainda não escritos' }))),
      (x.treinos || []).length
        ? h('div', { class: 'treinos-semana' }, x.treinos.map(t => blocoTreino(t, `Dia ${t.dia}`)))
        : h('p', { class: 'sub', style: 'margin-top:12px', text: 'Os treinos desta semana ainda não foram escritos.' }),
      temVcrit(x) ? h('p', { class: 'dica', style: 'margin-top:12px' }, h('b', { text: 'Teste de Vcrit: ' }), 'cronometre 400 m e 200 m crawl no máximo (distâncias 400 m e 200 m no treino). A Vcrit de cada aluno aparece na evolução dele.') : null,
      h('div', { class: 'acoes', style: 'margin-top:14px' },
        h('button', { class: 'btn', type: 'button', onclick: () => editarSemana(x) }, 'Editar semana')));
  }

  function pintarIndice() {
    listaIndice.textContent = '';
    for (const x of semanas) {
      const tipo = tipoPeriodo(x.periodo);
      const vol = volumeMetros(x);
      const marcas = [temVcrit(x) ? 'Vcrit' : null, temAvaliacao(x) ? 'avaliação física' : null].filter(Boolean);
      listaIndice.append(h('li', null,
        h('button', { class: 'item item-semana' + (x === sel ? ' escolhida' : ''), type: 'button', 'aria-current': x === sel ? 'true' : null, onclick: () => escolher(x, { rolar: true }) },
          h('b', null, h('span', { class: 'cor-periodo', style: `background:${tipo.cor}`, 'aria-hidden': 'true' }), `S${x.numero} · ${datasSemana(x)}`, x === atual ? h('span', { class: 'etiqueta', text: 'agora' }) : null),
          h('span', { class: 'sub', text: [x.periodo, x.conteudo, x.intensidade != null ? `intensidade ${pct(x.intensidade)}` : null, ...marcas].filter(Boolean).join(' · ') }),
          h('span', { class: 'lado', text: vol != null ? fmtMetros(vol) : '–' }))));
    }
  }

  function escolher(x, { rolar } = {}) {
    sel = x;
    history.replaceState(null, '', `#/planejamento/${x.numero}`);
    pintarDetalhe();
    pintarIndice();
    desenhar();
    if (rolar) { detalhe.scrollIntoView({ behavior: 'smooth', block: 'start' }); detalhe.focus({ preventScroll: true }); }
  }

  pintarDetalhe();
  pintarIndice();
  return () => limpezas.forEach(f => f());
}

/* ---------------------------------------------------------------- a raia */
function cartaoRaia(semanas, p, dHoje, aoEscolher) {
  const n = semanas.length;
  const numero = p.indice >= 0 && p.indice < n ? p.indice + 1 : null;
  const nadador = h('div', { class: 'nadador', 'aria-hidden': 'true' });
  nadador.innerHTML = SVG_NADADOR;
  const texto = p.indice < 0 ? `O semestre começa em ${dataCurta(semanas[0].inicio)}.`
    : p.indice >= n ? 'Semestre concluído.'
      : `Semana ${numero} de ${n}: ${pct(p.fracaoSemestre)} do semestre.`;
  const agua = h('div', { class: 'raia-agua', role: 'img', 'aria-label': texto }, h('span', { class: 'raia-linha', 'aria-hidden': 'true' }), nadador);
  // O nadador sai da borda e nada até onde o semestre está.
  nadador.style.setProperty('--pos', '0');
  requestAnimationFrame(() => requestAnimationFrame(() => nadador.style.setProperty('--pos', String(p.fracaoSemestre))));

  const barra = h('div', { class: 'semanas-barra', style: `grid-template-columns:repeat(${n}, minmax(0, 1fr))` },
    semanas.map((x, i) => {
      const estado = i < p.indice ? 'feita' : i === p.indice ? 'atual' : 'futura';
      return h('button', {
        class: `seg-semana ${estado}`, type: 'button', title: `Semana ${x.numero} · ${datasSemana(x)}`,
        'aria-label': `Semana ${x.numero}, ${datasSemana(x)}${estado === 'atual' ? ' (esta semana)' : ''}`,
        style: estado === 'atual' ? `--feito:${Math.round(p.fracaoSemana * 100)}%` : null,
        onclick: () => aoEscolher(x)
      });
    }));
  const botaoIndice = h('button', { class: 'btn pequeno', type: 'button' }, 'Índice');
  const el = h('section', { class: 'card raia-semestre', 'aria-label': 'Andamento do semestre' },
    agua, barra,
    h('div', { class: 'raia-rodape' },
      h('span', { class: 'raia-contador' },
        numero ? [h('b', { class: 'mono', text: `${pad(numero)}/${pad(n)}` }), ' semana'] : h('span', { class: 'sub', text: texto })),
      botaoIndice));
  return { el, aoIndice: fn => botaoIndice.addEventListener('click', fn) };
}

// Nadador de crawl visto de lado, metade dentro d'água. Os braços giram, as pernas batem.
const SVG_NADADOR = `<svg viewBox="0 0 72 36" width="72" height="36" focusable="false">
  <g class="nad-corpo">
    <path class="nad-perna p1" d="M20 19 L6 17"/>
    <path class="nad-perna p2" d="M20 19 L6 21"/>
    <path class="nad-tronco" d="M20 19 L44 18"/>
    <g class="nad-braco b1"><path d="M42 17 L42 4"/></g>
    <g class="nad-braco b2"><path d="M42 17 L42 4"/></g>
    <circle class="nad-cabeca" cx="51" cy="16" r="6"/>
  </g>
  <path class="nad-agua" d="M-72 21 q9 -4 18 0 t18 0 t18 0 t18 0 t18 0 t18 0 t18 0 t18 0 V36 H-72 Z"/>
  <path class="nad-esteira" d="M2 18 q-4 2 -1 5 M8 24 q-3 1 -6 0"/>
</svg>`;

/* ---------------------------------------------------------------- o gráfico */
function legenda(semanas) {
  const presentes = PERIODOS.filter(x => semanas.some(sem => tipoPeriodo(sem.periodo).chave === x.chave));
  return h('div', { class: 'legenda' },
    presentes.map(x => h('span', { class: 'leg-item' }, h('span', { class: 'leg-cor', style: `background:${x.cor}` }), x.nome)),
    h('span', { class: 'leg-item' }, h('span', { class: 'leg-barra' }), 'volume'),
    h('span', { class: 'leg-item' }, h('span', { class: 'leg-barra cheia' }), 'carga (volume × intensidade)'),
    h('span', { class: 'leg-item' }, h('span', { class: 'leg-traco' }), 'média dos treinos escritos'),
    h('span', { class: 'leg-item' }, h('span', { class: 'leg-ponto' }), 'teste de Vcrit'),
    h('span', { class: 'leg-item' }, h('span', { class: 'leg-losango' }), 'avaliação física'));
}

function desenharGrafico(host, balao, semanas, { atual, sel, aoEscolher }) {
  host.querySelector('svg')?.remove();
  const W = Math.max(280, host.clientWidth || 340), H = 210;
  const m = { l: 42, r: 6, t: 12, b: 40 };
  const pw = W - m.l - m.r, ph = H - m.t - m.b;
  const n = semanas.length, banda = pw / n, larg = Math.max(4, Math.min(26, banda - 4));
  const y = v => m.t + ph - (Math.min(v, VOLUME_MAX) / VOLUME_MAX) * ph;
  const y0 = y(0);
  const barra = (x, w, yTop, raio) => {
    const alt = y0 - yTop;
    if (alt <= 0.5) return null;
    const r = Math.min(raio, w / 2, alt);
    return `M${x},${y0} V${yTop + r} Q${x},${yTop} ${x + r},${yTop} H${x + w - r} Q${x + w},${yTop} ${x + w},${yTop + r} V${y0} Z`;
  };
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', 'aria-label': `Volume por treino em cada uma das ${n} semanas do semestre. A lista das semanas, com os números, está no índice abaixo.` });

  for (const v of [0, 1500, 3000, 4500]) {
    svg.append(s('line', { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v), class: v ? 'g-grade' : 'g-base' }));
    const t = s('text', { x: m.l - 6, y: y(v) + 4, class: 'g-rotulo', 'text-anchor': 'end' });
    t.textContent = v.toLocaleString('pt-BR');
    svg.append(t);
  }

  semanas.forEach((x, i) => {
    const xb = m.l + banda * i, cx = xb + banda / 2, x0 = cx - larg / 2;
    const cor = tipoPeriodo(x.periodo).cor;
    if (i > 0 && tipoPeriodo(semanas[i - 1].periodo).chave !== tipoPeriodo(x.periodo).chave) {
      svg.append(s('line', { x1: xb, x2: xb, y1: m.t, y2: y0, class: 'g-divisa' }));
    }
    if (x === sel && x !== atual) svg.append(s('rect', { x: xb + 1, y: m.t, width: banda - 2, height: ph, rx: 4, class: 'g-escolhida' }));
    const vol = volumeMetros(x), carga = cargaMetros(x), media = mediaTreinos(x);
    if (vol != null) { const d = barra(x0, larg, y(vol), 4); if (d) svg.append(s('path', { d, fill: cor, 'fill-opacity': '0.32' })); }
    if (carga != null) { const d = barra(x0, larg, y(carga), 4); if (d) svg.append(s('path', { d, fill: cor })); }
    if (media != null) svg.append(s('line', { x1: x0 - 3, x2: x0 + larg + 3, y1: y(media), y2: y(media), class: 'g-media' }));
    if (x === atual && vol != null) svg.append(s('rect', { x: x0 - 3, y: Math.min(y(vol), media != null ? y(media) : y0) - 4, width: larg + 6, height: y0 - Math.min(y(vol), media != null ? y(media) : y0) + 7, rx: 6, class: 'g-atual' }));
    // marcas embaixo: ● teste de Vcrit, ◆ avaliação física
    let ym = y0 + 8;
    if (temVcrit(x)) { svg.append(s('circle', { cx, cy: ym, r: 3, class: 'g-vcrit' })); ym += 8; }
    if (temAvaliacao(x)) svg.append(s('path', { d: `M${cx},${ym - 3.5} L${cx + 3.5},${ym} L${cx},${ym + 3.5} L${cx - 3.5},${ym} Z`, class: 'g-aval' }));
    if (i === 0 || i === n - 1 || (i % 4 === 0 && n - 1 - i >= 2) || x === atual) {
      const t = s('text', { x: cx, y: H - 6, class: 'g-rotulo' + (x === atual ? ' g-forte' : ''), 'text-anchor': 'middle' });
      t.textContent = `S${x.numero}`;
      svg.append(t);
    }
    // área de toque: a coluna inteira
    const alvo = s('rect', { x: xb, y: m.t, width: banda, height: H - m.t, class: 'g-alvo', tabindex: '0', role: 'button', 'aria-label': `Semana ${x.numero}, ${datasSemana(x)}, ${x.periodo || 'sem período'}${vol != null ? `, ${fmtMetros(vol)} por treino` : ''}` });
    const mostrar = () => {
      balao.textContent = '';
      balao.append(h('b', { text: `S${x.numero} · ${datasSemana(x)}` }),
        h('span', { text: x.periodo || 'Sem período' }),
        vol != null ? h('span', { text: `Volume ${fmtMetros(vol)} (${pct(x.volume)})` }) : null,
        x.intensidade != null ? h('span', { text: `Intensidade ${pct(x.intensidade)}` }) : null,
        media != null ? h('span', { text: `Treinos: média ${fmtMetros(media)}` }) : null,
        extrasDe(x).length ? h('span', { text: extrasDe(x).join(' · ') }) : null);
      balao.hidden = false;
      const bw = balao.offsetWidth;
      balao.style.left = `${Math.min(Math.max(0, cx - bw / 2), W - bw)}px`;
      balao.style.top = `${Math.max(0, (vol != null ? y(vol) : y0) - balao.offsetHeight - 10)}px`;
    };
    const esconder = () => { balao.hidden = true; };
    alvo.addEventListener('pointerenter', mostrar);
    alvo.addEventListener('pointerleave', esconder);
    alvo.addEventListener('focus', mostrar);
    alvo.addEventListener('blur', esconder);
    alvo.addEventListener('click', () => { aoEscolher(x); });
    alvo.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); aoEscolher(x); } });
    svg.append(alvo);
  });
  host.prepend(svg);
}

/* ---------------------------------------------------------------- editor da semana */
function novaSemana(ultima) {
  if (!ultima) {
    const seg = segundaDe(hoje());
    const ano = seg.slice(0, 4), mes = +seg.slice(5, 7);
    return { semestre: `${ano}/${mes <= 6 ? 1 : 2}`, numero: 1, inicio: seg, periodo: '', conteudo: '', volume: null, intensidade: null, extras: '', treinos: [], nova: true };
  }
  return {
    semestre: ultima.semestre, numero: ultima.numero + 1, inicio: somarDias(ultima.inicio, 7),
    periodo: ultima.periodo, conteudo: '', volume: ultima.volume, intensidade: ultima.intensidade, extras: '', treinos: [], nova: true
  };
}

function editarSemana(x) {
  const campo = (id, rotulo, el, cheio) => h('label', { class: 'campo' + (cheio ? ' cheio' : ''), for: id }, h('span', { class: 'lbl', text: rotulo }), el);
  const inp = (id, valor, extra = {}) => { const el = h('input', { id, type: 'text', autocomplete: 'off', ...extra }); el.value = valor ?? ''; return el; };
  const area = (id, valor) => { const el = h('textarea', { id, rows: 3 }); el.value = valor ?? ''; return el; };
  const inicio = inp('sem-inicio', x.inicio, { type: 'date', required: true });
  const periodo = inp('sem-periodo', x.periodo, { list: 'sem-periodos', maxlength: 80 });
  const conteudo = inp('sem-conteudo', x.conteudo, { maxlength: 200, placeholder: 'Ex.: A3, AN2 e técnica' });
  const volume = inp('sem-volume', x.volume != null ? Math.round(x.volume * 100) : '', { type: 'number', min: 0, max: 200, step: 5, inputmode: 'numeric' });
  const intens = inp('sem-intens', x.intensidade != null ? Math.round(x.intensidade * 100) : '', { type: 'number', min: 0, max: 100, step: 5, inputmode: 'numeric' });
  const extras = inp('sem-extras', x.extras, { maxlength: 200, placeholder: 'Ex.: Vcrit; Avaliação física' });
  const erro = h('p', { class: 'erro-campo', role: 'alert' });

  const dias = [1, 2, 3].map(n => {
    const t = (x.treinos || []).find(z => z.dia === n) || {};
    const c = {
      aquecimento: inp(`d${n}-aq`, t.aquecimento), aquecimentoObs: inp(`d${n}-aqo`, t.aquecimentoObs),
      principal: area(`d${n}-pp`, t.principal), principalObs: area(`d${n}-ppo`, t.principalObs),
      soltura: inp(`d${n}-so`, t.soltura), solturaObs: inp(`d${n}-soo`, t.solturaObs),
      total: inp(`d${n}-tot`, t.total, { type: 'number', min: 0, max: 20000, step: 50, inputmode: 'numeric' })
    };
    const grupo = h('details', { class: 'editor-dia', open: n === 1 || undefined },
      h('summary', { text: `Dia ${n}${t.total ? ` · ${fmtMetros(t.total)}` : ''}` }),
      h('div', { class: 'form' },
        campo(`d${n}-aq`, 'Aquecimento', c.aquecimento), campo(`d${n}-aqo`, 'Como', c.aquecimentoObs),
        campo(`d${n}-pp`, 'Parte principal', c.principal, true), campo(`d${n}-ppo`, 'Como (observações)', c.principalObs, true),
        campo(`d${n}-so`, 'Soltura', c.soltura), campo(`d${n}-soo`, 'Como', c.solturaObs),
        campo(`d${n}-tot`, 'Total (m)', c.total)));
    return { n, c, grupo };
  });

  const dlg = h('dialog', { class: 'editor-semana', 'aria-labelledby': 'sem-titulo' });
  const fechar = () => { dlg.close(); dlg.remove(); };
  const form = h('form', { class: 'form' },
    campo('sem-inicio', 'Começa na segunda', inicio),
    campo('sem-periodo', 'Período', periodo),
    campo('sem-conteudo', 'Conteúdo', conteudo, true),
    campo('sem-volume', `Volume (% de ${fmtMetros(VOLUME_MAX)})`, volume),
    campo('sem-intens', 'Intensidade (%)', intens),
    campo('sem-extras', 'Extras', extras, true),
    h('datalist', { id: 'sem-periodos' }, PERIODOS.map(z => h('option', { value: z.nome }))),
    h('div', { class: 'cheio editor-dias' }, dias.map(d => d.grupo)),
    h('div', { class: 'cheio' }, erro),
    h('div', { class: 'acoes cheio' },
      h('button', { class: 'btn primario', type: 'submit' }, 'Salvar semana'),
      h('button', { class: 'btn fantasma', type: 'button', onclick: fechar }, 'Cancelar'),
      x.nova ? null : botaoConfirmar('Apagar semana', 'Toque de novo para apagar', async () => {
        await db.salvarSemana({ ...limpo(x), apagado: true });
        aviso(`Semana ${x.numero} apagada.`);
        fechar();
        location.hash = '#/planejamento';
      })));

  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (!inicio.value) { erro.textContent = 'Escolha a data de início.'; inicio.focus(); return; }
    const num = v => (v.value.trim() === '' ? null : Number(v.value) / 100);
    const treinos = dias.map(({ n, c }) => {
      const t = { dia: n };
      for (const [k, el] of Object.entries(c)) t[k] = k === 'total' ? (el.value ? Number(el.value) : null) : el.value.trim();
      return t;
    }).filter(t => t.aquecimento || t.principal || t.soltura || t.total);
    const salva = await db.salvarSemana({
      ...limpo(x), inicio: segundaDe(inicio.value), periodo: periodo.value.trim(), conteudo: conteudo.value.trim(),
      volume: num(volume), intensidade: num(intens), extras: extras.value.trim(), treinos
    });
    aviso(`Semana ${salva.numero} salva.`);
    fechar();
    const destino = `#/planejamento/${salva.numero}`;
    if (location.hash === destino) window.dispatchEvent(new HashChangeEvent('hashchange')); else location.hash = destino;
  });

  dlg.append(h('h3', { id: 'sem-titulo', text: x.nova ? `Nova semana · S${x.numero}` : `Semana ${x.numero} · ${datasSemana(x)}` }), form);
  dlg.addEventListener('cancel', () => setTimeout(() => dlg.remove(), 0));
  document.body.append(dlg);
  dlg.showModal();
}
const limpo = x => { const { nova, ...resto } = x; return resto; };

/* ---------------------------------------------------------------- escala de professores */
function cartaoEscala(escala, dHoje) {
  const hojeDia = new Date(`${dHoje}T12:00:00`).getDay();
  const porDia = new Map();
  for (const e of escala) { if (!porDia.has(e.dia)) porDia.set(e.dia, []); porDia.get(e.dia).push(e); }
  const corpo = escala.length
    ? ORDEM_DIAS.filter(d => porDia.has(d)).map(d => h('div', { class: 'escala-dia' + (d === hojeDia ? ' hoje' : '') },
      h('span', { class: 'lbl' }, DIAS[d], d === hojeDia ? h('span', { class: 'etiqueta', text: 'hoje' }) : null),
      h('ul', { class: 'lista' }, porDia.get(d).map(e => h('li', null,
        h('button', { class: 'item item-escala', type: 'button', 'aria-label': `Editar ${DIAS[d]}, ${horaCurta(e.hora)}`, onclick: () => editarEscala(e) },
          h('b', { class: 'mono', text: horaCurta(e.hora) }), h('span', { text: e.professores })))))))
    : h('p', { class: 'sub', text: 'Ninguém na escala ainda. Adicione quem dá aula em cada dia e horário.' });
  return h('section', { class: 'card escala' },
    h('div', { class: 'card-head' }, h('h3', { text: 'Escala de professores' }),
      h('button', { class: 'btn pequeno', type: 'button', onclick: () => editarEscala(null) }, 'Adicionar horário')),
    corpo);
}

function editarEscala(e) {
  const dia = h('select', { id: 'esc-dia' }, ORDEM_DIAS.map(d => h('option', { value: d, text: DIAS[d] })));
  dia.value = String(e ? e.dia : 2);
  const hora = h('input', { id: 'esc-hora', type: 'time', required: true });
  hora.value = e ? e.hora : '12:00';
  const profs = h('input', { id: 'esc-profs', type: 'text', maxlength: 300, autocomplete: 'off', placeholder: 'Nomes separados por vírgula', required: true });
  profs.value = e ? e.professores : '';
  const dlg = h('dialog', { 'aria-labelledby': 'esc-titulo' });
  const fechar = () => { dlg.close(); dlg.remove(); };
  const recarregar = () => window.dispatchEvent(new HashChangeEvent('hashchange'));
  const form = h('form', { class: 'form' },
    h('label', { class: 'campo', for: 'esc-dia' }, h('span', { class: 'lbl', text: 'Dia' }), dia),
    h('label', { class: 'campo', for: 'esc-hora' }, h('span', { class: 'lbl', text: 'Horário' }), hora),
    h('label', { class: 'campo cheio', for: 'esc-profs' }, h('span', { class: 'lbl', text: 'Professores' }), profs),
    h('div', { class: 'acoes cheio' },
      h('button', { class: 'btn primario', type: 'submit' }, 'Salvar'),
      h('button', { class: 'btn fantasma', type: 'button', onclick: fechar }, 'Cancelar'),
      e ? botaoConfirmar('Tirar da escala', 'Toque de novo para tirar', async () => {
        await db.salvarEscala({ ...e, apagado: true });
        aviso('Horário tirado da escala.');
        fechar();
        recarregar();
      }) : null));
  form.addEventListener('submit', async ev => {
    ev.preventDefault();
    const nomes = profs.value.split(',').map(z => z.trim()).filter(Boolean).join(', ');
    if (!nomes || !hora.value) return;
    await db.salvarEscala({ ...(e || {}), dia: +dia.value, hora: hora.value, professores: nomes });
    aviso('Escala salva.');
    fechar();
    recarregar();
  });
  dlg.append(h('h3', { id: 'esc-titulo', text: e ? 'Editar horário da escala' : 'Novo horário na escala' }), form);
  dlg.addEventListener('cancel', () => setTimeout(() => dlg.remove(), 0));
  document.body.append(dlg);
  dlg.showModal();
  profs.focus();
}
