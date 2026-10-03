// Janela "Lançar tempo à mão": para tempos tirados no cronômetro físico ou copiados do caderno.

import { h, lerTempo, hoje, ESTILOS, DISTANCIAS, fmtTempo, combo, aviso } from './util.js';
import * as db from './db.js';

export function abrirLancamento({ turmaId, nadadores, nadadorId, dist = 50, estilo = 'crawl', aoSalvar }) {
  const sel = h('select', { id: 'lanc-nadador', required: true },
    nadadores.map(n => h('option', { value: n.id, text: n.nome })));
  if (nadadorId) sel.value = nadadorId;
  const data = h('input', { id: 'lanc-data', type: 'date', required: true, max: hoje() });
  data.value = hoje();
  const selDist = h('select', { id: 'lanc-dist' }, DISTANCIAS.map(d => h('option', { value: d, text: `${d} m` })));
  selDist.value = String(dist);
  const selEst = h('select', { id: 'lanc-estilo' }, ESTILOS.map(e => h('option', { value: e, text: e })));
  selEst.value = estilo;
  const tempo = h('input', { id: 'lanc-tempo', type: 'text', inputmode: 'decimal', autocomplete: 'off', required: true, placeholder: '38,42 ou 1:02,35' });
  const erro = h('p', { class: 'erro-campo', role: 'alert' });

  const dlg = h('dialog', { 'aria-labelledby': 'lanc-titulo' });
  const fechar = () => { dlg.close(); dlg.remove(); };
  const form = h('form', { class: 'form' },
    h('label', { class: 'campo cheio', for: 'lanc-nadador' }, h('span', { class: 'lbl', text: 'Nadador' }), sel),
    h('label', { class: 'campo', for: 'lanc-dist' }, h('span', { class: 'lbl', text: 'Distância' }), selDist),
    h('label', { class: 'campo', for: 'lanc-estilo' }, h('span', { class: 'lbl', text: 'Estilo' }), selEst),
    h('label', { class: 'campo', for: 'lanc-tempo' }, h('span', { class: 'lbl', text: 'Tempo' }), tempo, h('small', { text: 'Segundos e centésimos. Acima de 1 minuto: 1:02,35' })),
    h('label', { class: 'campo', for: 'lanc-data' }, h('span', { class: 'lbl', text: 'Dia do treino' }), data),
    h('div', { class: 'cheio' }, erro),
    h('div', { class: 'acoes cheio' },
      h('button', { class: 'btn primario', type: 'submit' }, 'Salvar tempo'),
      h('button', { class: 'btn fantasma', type: 'button', onclick: fechar }, 'Cancelar')));

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const t = lerTempo(tempo.value);
    if (t == null) { erro.textContent = 'Tempo inválido. Use o formato 38,42 ou 1:02,35.'; tempo.focus(); return; }
    if (!data.value || data.value > hoje()) { erro.textContent = 'Escolha um dia até hoje.'; data.focus(); return; }
    const nadId = sel.value, d = +selDist.value, es = selEst.value;
    const doDia = (await db.temposDoNadador(nadId)).filter(r => r.data === data.value && r.dist === d && r.estilo === es);
    const reg = await db.registrarTempo({ turmaId, nadadorId: nadId, data: data.value, dist: d, estilo: es, t, rep: doDia.length + 1, origem: 'manual' });
    const nome = nadadores.find(n => n.id === nadId)?.nome || '';
    aviso(`${fmtTempo(t)} salvo para ${nome} (${combo(d, es)}).`);
    fechar();
    if (aoSalvar) aoSalvar(reg);
  });

  dlg.append(h('h3', { id: 'lanc-titulo', text: 'Lançar tempo à mão' }), form);
  dlg.addEventListener('cancel', () => setTimeout(() => dlg.remove(), 0));
  document.body.append(dlg);
  dlg.showModal();
  tempo.focus();
}
