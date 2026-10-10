// Planejamento do semestre (o mesmo para todas as turmas): em que semana estamos, a cor de
// cada período, o treino do dia de uma turma e quem dá aula em cada horário.
// Os dados vêm de db.listarSemanas() e db.listarEscala().

import { h, isoLocal, hoje, dataCurta } from './util.js';
import { normalizar } from './agenda.js';

export const VOLUME_MAX = 4500;   // metros: 100% de volume na planilha do projeto

const DIA_MS = 864e5;
const meioDia = iso => new Date(`${iso}T12:00:00`);
const meiaNoite = iso => new Date(`${iso}T00:00:00`);
export const somarDias = (iso, n) => isoLocal(new Date(meioDia(iso).getTime() + n * DIA_MS));
export const fimDaSemana = s => somarDias(s.inicio, 5);   // a semana de treino vai de segunda a sábado

// "5 a 10 out", "31 ago a 5 set"
export function datasSemana(s) {
  const fim = fimDaSemana(s);
  return s.inicio.slice(5, 7) === fim.slice(5, 7) ? `${+s.inicio.slice(8)} a ${dataCurta(fim)}` : `${dataCurta(s.inicio)} a ${dataCurta(fim)}`;
}

export const fmtMetros = m => `${Math.round(m).toLocaleString('pt-BR')} m`;
export const pct = x => `${Math.round(x * 100)}%`;
export const volumeMetros = s => (s.volume != null ? s.volume * VOLUME_MAX : null);
// "Carga": a parte do volume que é intensidade (volume × intensidade), na mesma escala em metros.
export const cargaMetros = s => (s.volume != null && s.intensidade != null ? s.volume * s.intensidade * VOLUME_MAX : null);
export function mediaTreinos(s) {
  const tot = (s.treinos || []).map(t => Number(t.total)).filter(v => v > 0);
  return tot.length ? tot.reduce((a, b) => a + b, 0) / tot.length : null;
}

// Semana que contém a data (de segunda a domingo).
export function semanaDe(semanas, iso = hoje()) {
  return semanas.find(s => iso >= s.inicio && iso < somarDias(s.inicio, 7)) || null;
}

// Onde o semestre está. indice: semana atual (-1 antes do início, total depois do fim).
export function progresso(semanas, iso = hoje()) {
  if (!semanas.length) return null;
  const t = iso === hoje() ? Date.now() : meioDia(iso).getTime();
  const ini = meiaNoite(semanas[0].inicio).getTime();
  const fim = meiaNoite(somarDias(semanas[semanas.length - 1].inicio, 7)).getTime();
  const dentro = v => Math.min(1, Math.max(0, v));
  let indice = semanas.findIndex(s => iso >= s.inicio && iso < somarDias(s.inicio, 7));
  if (indice < 0) indice = iso < semanas[0].inicio ? -1 : semanas.length;
  const semana = semanas[indice];
  return {
    indice,
    fracaoSemestre: dentro((t - ini) / (fim - ini)),
    fracaoSemana: semana ? dentro((t - meiaNoite(semana.inicio).getTime()) / (7 * DIA_MS)) : 0
  };
}

/* ---------- períodos (mesociclos) e suas cores ---------- */
// Cor fixa por tipo de período, a mesma em qualquer semestre (validada para daltonismo na
// ordem em que os períodos se sucedem). "II" é o mesmo tipo repetido.
export const PERIODOS = [
  { chave: 'retreinamento', nome: 'Retreinamento', cor: 'var(--fase-retreino)' },
  { chave: 'potencia anaerobia', nome: 'Potência Anaeróbia', cor: 'var(--fase-anaerobia)' },
  { chave: 'potencia aerobia', nome: 'Potência Aeróbia', cor: 'var(--fase-aerobia)' },
  { chave: 'supercompensacao', nome: 'Supercompensação', cor: 'var(--fase-supercomp)' }
];
const simples = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+i+$/, '').trim();
export function tipoPeriodo(periodo) {
  const p = simples(periodo);
  return PERIODOS.find(x => p.startsWith(x.chave)) || { chave: p || 'outro', nome: periodo || 'Sem período', cor: 'var(--axis)' };
}

// Extras da semana ("Vcrit; Avaliação física") em itens.
export const extrasDe = s => String(s.extras || '').split(/[;,]/).map(x => x.trim()).filter(Boolean);
export const temVcrit = s => extrasDe(s).some(x => /vcrit/i.test(x)) || /vcrit/i.test(s.conteudo || '');
export const temAvaliacao = s => extrasDe(s).some(x => /avalia/i.test(x));

/* ---------- treino do dia e escala ---------- */
// O DIA 1 da semana é o 1º dia de aula da turma na semana, o DIA 2 é o 2º, e assim por diante.
export function treinoDaTurma(semana, turma, iso = hoje()) {
  if (!semana || !turma || !(semana.treinos || []).length) return null;
  const dias = [...new Set(normalizar(turma.agenda).map(a => a.dia))].sort((a, b) => a - b);
  const i = dias.indexOf(meioDia(iso).getDay());
  return i < 0 ? null : semana.treinos.find(t => t.dia === i + 1) || null;
}

export function professoresDaTurma(escala, turma, iso = hoje()) {
  const d = meioDia(iso).getDay();
  const horas = normalizar(turma.agenda).filter(a => a.dia === d).map(a => a.hora);
  const e = escala.find(x => x.dia === d && horas.includes(x.hora));
  return e ? e.professores : null;
}

/* ---------- o treino de um dia, em blocos ---------- */
const metros = v => (/^\d+$/.test(String(v || '').trim()) ? `${v} m` : String(v || ''));
// Separa "A) 8 x 25; B) 1 x 400" nas séries; aceita o ";" esquecido ("A) 4 x 50 B) 1 x 200").
const series = texto => String(texto || '').split(/(?:;\s*|\s+)(?=[A-H]\s*\))/).map(x => x.trim()).filter(Boolean);
const letra = x => (x.match(/^([A-H])\s*\)/) || [])[1];
const semLetra = x => x.replace(/^[A-H]\s*\)\s*/, '');

function parte(rotulo, valor, obs) {
  if (!valor && !obs) return null;
  const a = series(valor), b = series(obs);
  let corpo;
  if (a.length > 1 && a.every(letra)) {
    // "A) 8 x 25; B) 1 x 400" com a observação de cada letra embaixo
    const obsPor = new Map(b.filter(letra).map(x => [letra(x), semLetra(x)]));
    const soltas = b.filter(x => !letra(x));
    corpo = h('ol', { class: 'series' },
      a.map(x => h('li', null, h('b', { text: letra(x) }), h('div', null,
        h('span', { text: metros(semLetra(x)) }),
        obsPor.get(letra(x)) ? h('span', { class: 'sub', text: obsPor.get(letra(x)) }) : null))),
      soltas.map(x => h('li', { class: 'nota', text: x })));
  } else {
    corpo = h('div', null, valor ? h('span', { text: metros(valor) }) : null, obs ? h('span', { class: 'sub', text: obs }) : null);
  }
  return [h('dt', { text: rotulo }), h('dd', null, corpo)];
}

export function blocoTreino(t, titulo = `Dia ${t.dia}`) {
  return h('div', { class: 'treino-bloco' },
    h('div', { class: 'treino-cab' }, h('b', { text: titulo }), Number(t.total) > 0 ? h('span', { class: 'mono', text: fmtMetros(Number(t.total)) }) : null),
    h('dl', { class: 'treino-partes' },
      parte('Aquecimento', t.aquecimento, t.aquecimentoObs),
      parte('Parte principal', t.principal, t.principalObs),
      parte('Soltura', t.soltura, t.solturaObs)));
}
