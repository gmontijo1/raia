// Resumo do treino de hoje de uma turma: números do dia, recordes pessoais e o melhor de cada
// nadador, com o botão para mandar no grupo da turma. Abre depois de "Encerrar treino da turma".

import { h, aviso, fmtTempo, combo, hoje, dataLonga, naoEncontrado } from '../util.js';
import * as db from '../db.js';
import { aoMudarEstado } from '../sincronia.js';
import { NOME_PROJETO } from '../marca.js';
import { resumoTurma, detalheLinha, statusNuvem } from '../resumo-dia.js';
import { textoResumo, prepararImagem, compartilhar } from '../compartilhar.js';
import { perguntarPse, chipPse, mediaPse, fmtPse, DURACAO_PADRAO } from '../pse.js';
import { nuvemLigada } from '../nuvem.js';
import { sincronizar } from '../sincronia.js';

export async function render(caixa, turmaId) {
  const t = await db.turma(turmaId);
  if (!t || t.apagado) { caixa.append(naoEncontrado('Turma')); return; }
  const data = hoje();
  const nads = await db.nadadoresDaTurma(turmaId);
  const tempos = await db.temposDaTurma(turmaId);
  const enc = await db.config.get(`encerrados:${turmaId}`, null);
  const res = resumoTurma(tempos, nads, data, enc && enc.data === data ? enc.ids : []);

  caixa.append(h('div', null, h('a', { class: 'voltar', href: `#/treino/${t.id}` }, '← Treino')));
  caixa.append(h('div', { class: 'cabeca' },
    h('div', null, h('span', { class: 'lbl', text: `${t.nome} · ${dataLonga(data)}` }), h('h2', { text: 'Resumo do treino' }))));

  if (!res.linhas.length) {
    caixa.append(h('div', { class: 'card vazio' },
      h('h3', { text: 'Nenhum tempo hoje nesta turma' }),
      h('p', { text: 'O resumo aparece depois que os nadadores tiverem tempos marcados hoje.' }),
      h('a', { class: 'btn primario', href: `#/treino/${t.id}` }, 'Voltar ao treino')));
    return;
  }

  /* o cartão (é o que vira imagem no "Compartilhar") */
  const numero = (valor, rotulo) => h('div', { class: 'resumo-num' }, h('b', { text: String(valor) }), h('span', { text: rotulo }));
  caixa.append(h('div', { class: 'resumo-cartao' },
    h('div', { class: 'resumo-faixa' },
      h('span', { class: 'logo-projeto', role: 'img', 'aria-label': NOME_PROJETO }),
      h('div', { class: 'resumo-numeros' },
        numero(res.nadadores, 'Nadadores'), numero(res.repeticoes, 'Repetições'), numero(res.recordes.length, 'Recordes'))),
    h('div', { class: 'corda', 'aria-hidden': 'true' }),
    h('div', { class: 'resumo-recordes' },
      h('span', { class: 'lbl', text: 'Recordes do dia' }),
      h('ul', { class: 'lista sessao' }, res.recordes.length
        ? res.recordes.map(r => h('li', null,
          h('span', { class: 't', text: fmtTempo(r.melhor) }),
          h('div', { class: 'quem' }, h('b', { text: r.nome }), h('span', { class: 'meta', text: combo(r.dist, r.estilo) })),
          h('span', { class: 'chip recorde', text: 'Recorde' })))
        : h('li', { class: 'nada', text: 'Nenhum recorde hoje.' })))));

  caixa.append(h('div', { class: 'card' },
    h('h3', { text: 'Nadadores' }),
    h('ul', { class: 'lista', style: 'margin-top:4px' }, res.linhas.map(l => h('li', null,
      h('div', { class: 'item' },
        h('b', { text: l.nadador.nome }),
        h('span', { class: 'sub', text: detalheLinha(l) }),
        h('span', { class: 'lado', text: l.melhor != null ? fmtTempo(l.melhor) : '–' })))))));

  /* PSE do treino: a média da turma e a de cada aluno (marcar quem ficou faltando) */
  const psesHoje = new Map((await db.psesDaTurma(turmaId)).filter(p => p.data === data).map(p => [p.nadadorId, p]));
  let duracaoAula = await db.config.get(`duracao:${turmaId}`, DURACAO_PADRAO);
  const cartaoPseTurma = h('div', { class: 'card' });
  caixa.append(cartaoPseTurma);
  const pintarPse = () => {
    const respostas = res.linhas.map(l => psesHoje.get(l.nadador.id)).filter(Boolean);
    const media = mediaPse(respostas);
    cartaoPseTurma.textContent = '';
    cartaoPseTurma.append(
      h('div', { class: 'card-head' }, h('h3', { text: 'PSE do treino' }), h('a', { class: 'link', href: '#/pse' }, 'Ver a escala')),
      h('p', { class: 'sub', style: 'margin-top:4px', text: respostas.length
        ? `Média ${fmtPse(media)} · ${respostas.length} de ${res.linhas.length} ${res.linhas.length === 1 ? 'aluno respondeu' : 'alunos responderam'}`
        : 'Ninguém marcou a PSE ainda. Toque no aluno para marcar.' }),
      h('ul', { class: 'lista', style: 'margin-top:4px' }, res.linhas.map(l => {
        const p = psesHoje.get(l.nadador.id);
        return h('li', null, h('button', { class: 'item item-pse', type: 'button', onclick: () => marcar(l.nadador) },
          h('b', { text: l.nadador.nome }),
          h('span', { class: 'lado' }, p ? chipPse(p.valor) : h('span', { class: 'link', text: 'Marcar' })),
          h('span', { class: 'sub', text: p ? (p.origem === 'aluno' ? 'respondida pelo aluno' : 'marcada pelo professor') : 'sem PSE' })));
      })));
  };
  async function marcar(n) {
    const atual = psesHoje.get(n.id);
    const resp = await perguntarPse({ titulo: `PSE de ${n.nome} · ${dataLonga(data)}`, valor: atual?.valor ?? null, duracao: atual?.duracao ?? duracaoAula, botao: 'Salvar PSE', apagar: !!atual });
    if (!resp) return;
    const p = await db.salvarPse({ turmaId, nadadorId: n.id, data, valor: resp === 'apagar' ? null : resp.valor, duracao: resp.duracao ?? null, origem: 'professor' });
    if (p && !p.apagado) psesHoje.set(n.id, p); else psesHoje.delete(n.id);
    if (resp.duracao) { duracaoAula = resp.duracao; await db.config.set(`duracao:${turmaId}`, resp.duracao); }
    pintarPse();
    if (nuvemLigada() && !t.exemplo) sincronizar();
  }
  pintarPse();

  /* onde estão os dados */
  const frase = h('span', { class: 'sub' });
  const pilula = h('span', { class: 'sincronia' });
  caixa.append(h('div', { class: 'card linha-nuvem' }, frase, pilula));
  const pararDeOuvir = aoMudarEstado(() => {
    const s = statusNuvem(t);
    frase.textContent = s.frase;
    pilula.dataset.fase = s.fase;
    pilula.textContent = s.texto;
  });

  /* compartilhar: a imagem é preparada já, para o toque abrir o compartilhamento na hora */
  const dados = { turma: t, data, res };
  const texto = textoResumo(dados);
  const imagem = prepararImagem(dados).catch(e => { console.warn('Imagem do resumo:', e); return null; });
  const botao = h('button', { class: 'btn primario grande', type: 'button' }, 'Compartilhar resumo');
  botao.addEventListener('click', async () => {
    const r = await compartilhar(await imagem, texto, `Resumo do treino · ${t.nome}`);
    const avisos = {
      'baixou-copiou': 'Imagem do resumo baixada e texto copiado. É só colar no grupo da turma.',
      baixou: 'Imagem do resumo baixada.',
      copiou: 'Resumo copiado. É só colar no grupo da turma.',
      falhou: 'Não consegui compartilhar neste aparelho.'
    };
    if (avisos[r]) aviso(avisos[r]);
  });
  caixa.append(h('div', { class: 'acoes-coluna' },
    botao, h('a', { class: 'btn grande', href: `#/treino/${t.id}` }, 'Voltar ao treino')));

  return () => pararDeOuvir();
}
