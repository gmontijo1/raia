// Contas do fim do treino: o que cada nadador nadou hoje, os recordes pessoais batidos e
// onde estão os dados (na nuvem, na fila ou só no aparelho).

import { combos, doCombo, melhorDe, combo } from './util.js';
import { nuvemLigada } from './nuvem.js';
import { estadoSincronia } from './sincronia.js';

export const repeticoes = n => (n === 0 ? 'Sem repetições' : n === 1 ? '1 repetição' : `${n} repetições`);

// Um nadador num dia: total de repetições, cada prova (distância + estilo) com o melhor do dia e
// se bateu o recorde pessoal (melhor que todos os dias anteriores), e a prova principal (a mais nadada).
export function doDia(tempos, nadadorId, data) {
  const seus = tempos.filter(r => r.nadadorId === nadadorId);
  const doDiaLista = seus.filter(r => r.data === data);
  const provas = combos(doDiaLista).map(([dist, estilo]) => {
    const reps = doCombo(doDiaLista, dist, estilo);
    const antes = melhorDe(doCombo(seus, dist, estilo).filter(r => r.data < data));
    const melhor = melhorDe(reps);
    return { dist, estilo, reps: reps.length, melhor, recorde: antes != null && melhor < antes };
  });
  const principal = provas.slice().sort((a, b) => b.reps - a.reps)[0] || null;
  return { reps: doDiaLista.length, provas, principal, melhor: principal ? principal.melhor : null };
}

// A turma num dia. `extras`: nadadores que entram mesmo sem tempo (os que encerraram sem nadar).
export function resumoTurma(tempos, nadadores, data, extras = []) {
  const ids = new Set(tempos.filter(r => r.data === data).map(r => r.nadadorId));
  for (const id of extras) ids.add(id);
  const linhas = nadadores.filter(n => ids.has(n.id)).map(n => ({ nadador: n, ...doDia(tempos, n.id, data) }));
  const recordes = linhas.flatMap(l => l.provas.filter(p => p.recorde).map(p => ({ nome: l.nadador.nome, ...p })));
  return {
    linhas, recordes,
    nadadores: linhas.filter(l => l.reps).length,
    repeticoes: linhas.reduce((soma, l) => soma + l.reps, 0)
  };
}

// "8 repetições · 50 m crawl", com "e 25 m costas" no fim quando nadou mais de uma prova.
export function detalheLinha(l) {
  if (!l.reps) return 'Sem repetições';
  const outras = l.provas.filter(p => p !== l.principal);
  const mais = outras.length === 1 ? ` e ${combo(outras[0].dist, outras[0].estilo)}` : outras.length ? ` e mais ${outras.length} provas` : '';
  return `${repeticoes(l.reps)} · ${combo(l.principal.dist, l.principal.estilo)}${mais}`;
}

// Onde estão os dados de hoje. `fase` usa as mesmas cores do indicador do topo (.sincronia).
export function statusNuvem(turma) {
  if (turma.exemplo) return { fase: '', texto: 'No aparelho', frase: 'A turma de exemplo fica só neste aparelho.' };
  if (!nuvemLigada()) return { fase: '', texto: 'No aparelho', frase: 'Os dados de hoje estão salvos neste aparelho.' };
  const e = estadoSincronia();
  if (e.fase === 'enviando') return { fase: 'enviando', texto: 'Enviando…', frase: 'Enviando os dados de hoje…' };
  if (e.fase === 'ok' && !e.pendentes) return { fase: 'ok', texto: 'Salvo na nuvem', frase: 'Todos os dados de hoje estão na nuvem.' };
  if (e.fase === 'offline') return { fase: 'offline', texto: 'Sem internet', frase: 'Sem internet. Os dados estão salvos no aparelho e sobem sozinhos quando a conexão voltar.' };
  if (e.fase === 'erro') return { fase: 'erro', texto: 'Não enviado', frase: 'Não consegui enviar agora. Os dados estão salvos no aparelho e o app tenta de novo sozinho.' };
  return { fase: 'enviando', texto: 'Na fila', frase: 'Os dados de hoje estão na fila para a nuvem.' };
}
