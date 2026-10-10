// Área do aluno: só os próprios dados, direto da nuvem (as regras do banco garantem isso).
// Guarda a última leitura no aparelho para abrir também sem internet.

import { h, aviso, fmtTempo, combo, combos, doCombo, melhorDe, dataLonga, hora, hoje, isoLocal, botaoConfirmar, pad } from '../util.js';
import * as db from '../db.js';
import { sb, perfil, explicar, sair } from '../nuvem.js';
import { secaoEvolucao } from '../evolucao.js';
import { conteudoRepeticoes } from '../repeticoes.js';
import { proximasDatas, descricaoTurma, horaCurta, normalizar } from '../agenda.js';
import { perguntarPse, cartaoPse, chipPse, nivelDe, DURACAO_PADRAO } from '../pse.js';

const diasDepois = n => { const d = new Date(); d.setDate(d.getDate() + n); return isoLocal(d); };

let memoria = null;   // última leitura nesta sessão (evita buscar de novo ao trocar de tela)

async function todasAsLinhas(consulta) {
  const saida = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await consulta().range(de, de + 999);
    if (error) throw error;
    saida.push(...data);
    if (data.length < 1000) return saida;
  }
}

async function carregar({ forcar = false } = {}) {
  const p = perfil();
  if (!forcar && memoria && Date.now() - memoria.lidoEm < 60 * 1000) return memoria;
  try {
    const cli = sb();
    const { data: nad, error } = await cli.from('nadadores').select('id, nome, turma_id').eq('id', p.nadadorId).maybeSingle();
    if (error) throw error;
    if (!nad) throw new Error('Seu cadastro não foi encontrado. Fale com o professor.');
    const [turma, tempos, planos] = await Promise.all([
      cli.from('turmas').select('id, nome, horario, agenda').eq('id', nad.turma_id).maybeSingle().then(r => { if (r.error) throw r.error; return r.data; }),
      todasAsLinhas(() => cli.from('tempos').select('id, data, dist, estilo, t, rep, criado_em')
        .eq('nadador_id', nad.id).eq('apagado', false).order('data').order('criado_em')),
      todasAsLinhas(() => cli.from('planos').select('data, descricao')
        .eq('turma_id', nad.turma_id).eq('apagado', false).gte('data', diasDepois(-60)).lte('data', diasDepois(14)))
    ]);
    // PSE: se a tabela ainda não existir na nuvem, segue sem ela
    const pses = await todasAsLinhas(() => cli.from('pse').select('id, data, valor, duracao, origem')
      .eq('nadador_id', nad.id).eq('apagado', false).order('data'))
      .catch(e => { console.warn('PSE:', e); return []; });
    const dados = {
      nadador: { id: nad.id, nome: nad.nome },
      turma: turma || { nome: '', agenda: [] },
      tempos: tempos.map(r => ({ id: r.id, data: r.data, dist: r.dist, estilo: r.estilo, t: Number(r.t), rep: r.rep, criadoEm: new Date(r.criado_em).toISOString() })),
      planos,
      pses: pses.map(p => ({ ...p, nadadorId: nad.id, turmaId: nad.turma_id })),
      lidoEm: Date.now()
    };
    await db.config.set('aluno-cache', dados);
    memoria = dados;
    return dados;
  } catch (e) {
    const guardado = await db.config.get('aluno-cache', null);
    if (guardado && guardado.nadador && guardado.nadador.id === p.nadadorId) return { ...guardado, antigo: true, erro: explicar(e) };
    throw e;
  }
}

function faixaAntigo(dados) {
  if (!dados.antigo) return null;
  const quando = new Date(dados.lidoEm);
  return h('div', { class: 'faixa' }, `Sem conexão: mostrando os dados de ${dataLonga(isoLocal(quando))}, ${hora(quando)}.`);
}

/* ---------- PSE do aluno ---------- */
// Treinos recentes (últimos 7 dias, pela agenda da turma ou com tempo marcado) ainda sem PSE.
function treinosSemPse(dados) {
  const feitos = new Set((dados.pses || []).map(p => p.data));
  const agora = new Date();
  const horaAgora = `${pad(agora.getHours())}:${pad(agora.getMinutes())}`;
  const dHoje = hoje();
  const datas = new Set(dados.tempos.filter(r => r.data > diasDepois(-7) && r.data <= dHoje).map(r => r.data));
  for (const a of normalizar(dados.turma.agenda)) {
    for (let i = 0; i < 7; i++) {
      const d = new Date(); d.setDate(d.getDate() - i);
      // a aula de hoje só entra depois do horário dela
      if (d.getDay() === a.dia && (i > 0 || !a.hora || horaAgora >= a.hora)) datas.add(isoLocal(d));
    }
  }
  return [...datas].filter(d => !feitos.has(d)).sort().reverse().slice(0, 3);
}

async function responderPse(dados, data, atual = null) {
  const resp = await perguntarPse({ titulo: `Seu treino de ${dataLonga(data)}`, valor: atual?.valor ?? null, duracao: atual?.duracao ?? DURACAO_PADRAO, botao: 'Enviar PSE' });
  if (!resp || resp.valor == null) return;
  try {
    const { error } = await sb().from('pse').upsert({
      id: await db.idPse(dados.nadador.id, data), turma_id: dados.turma.id, nadador_id: dados.nadador.id, data,
      valor: resp.valor, duracao: resp.duracao, origem: 'aluno', apagado: false, atualizado_em: new Date().toISOString()
    }, { onConflict: 'id' });
    if (error) throw error;
    memoria = null;
    aviso('PSE enviada. Obrigado!');
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } catch (e) {
    aviso(navigator.onLine ? `Não consegui enviar: ${explicar(e)}` : 'Sem internet. Tente de novo quando conectar.');
  }
}

/* ---------- início do aluno ---------- */
export async function render(caixa) {
  const dados = await carregar();
  const { nadador, turma, tempos, planos } = dados;
  const pses = dados.pses || [];
  const pseDe = new Map(pses.map(p => [p.data, p]));
  const planoDe = new Map(planos.map(p => [p.data, p.descricao]));
  const dHoje = hoje();

  caixa.append(...[faixaAntigo(dados),
    h('div', { class: 'cabeca' }, h('div', null,
      h('h2', { text: nadador.nome }),
      h('p', { class: 'sub', text: [turma.nome, descricaoTurma(turma)].filter(Boolean).join(' · ') })))].filter(Boolean));

  /* pedido de PSE dos treinos recentes */
  const pendentes = turma.id && !dados.antigo ? treinosSemPse(dados) : [];
  if (pendentes.length) {
    caixa.append(h('div', { class: 'card pse-pedido' },
      h('h3', { text: 'Como foi o seu treino?' }),
      h('p', { class: 'sub', style: 'margin-top:4px', text: 'Marque a sua PSE: o quanto você se esforçou durante a sessão inteira, de 0 a 10.' }),
      h('div', { class: 'acoes-coluna', style: 'margin-top:10px' },
        pendentes.map(d => h('button', { class: 'btn', type: 'button', onclick: () => responderPse(dados, d) }, `Treino de ${dataLonga(d)}`))),
      h('a', { class: 'link', href: '#/pse' }, 'Ver a escala de PSE')));
  }

  /* esta semana */
  const datas = proximasDatas(turma.agenda, 7);
  const extras = planos.filter(p => p.data >= dHoje && p.data <= diasDepois(6) && !datas.some(d => d.data === p.data)).map(p => ({ data: p.data, hora: '' }));
  const semana = [...datas, ...extras].sort((a, b) => a.data.localeCompare(b.data));
  caixa.append(h('div', { class: 'card' },
    h('h3', { text: 'Seus treinos desta semana' }),
    semana.length
      ? h('ul', { class: 'lista agenda' }, semana.map(({ data, hora: hr }) => h('li', { class: 'agenda-item' },
        h('div', { class: 'agenda-topo' },
          h('b', { text: `${dataLonga(data)}${hr ? ` · ${horaCurta(hr)}` : ''}` }),
          data === dHoje ? h('span', { class: 'etiqueta', text: 'hoje' }) : null),
        planoDe.get(data) ? h('p', { class: 'plano-texto', text: planoDe.get(data) }) : h('p', { class: 'sub', text: 'O professor ainda não planejou esse treino.' }))))
      : h('p', { class: 'sub', style: 'margin-top:6px', text: 'Sua turma ainda não tem dias de treino definidos.' })));

  /* evolução */
  const evolucao = secaoEvolucao(tempos, nadador.nome);
  if (evolucao.length) caixa.append(h('h3', { class: 'titulo-secao', text: 'Sua evolução' }), ...evolucao);
  const cartaoDaPse = cartaoPse(pses, { aoEditar: turma.id && !dados.antigo ? p => responderPse(dados, p.data, p) : null });
  if (cartaoDaPse) caixa.append(cartaoDaPse);

  /* lista de treinos */
  const porData = new Map();
  for (const r of tempos) { if (!porData.has(r.data)) porData.set(r.data, []); porData.get(r.data).push(r); }
  const dias = [...porData.keys()].sort().reverse();
  caixa.append(h('div', { class: 'card' },
    h('h3', { text: 'Seus treinos' }),
    dias.length
      ? h('ul', { class: 'lista' }, dias.map(d => {
        const reps = porData.get(d);
        const cs = combos(reps);
        const [d0, e0] = cs[0];
        return h('li', null, h('a', { class: 'item', href: `#/meu-treino/${d}` },
          h('b', { text: dataLonga(d) }),
          h('span', { class: 'lado', text: fmtTempo(melhorDe(doCombo(reps, d0, e0))) }),
          h('span', { class: 'sub' }, `${reps.length} ${reps.length === 1 ? 'repetição' : 'repetições'} · ${cs.map(([di, es]) => combo(di, es)).join(' e ')}`,
            pseDe.get(d) ? [' · PSE ', chipPse(pseDe.get(d).valor)] : null)));
      }))
      : h('p', { class: 'sub', style: 'margin-top:6px', text: 'Seus tempos aparecem aqui depois do primeiro treino cronometrado.' })));

  caixa.append(rodapeConta());
}

/* ---------- um treino ---------- */
export async function renderTreino(caixa, data) {
  const dados = await carregar();
  const { nadador, tempos, planos } = dados;
  const doDia = tempos.filter(r => r.data === data).sort((a, b) => (a.criadoEm < b.criadoEm ? -1 : 1));
  const plano = planos.find(p => p.data === data);
  const pse = (dados.pses || []).find(p => p.data === data);
  const podeResponder = dados.turma.id && !dados.antigo;

  caixa.append(...[faixaAntigo(dados),
    h('div', null, h('a', { class: 'voltar', href: '#/' }, '← Meus treinos')),
    h('div', { class: 'cabeca' }, h('div', null, h('h2', { text: dataLonga(data) }), h('p', { class: 'sub', text: nadador.nome }))),
    plano ? h('div', { class: 'card plano' }, h('span', { class: 'lbl', text: 'Treino planejado' }), h('p', { class: 'plano-texto', text: plano.descricao })) : null,
    h('div', { class: 'card linha-nuvem' },
      pse ? h('span', null, 'Sua PSE neste treino: ', chipPse(pse.valor), ` ${nivelDe(pse.valor).nome}`) : h('span', { class: 'sub', text: 'Você ainda não marcou a PSE deste treino.' }),
      podeResponder ? h('button', { class: 'btn pequeno', type: 'button', onclick: () => responderPse(dados, data, pse) }, pse ? 'Mudar' : 'Marcar PSE') : null)
  ].filter(Boolean));

  if (!doDia.length) {
    caixa.append(h('div', { class: 'card vazio' }, h('h3', { text: 'Nenhum tempo nesse dia' }), h('a', { class: 'btn', href: '#/' }, 'Voltar')));
    return;
  }
  for (const [dist, estilo] of combos(doDia)) {
    const reps = doCombo(doDia, dist, estilo);
    const recorde = melhorDe(doCombo(tempos, dist, estilo).filter(r => r.data < data));
    caixa.append(h('h3', { class: 'titulo-secao', text: combo(dist, estilo) }),
      ...conteudoRepeticoes({ reps, recorde, nome: nadador.nome, dist, estilo, quando: data === hoje() ? 'hoje' : 'dia' }));
  }
}

function rodapeConta() {
  const p = perfil();
  return h('div', { class: 'card conta' },
    h('span', { class: 'sub', text: `Conta: ${p.email || p.nome || ''}` }),
    h('div', { class: 'acoes' },
      h('button', { class: 'btn pequeno', type: 'button', onclick: async () => { memoria = null; location.reload(); } }, 'Atualizar'),
      botaoConfirmar('Sair', 'Toque de novo para sair', async () => {
        await db.config.set('aluno-cache', null);
        await sair();
        aviso('Você saiu.');
        location.replace(location.pathname + '#/entrar');
        location.reload();
      }, 'btn pequeno fantasma')));
}
