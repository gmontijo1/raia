// Turma de exemplo, com nomes e dados inventados, para conhecer o app sem dado real.
// Fica só neste aparelho (nunca sobe para a nuvem) e alimenta tudo o que o app mostra:
// - 12 semanas de treinos (terças e quintas, 12h) até ontem, com faltas de vez em quando;
// - repetições de 50 m crawl (3 a 6 por treino), 25 m crawl e 50 m costas, melhorando aos poucos
//   (painel da semana, MVP, pódio, evolução, resumo);
// - testes de Vcrit (400 m e 200 m crawl) nas semanas que o planejamento marca como teste;
// - PSE de cada aluno em cada treino, perto do esforço planejado (gráfico planejado × PSE).
// O planejamento e a escala são os do app (não são criados nem alterados aqui).

import { novoId, isoLocal, agoraISO, pad } from './util.js';
import { gravarExemplo, dispositivoId, listarSemanas, idPse } from './db.js';
import { semanaDe, temVcrit } from './semana.js';
import { planejadoDoTreino } from './esforco.js';

export const VERSAO_EXEMPLO = 2;

function sorteador(semente) {
  let a = semente;
  return () => {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// nome, melhor 50 m crawl no começo (s), quanto melhora em 12 semanas, quanto sente a mais/menos
// de PSE que o planejado, chance de vir ao treino, se também nada costas
const PESSOAS = [
  ['Ana (exemplo)', 39.8, .05, -0.5, .95, true], ['Bruno (exemplo)', 42.6, .07, 0.4, .9, false],
  ['Carla (exemplo)', 44.9, .08, 0.0, .92, true], ['Diego (exemplo)', 47.3, .10, 1.0, .85, false],
  ['Elisa (exemplo)', 49.5, .11, -1.0, .9, true], ['Felipe (exemplo)', 52.2, .09, 0.6, .8, false],
  ['Gabriela (exemplo)', 55.8, .14, 0.2, .88, true], ['Hugo (exemplo)', 59.4, .15, 1.4, .75, false],
  ['Isabela (exemplo)', 61.7, .12, -0.3, .9, true], ['João (exemplo)', 66.0, .17, 0.8, .82, false]
];

export async function criarTurmaExemplo() {
  const rnd = sorteador(20261010);
  const gauss = () => { let u = 0, v = 0; while (!u) u = rnd(); while (!v) v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const agora = agoraISO();
  const disp = await dispositivoId();
  const semanas = await listarSemanas();
  const turma = {
    id: novoId(), nome: 'Turma de exemplo', horario: null, agenda: [{ dia: 2, hora: '12:00' }, { dia: 4, hora: '12:00' }],
    exemplo: true, exemploVersao: VERSAO_EXEMPLO, arquivada: false, apagado: false, criadoEm: agora, atualizadoEm: agora
  };

  // terças e quintas das últimas 12 semanas, até ontem
  const datas = [];
  const fim = new Date(); fim.setDate(fim.getDate() - 1);
  for (let d = new Date(fim.getTime() - 84 * 864e5); d <= fim; d.setDate(d.getDate() + 1)) {
    if (d.getDay() === 2 || d.getDay() === 4) datas.push(isoLocal(d));
  }
  // dias de teste de Vcrit: 400 m no 1º treino e 200 m no 2º treino da semana marcada no
  // planejamento; sem planejamento, na 3ª e na 9ª semana
  const testes = new Map();
  const porSemana = new Map();
  for (const d of datas) {
    const s = semanaDe(semanas, d);
    const chave = s ? s.id : `${Math.floor(datas.indexOf(d) / 2)}`;
    if (!porSemana.has(chave)) porSemana.set(chave, { s, dias: [] });
    porSemana.get(chave).dias.push(d);
  }
  [...porSemana.values()].forEach((w, i) => {
    const marcada = w.s ? temVcrit(w.s) : i === 2 || i === 8;
    if (marcada && w.dias.length >= 2) { testes.set(w.dias[0], 400); testes.set(w.dias[1], 200); }
  });

  const nadadores = [], tempos = [], pses = [];
  for (const [ordem, [nome, base50, ganho, pseExtra, presenca, costas]] of PESSOAS.entries()) {
    const n = { id: novoId(), turmaId: turma.id, nome, arquivado: false, apagado: false, criadoEm: agora, atualizadoEm: agora };
    nadadores.push(n);
    let k = 0;
    for (const data of datas) {
      if (k > 0 && rnd() > presenca) continue;   // faltou
      const progresso = 1 - Math.exp(-(datas.indexOf(data)) / 10);
      const alvo50 = base50 * (1 - ganho * progresso);
      let minuto = 5 + ordem;
      const reg = (dist, estilo, t, rep) => tempos.push({
        id: novoId(), turmaId: turma.id, nadadorId: n.id, data, dist, estilo,
        t: Math.round(t * 100) / 100, rep, origem: 'exemplo', dispositivo: disp, apagado: false, sincronizado: false,
        criadoEm: new Date(`${data}T12:${pad(Math.min(59, minuto++ * 2))}:00`).toISOString(), atualizadoEm: agora
      });
      // série principal: 50 m crawl, cansando um pouco a cada repetição
      const reps = 3 + Math.floor(rnd() * 4);
      for (let r = 0; r < reps; r++) reg(50, 'crawl', alvo50 + r * 0.28 + Math.abs(gauss()) * 0.45, r + 1);
      if (k % 2 === 0) for (let r = 0; r < 2; r++) reg(25, 'crawl', alvo50 * 0.465 + r * 0.15 + Math.abs(gauss()) * 0.2, r + 1);
      if (costas && k % 3 === 1) for (let r = 0; r < 2; r++) reg(50, 'costas', alvo50 * 1.14 + r * 0.3 + Math.abs(gauss()) * 0.5, r + 1);
      // teste de Vcrit
      if (testes.get(data) === 400) reg(400, 'crawl', alvo50 * 8.75 * (1 + Math.abs(gauss()) * 0.01), 1);
      if (testes.get(data) === 200) reg(200, 'crawl', alvo50 * 4.16 * (1 + Math.abs(gauss()) * 0.01), 1);
      // PSE (nem todo mundo responde): perto do planejado, cada um sentindo do seu jeito
      if (rnd() < 0.88) {
        const plano = planejadoDoTreino(semanas, turma, data);
        const base = plano ? plano.alvo : 5.5 + 2 * Math.sin(datas.indexOf(data) / 3);
        const valor = Math.max(0, Math.min(10, Math.round(base + pseExtra + gauss() * 0.9)));
        pses.push({
          id: await idPse(n.id, data), turmaId: turma.id, nadadorId: n.id, data, valor, duracao: 50,
          origem: rnd() < 0.4 ? 'aluno' : 'professor', apagado: false, criadoEm: agora, atualizadoEm: agora
        });
      }
      k++;
    }
  }
  await gravarExemplo(turma, nadadores, tempos, pses);
  return turma;
}
