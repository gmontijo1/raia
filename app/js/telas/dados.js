// Tela de dados: onde os tempos estão guardados, cópia de segurança e exportação para o Excel.

import { h, aviso, fmtTempo, dec2, hoje, botaoConfirmar } from '../util.js';
import * as db from '../db.js';
import { VERSAO_APP } from '../versao.js';
import { nuvemLigada, perfil, sair } from '../nuvem.js';
import { sincronizar, aoMudarEstado, contarPendentes } from '../sincronia.js';

const PAPEL = { master: 'master', professor: 'professor' };

// Conta de quem entrou, situação da sincronização e botão de sair.
function cartaoConta() {
  const p = perfil();
  const situacao = h('p', { class: 'sub' });
  let confirmouPerda = false;
  const parar = aoMudarEstado(e => {
    const quando = e.ultimaVez ? ` Última vez: ${new Date(e.ultimaVez).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}.` : '';
    situacao.textContent = {
      enviando: 'Sincronizando agora…',
      ok: e.pendentes ? `${e.pendentes} registros esperando para subir.${quando}` : `Tudo sincronizado com a nuvem.${quando}`,
      offline: `Sem internet. ${e.pendentes ? `${e.pendentes} registros esperando para subir.` : 'Nada esperando.'}`,
      erro: `Não deu para sincronizar: ${e.erro}`,
      parado: 'Ainda não sincronizou nesta abertura do app.'
    }[e.fase] || '';
  });
  const card = h('div', { class: 'card' },
    h('h3', { text: 'Sua conta' }),
    h('p', { class: 'dica', style: 'margin-top:6px', text: `${p.nome || p.email} · ${p.email && p.nome ? `${p.email} · ` : ''}${PAPEL[p.papel] || p.papel}` }),
    situacao,
    h('div', { class: 'acoes', style: 'margin-top:12px' },
      h('button', { class: 'btn', type: 'button', onclick: () => sincronizar() }, 'Sincronizar agora'),
      botaoConfirmar('Sair da conta', 'Toque de novo para sair', async () => {
        const pend = await contarPendentes();
        if (pend && !confirmouPerda) { confirmouPerda = true; aviso(`Atenção: ${pend} registros ainda não subiram. Conecte à internet ou toque em Sair de novo para sair mesmo assim.`); return; }
        await sair();
        location.replace(location.pathname + '#/entrar');
        location.reload();
      }, 'btn fantasma')));
  // para de ouvir quando a tela sai
  new MutationObserver((_, obs) => { if (!card.isConnected) { parar(); obs.disconnect(); } }).observe(document.getElementById('tela'), { childList: true });
  return card;
}

function baixar(nomeArquivo, conteudo, tipo) {
  const url = URL.createObjectURL(new Blob([conteudo], { type: tipo }));
  const a = h('a', { href: url, download: nomeArquivo });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// Uma linha por tempo. Separador ";" e vírgula decimal: abre direto no Excel em português.
async function planilha() {
  const b = await db.exportarTudo();
  const turmas = new Map(b.turmas.map(t => [t.id, t.nome]));
  const nads = new Map(b.nadadores.map(n => [n.id, n.nome]));
  const campo = v => { const s = String(v ?? ''); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const linhas = [['turma', 'nadador', 'data', 'distancia_m', 'estilo', 'tempo_s', 'tempo', 'repeticao', 'origem'].join(';')];
  b.tempos.filter(r => !r.apagado)
    .sort((x, y) => (x.data === y.data ? (x.criadoEm < y.criadoEm ? -1 : 1) : x.data < y.data ? -1 : 1))
    .forEach(r => linhas.push([turmas.get(r.turmaId), nads.get(r.nadadorId), r.data, r.dist, r.estilo, dec2(r.t), fmtTempo(r.t), r.rep, r.origem].map(campo).join(';')));
  return '﻿' + linhas.join('\r\n');
}

export async function render(caixa) {
  const [n, protegido] = await Promise.all([db.contagem(), db.armazenamentoProtegido()]);

  caixa.append(h('div', { class: 'cabeca' },
    h('div', null, h('h2', { text: 'Dados' }), h('p', { class: 'sub', text: 'Onde ficam os tempos, cópia de segurança e planilha.' }))));
  const nuvem = nuvemLigada() && perfil();
  if (nuvem) caixa.append(cartaoConta());

  const estadoProtecao = h('p', { class: 'sub' });
  const pintarProtecao = ok => {
    estadoProtecao.textContent = ok
      ? 'Armazenamento protegido: o navegador não apaga esses dados sozinho.'
      : 'Armazenamento ainda não protegido: se o aparelho ficar sem espaço, o navegador pode apagar os dados. Faça cópias de segurança.';
  };
  pintarProtecao(protegido);
  caixa.append(h('div', { class: 'card' },
    h('h3', { text: 'Neste aparelho' }),
    h('p', { class: 'dica', style: 'margin-top:8px' },
      `${n.turmas} ${n.turmas === 1 ? 'turma' : 'turmas'}, ${n.nadadores} ${n.nadadores === 1 ? 'nadador' : 'nadadores'} e ${n.tempos} ${n.tempos === 1 ? 'tempo' : 'tempos'}. `,
      nuvem
        ? 'Tudo é gravado primeiro neste aparelho (funciona sem internet) e sobe para a nuvem sozinho quando há conexão. A turma de exemplo fica só aqui.'
        : 'Por enquanto tudo fica guardado só neste aparelho, e funciona sem internet.'),
    h('div', { class: 'acoes', style: 'margin-top:12px' },
      protegido ? null : h('button', {
        class: 'btn', type: 'button',
        onclick: async e => {
          const ok = await db.protegerArmazenamento();
          pintarProtecao(ok);
          if (ok) e.currentTarget.remove();
          else aviso('O navegador não deixou proteger agora. Instalar o app na tela inicial costuma resolver.');
        }
      }, 'Proteger os dados'),
      estadoProtecao)));

  /* planilha */
  const msg = h('p', { class: 'sub', role: 'status' });
  caixa.append(h('div', { class: 'card' },
    h('h3', { text: 'Planilha para o Excel' }),
    h('p', { class: 'dica', style: 'margin-top:8px', text: 'Todos os tempos, um por linha, com turma, nadador, data, distância e estilo.' }),
    h('div', { class: 'acoes', style: 'margin-top:12px' },
      h('button', { class: 'btn primario', type: 'button', onclick: async () => { baixar(`raia-tempos-${hoje()}.csv`, await planilha(), 'text/csv;charset=utf-8'); msg.textContent = 'Planilha baixada. Abra o arquivo no Excel.'; } }, 'Baixar planilha'),
      msg)));

  /* backup */
  const arquivo = h('input', { type: 'file', id: 'backup-arquivo', accept: '.json,application/json', hidden: true });
  const msgB = h('p', { class: 'sub', role: 'status' });
  arquivo.addEventListener('change', async () => {
    const f = arquivo.files[0];
    if (!f) return;
    try {
      const total = await db.importarTudo(JSON.parse(await f.text()));
      msgB.textContent = total ? `Cópia restaurada: ${total} registros novos ou atualizados.` : 'Nada novo nessa cópia: este aparelho já tinha tudo.';
    } catch (e) {
      msgB.textContent = e instanceof SyntaxError ? 'Esse arquivo está danificado ou não é uma cópia do Raia.' : e.message;
    }
    arquivo.value = '';
  });
  caixa.append(h('div', { class: 'card' },
    h('h3', { text: 'Cópia de segurança' }),
    h('p', { class: 'dica', style: 'margin-top:8px', text: 'Baixe uma cópia de vez em quando e guarde no Drive ou mande para o seu e-mail. Para passar os dados para outro aparelho, restaure a cópia nele: o que já existe é mantido, e entra só o que é novo.' }),
    h('div', { class: 'acoes', style: 'margin-top:12px' },
      h('button', { class: 'btn', type: 'button', onclick: async () => { baixar(`raia-copia-${hoje()}.json`, JSON.stringify(await db.exportarTudo()), 'application/json'); msgB.textContent = 'Cópia baixada.'; } }, 'Baixar cópia'),
      h('label', { class: 'btn fantasma', for: 'backup-arquivo', tabindex: 0, onkeydown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); arquivo.click(); } } }, 'Restaurar cópia'),
      arquivo, msgB)));

  caixa.append(h('p', { class: 'rodape', text: `Raia versão ${VERSAO_APP} · ${nuvem ? 'dados sincronizados com a nuvem' : 'nenhum dado sai deste aparelho'}` }));
}
