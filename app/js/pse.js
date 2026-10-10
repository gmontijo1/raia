// PSE (percepção subjetiva de esforço) da sessão, de 0 a 10, pela escala de referência do
// projeto: o aluno avalia como se sentiu durante TODA a sessão. Uma resposta por aluno por dia.
// Carga do treino (método da PSE da sessão) = PSE × duração em minutos, em unidades arbitrárias.

import { h, dataCurta, dataLonga, dec1, isoLocal } from './util.js';

export const INSTRUCAO_PSE = 'Avalie como você se sentiu durante TODA a sessão de treino. 0 = nada, 10 = o máximo possível.';
export const DURACAO_PADRAO = 50;   // minutos de uma aula do projeto

export const NIVEIS_PSE = [
  { valores: [10], nome: 'Esforço máximo', descricao: 'Falha total, insustentável, à beira do colapso.', exemplo: 'Tiro máximo de 50 m ou final de prova, nadando até não aguentar mais.' },
  { valores: [9], nome: 'Muito difícil', descricao: 'Exaustão, respiração muito ofegante, braços e pernas pesados.', exemplo: 'Série muito intensa no limite, com repetições fortes e pouco intervalo.' },
  { valores: [7, 8], nome: 'Difícil', descricao: 'Respiração pesada, alto desgaste, muito foco.', exemplo: 'Série principal intensa, com tiros de 100–200 m em ritmo forte.' },
  { valores: [5, 6], nome: 'Um pouco difícil', descricao: 'Respiração mais funda, difícil manter conversa longa.', exemplo: 'Treino contínuo moderado ou educativos com ritmo sustentado.' },
  { valores: [4], nome: 'Moderado', descricao: 'Começa a cansar, esforço controlado.', exemplo: 'Nado contínuo leve a moderado, com foco na técnica.' },
  { valores: [3], nome: 'Fácil', descricao: 'Exercício leve, respiração normal.', exemplo: 'Aquecimento leve, educativos técnicos, soltura.' },
  { valores: [1, 2], nome: 'Muito fácil', descricao: 'Quase nenhum esforço.', exemplo: 'Nado regenerativo bem leve, deslizes e pernadas suaves.' },
  { valores: [0], nome: 'Descanso total', descricao: 'Sem esforço.', exemplo: 'Parado na borda ou em repouso entre séries.' }
];

// Cada valor usa a cor do seu nível (tokens --pse-N e --pse-N-tinta no raia.css).
const TOM = { 0: 0, 1: 1, 2: 1, 3: 3, 4: 4, 5: 5, 6: 5, 7: 7, 8: 7, 9: 9, 10: 10 };
export const nivelDe = v => NIVEIS_PSE.find(n => n.valores.includes(v)) || null;
export const estiloPse = v => `--cor:var(--pse-${TOM[v]});--tinta:var(--pse-${TOM[v]}-tinta)`;
// Cor de um valor qualquer (ex.: uma média 6,8 usa a cor do 7)
export function corPse(v) {
  const t = TOM[Math.max(0, Math.min(10, Math.round(v)))];
  return { cor: `var(--pse-${t})`, tinta: `var(--pse-${t}-tinta)` };
}
export const chipPse = v => h('span', { class: 'pse-chip', style: estiloPse(v), title: `PSE ${v}: ${nivelDe(v).nome}` }, String(v));
export const mediaPse = lista => (lista.length ? lista.reduce((s, p) => s + p.valor, 0) / lista.length : null);
export const cargaPse = p => (p.duracao ? p.valor * p.duracao : null);
export const fmtPse = v => (v == null ? '–' : Number.isInteger(v) ? String(v) : dec1(v));

/* ---------- a escala (referência e também os botões de resposta) ---------- */
export function escalaPse({ valor = null, aoEscolher = null, exemplos = true } = {}) {
  const raiz = h('div', { class: 'pse-escala', role: aoEscolher ? 'radiogroup' : null, 'aria-label': aoEscolher ? 'PSE do treino, de 0 a 10' : null });
  for (const n of NIVEIS_PSE) {
    raiz.append(h('div', { class: 'pse-linha', style: estiloPse(n.valores[0]) },
      h('div', { class: 'pse-numeros' }, n.valores.map(v => (aoEscolher
        ? h('button', {
          type: 'button', class: 'pse-num', style: estiloPse(v), role: 'radio', 'data-valor': v,
          'aria-checked': v === valor ? 'true' : 'false', 'aria-label': `${v}: ${n.nome}`, onclick: () => aoEscolher(v)
        }, String(v))
        : h('span', { class: 'pse-num', style: estiloPse(v) }, String(v))))),
      h('div', { class: 'pse-texto' },
        h('b', { text: n.nome }),
        h('span', { class: 'pse-desc', text: n.descricao }),
        exemplos ? h('span', { class: 'pse-exemplo', text: n.exemplo }) : null)));
  }
  return raiz;
}

// Diálogo com a escala. Resolve { valor, duracao } (valor null = salvar sem PSE, quando
// `semPse` for o texto desse botão), 'apagar', ou null (cancelou).
export function perguntarPse({ titulo, texto, valor = null, duracao = DURACAO_PADRAO, botao = 'Salvar PSE', semPse = null, apagar = false }) {
  return new Promise(resolve => {
    let escolhido = valor;
    const dlg = h('dialog', { class: 'pergunta pergunta-pse', 'aria-labelledby': 'pse-titulo' });
    const fim = r => { dlg.close(); dlg.remove(); resolve(r); };
    const dur = h('input', { id: 'pse-dur', type: 'number', min: 1, max: 600, step: 5, inputmode: 'numeric' });
    dur.value = duracao ?? '';
    const ok = h('button', { class: 'btn primario grande', type: 'button' });
    const escala = escalaPse({ valor, aoEscolher: v => { escolhido = v; pintar(); } });
    function pintar() {
      ok.textContent = escolhido == null ? (semPse || botao) : `${botao} · PSE ${escolhido}`;
      ok.disabled = escolhido == null && !semPse;
      for (const b of escala.querySelectorAll('.pse-num')) b.setAttribute('aria-checked', String(Number(b.dataset.valor) === escolhido));
    }
    ok.addEventListener('click', () => fim(escolhido == null ? { valor: null } : { valor: escolhido, duracao: dur.value ? Math.round(Number(dur.value)) : null }));
    // o foco começa no título (no primeiro botão, o 10 pareceria já escolhido)
    const cabeca = h('h3', { id: 'pse-titulo', tabindex: '-1', text: titulo });
    dlg.append(
      cabeca,
      texto ? h('p', { class: 'sub', text: texto }) : null,
      h('p', { class: 'dica', text: INSTRUCAO_PSE }),
      escala,
      h('label', { class: 'campo pse-duracao', for: 'pse-dur' }, h('span', { class: 'lbl', text: 'Duração do treino (min)' }), dur),
      h('div', { class: 'acoes-coluna' },
        ok,
        apagar ? h('button', { class: 'btn grande perigo', type: 'button', onclick: () => fim('apagar') }, 'Apagar PSE') : null,
        h('button', { class: 'btn grande fantasma', type: 'button', onclick: () => fim(null) }, 'Cancelar')));
    dlg.addEventListener('cancel', e => { e.preventDefault(); fim(null); });
    document.body.append(dlg);
    pintar();
    dlg.showModal();
    cabeca.focus();
  });
}

/* ---------- histórico de um aluno (professor e aluno) ---------- */
export function cartaoPse(pses, { aoEditar } = {}) {
  if (!pses.length) return null;
  const ord = pses.slice().sort((a, b) => a.data.localeCompare(b.data));
  const ultima = ord[ord.length - 1];
  const hojeMenos = n => { const d = new Date(); d.setDate(d.getDate() - n); return isoLocal(d); };
  const recentes = ord.filter(p => p.data > hojeMenos(28));
  const semana = ord.filter(p => p.data > hojeMenos(7));
  const cargaSemana = semana.reduce((s, p) => s + (cargaPse(p) || 0), 0);
  const ultimas = ord.slice(-12);

  const barras = h('div', { class: 'pse-barras', role: 'img', 'aria-label': `PSE dos últimos ${ultimas.length} treinos: ${ultimas.map(p => `${dataCurta(p.data)}, ${p.valor}`).join('; ')}` },
    ultimas.map(p => h('div', { class: 'pse-coluna', title: `${dataLonga(p.data)} · PSE ${p.valor} (${nivelDe(p.valor).nome})` },
      h('span', { class: 'pse-coluna-v', text: String(p.valor) }),
      h('span', { class: 'pse-coluna-area' }, h('span', { class: 'pse-coluna-barra', style: `${estiloPse(p.valor)};height:${Math.max(4, p.valor * 10)}%` })),
      h('span', { class: 'pse-coluna-d', text: dataCurta(p.data).split(' ')[0] }))));

  return h('div', { class: 'card pse-cartao' },
    h('div', { class: 'card-head' }, h('h3', { text: 'PSE dos treinos' }), h('a', { class: 'link', href: '#/pse' }, 'Ver a escala')),
    h('div', { class: 'blocos', style: 'margin-top:12px' },
      h('div', { class: 'bloco' }, h('span', { class: 'lbl', text: 'Última PSE' }),
        h('span', { class: 'v' }, h('span', { class: 'pse-chip grande', style: estiloPse(ultima.valor), text: String(ultima.valor) })),
        h('span', { class: 'd', text: `${nivelDe(ultima.valor).nome} · ${dataLonga(ultima.data)}` })),
      h('div', { class: 'bloco' }, h('span', { class: 'lbl', text: 'Média · 4 semanas' }),
        h('span', { class: 'v', text: fmtPse(mediaPse(recentes)) }), h('span', { class: 'd', text: `${recentes.length} ${recentes.length === 1 ? 'treino' : 'treinos'}` })),
      h('div', { class: 'bloco' }, h('span', { class: 'lbl', text: 'Carga · 7 dias' }),
        h('span', { class: 'v', text: cargaSemana ? cargaSemana.toLocaleString('pt-BR') : '–' }), h('span', { class: 'd', text: 'PSE × minutos (UA)' }))),
    barras,
    h('details', { style: 'margin-top:10px' }, h('summary', { text: 'Todos os registros' }),
      h('ul', { class: 'lista' }, ord.slice().reverse().map(p => h('li', null,
        h(aoEditar ? 'button' : 'div', { class: 'item item-pse', type: aoEditar ? 'button' : null, onclick: aoEditar ? () => aoEditar(p) : null },
          h('b', { text: dataLonga(p.data) }),
          h('span', { class: 'lado' }, chipPse(p.valor)),
          h('span', { class: 'sub', text: [nivelDe(p.valor).nome, p.duracao ? `${p.duracao} min · carga ${cargaPse(p)}` : null, p.origem === 'aluno' ? 'respondida pelo aluno' : 'marcada pelo professor'].filter(Boolean).join(' · ') })))))));
}

/* ---------- planilha para o Excel (separador ";") ---------- */
export function planilhaPse(pses, turmas, nadadores) {
  const tn = new Map(turmas.map(t => [t.id, t.nome]));
  const nn = new Map(nadadores.map(n => [n.id, n.nome]));
  const campo = v => { const s = String(v ?? ''); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const linhas = [['data', 'turma', 'aluno', 'pse', 'nivel', 'duracao_min', 'carga_ua', 'respondida_por'].join(';')];
  pses.filter(p => !p.apagado).sort((a, b) => a.data.localeCompare(b.data) || String(nn.get(a.nadadorId)).localeCompare(String(nn.get(b.nadadorId)), 'pt-BR'))
    .forEach(p => linhas.push([p.data, tn.get(p.turmaId), nn.get(p.nadadorId), p.valor, nivelDe(p.valor).nome, p.duracao, cargaPse(p), p.origem].map(campo).join(';')));
  return '﻿' + linhas.join('\r\n');
}
