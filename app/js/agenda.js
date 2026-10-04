// Agenda fixa da turma (dias da semana e horário) e as datas de treino que saem dela.

import { isoLocal, DIAS } from './util.js';

const PLURAL = ['domingos', 'segundas', 'terças', 'quartas', 'quintas', 'sextas', 'sábados'];
export const DIAS_CURTOS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

// agenda: [{ dia: 0-6 (0 = domingo), hora: 'HH:MM' }]
export function normalizar(agenda) {
  return Array.isArray(agenda) ? agenda.filter(a => Number.isInteger(a.dia) && a.dia >= 0 && a.dia <= 6).sort((a, b) => a.dia - b.dia) : [];
}

const horaCurta = h => (h ? (h.endsWith(':00') ? `${+h.slice(0, 2)}h` : h.replace(':', 'h')) : '');

// "terças e quintas, 7h"
export function textoAgenda(agenda) {
  const a = normalizar(agenda);
  if (!a.length) return '';
  const nomes = a.map(x => PLURAL[x.dia]);
  const dias = nomes.length > 1 ? `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}` : nomes[0];
  const horas = [...new Set(a.map(x => x.hora).filter(Boolean))];
  return horas.length === 1 ? `${dias}, ${horaCurta(horas[0])}` : dias;
}

export const descricaoTurma = t => textoAgenda(t.agenda) || t.horario || '';

// Próximas datas de treino a partir de hoje (inclusive), nos próximos `dias` dias.
export function proximasDatas(agenda, dias = 7, inicio = new Date()) {
  const a = normalizar(agenda);
  const saida = [];
  for (let i = 0; i < dias; i++) {
    const d = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate() + i);
    for (const x of a) if (x.dia === d.getDay()) saida.push({ data: isoLocal(d), hora: x.hora || '', diaNome: DIAS[d.getDay()] });
  }
  return saida;
}

export { horaCurta };
