// Turma de exemplo, com nomes e tempos inventados, para testar o app sem dado real.
// Gera 12 semanas de treinos (terças e quintas) terminando antes de hoje.

import { novoId, isoLocal, agoraISO } from './util.js';
import { gravarExemplo, dispositivoId } from './db.js';

function sorteador(semente) {
  let a = semente;
  return () => {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

const PESSOAS = [
  ['Ana (exemplo)', 41.0, .06], ['Bruno (exemplo)', 43.5, .07], ['Carla (exemplo)', 45.2, .08],
  ['Diego (exemplo)', 49.8, .11], ['Elisa (exemplo)', 51.6, .12], ['Felipe (exemplo)', 53.0, .10],
  ['Gabriela (exemplo)', 58.4, .15], ['Hugo (exemplo)', 62.1, .16]
];

export async function criarTurmaExemplo() {
  const rnd = sorteador(20261003);
  const gauss = () => { let u = 0, v = 0; while (!u) u = rnd(); while (!v) v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const agora = agoraISO();
  const disp = await dispositivoId();
  const turma = {
    id: novoId(), nome: 'Turma de exemplo', horario: 'terças e quintas, 7h', agenda: [{ dia: 2, hora: '07:00' }, { dia: 4, hora: '07:00' }],
    exemplo: true, arquivada: false, apagado: false, criadoEm: agora, atualizadoEm: agora
  };

  const datas = [];
  const fim = new Date(); fim.setDate(fim.getDate() - 1);
  for (let d = new Date(fim.getTime() - 84 * 864e5); d <= fim; d.setDate(d.getDate() + 1)) {
    if (d.getDay() === 2 || d.getDay() === 4) datas.push(isoLocal(d));
  }

  const nadadores = [], tempos = [];
  for (const [nome, base50, ganho] of PESSOAS) {
    const n = { id: novoId(), turmaId: turma.id, nome, arquivado: false, apagado: false, criadoEm: agora, atualizadoEm: agora };
    nadadores.push(n);
    let k = 0;
    for (const data of datas) {
      if (k > 0 && rnd() > .8) continue;
      const t50 = base50 * (1 - ganho * (1 - Math.exp(-k / 8))) + gauss() * 0.5;
      const reg = (dist, t, rep) => tempos.push({
        id: novoId(), turmaId: turma.id, nadadorId: n.id, data, dist, estilo: 'crawl',
        t: Math.round(t * 100) / 100, rep, origem: 'exemplo', dispositivo: disp,
        apagado: false, sincronizado: false, criadoEm: agora, atualizadoEm: agora
      });
      reg(50, t50, 1);
      reg(25, t50 * 0.462 + gauss() * 0.2, 1);
      k++;
    }
  }
  await gravarExemplo(turma, nadadores, tempos);
  return turma;
}
