// "Compartilhar resumo": monta uma imagem do resumo do treino (faixa com o logo, números do
// dia e recordes) e um texto, e entrega para o compartilhamento do celular (WhatsApp etc.).
// No computador sem compartilhamento, baixa a imagem e copia o texto.

import { h, fmtTempo, combo, dataLonga } from './util.js';
import { NOME_PROJETO } from './marca.js';

const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

export function textoResumo({ turma, data, res }) {
  const linhas = [
    `Resumo do treino · ${turma.nome}`, dataLonga(data), '',
    [plural(res.nadadores, 'nadador', 'nadadores'), plural(res.repeticoes, 'repetição', 'repetições'),
      plural(res.recordes.length, 'recorde', 'recordes')].join(' · ')
  ];
  if (res.recordes.length) {
    linhas.push('', 'Recordes do dia');
    for (const r of res.recordes) linhas.push(`★ ${r.nome}: ${fmtTempo(r.melhor)} nos ${combo(r.dist, r.estilo)}`);
  }
  linhas.push('', `Raia · ${NOME_PROJETO}`);
  return linhas.join('\n');
}

const carregarImagem = src => new Promise((ok, falha) => {
  const img = new Image();
  img.onload = () => ok(img);
  img.onerror = () => falha(new Error(`não carregou ${src}`));
  img.src = src;
});

// Corta o texto com "…" para caber na largura.
function caber(ctx, texto, largura) {
  if (ctx.measureText(texto).width <= largura) return texto;
  let t = texto;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > largura) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

// Desenha o cartão do resumo nas cores do tema atual. Medidas em px de tela (360 de largura), x3.
async function desenhar({ turma, data, res }) {
  const css = getComputedStyle(document.documentElement);
  const cor = nome => css.getPropertyValue(`--${nome}`).trim();
  await Promise.all(['800 20px "Big Shoulders Display"', '600 20px "IBM Plex Mono"', '400 20px "IBM Plex Sans"', '600 20px "IBM Plex Sans"']
    .map(f => document.fonts.load(f).catch(() => null)));
  const logo = await carregarImagem('marca/logo-completo.png');

  const K = 3, W = 360, P = 16, MAX = 6;
  const recs = res.recordes.slice(0, MAX);
  const extra = res.recordes.length - recs.length;
  const LOGO_L = 150, LOGO_A = Math.round(LOGO_L * logo.naturalHeight / logo.naturalWidth);
  const FAIXA = 24 + LOGO_A + 10 + 16 + 18 + 30 + 6 + 14 + 20;
  const LINHA = 48;
  const H = FAIXA + 5 + 16 + 16 + 8 + (recs.length ? recs.length * LINHA : 32) + (extra ? 24 : 0) + 8 + 42;

  const tela = document.createElement('canvas');
  tela.width = W * K;
  tela.height = H * K;
  const ctx = tela.getContext('2d');
  ctx.scale(K, K);
  const espacar = v => { if ('letterSpacing' in ctx) ctx.letterSpacing = v; };

  ctx.fillStyle = cor('surface');
  ctx.fillRect(0, 0, W, H);

  /* faixa azul com o logo, a turma e os números */
  ctx.fillStyle = cor('accent');
  ctx.fillRect(0, 0, W, FAIXA);
  const tinta = document.createElement('canvas');
  tinta.width = LOGO_L * K;
  tinta.height = LOGO_A * K;
  const t2 = tinta.getContext('2d');
  t2.drawImage(logo, 0, 0, tinta.width, tinta.height);
  t2.globalCompositeOperation = 'source-in';
  t2.fillStyle = cor('accent-ink');
  t2.fillRect(0, 0, tinta.width, tinta.height);
  ctx.drawImage(tinta, (W - LOGO_L) / 2, 24, LOGO_L, LOGO_A);

  let y = 24 + LOGO_A + 10;
  ctx.fillStyle = cor('accent-ink');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.font = '600 12px "IBM Plex Sans"';
  espacar('1px');
  ctx.fillText(caber(ctx, `${turma.nome} · ${dataLonga(data)}`.toUpperCase(), W - 2 * P), W / 2, y + 12);
  y += 16 + 18;
  const numeros = [[res.nadadores, 'NADADORES'], [res.repeticoes, 'REPETIÇÕES'], [res.recordes.length, 'RECORDES']];
  numeros.forEach(([v, rotulo], i) => {
    const x = (W / 6) * (2 * i + 1);
    espacar('0px');
    ctx.font = '600 30px "IBM Plex Mono"';
    ctx.fillText(String(v), x, y + 26);
    espacar('1px');
    ctx.font = '600 11px "IBM Plex Sans"';
    ctx.fillText(rotulo, x, y + 30 + 6 + 11);
  });
  espacar('0px');

  /* corda de raia */
  y = FAIXA;
  const faixas = [cor('rope'), cor('accent'), cor('surface'), cor('accent')];
  for (let x = 0, i = 0; x < W; x += 12, i++) { ctx.fillStyle = faixas[i % 4]; ctx.fillRect(x, y, 12, 5); }
  y += 5 + 16;

  /* recordes do dia */
  ctx.textAlign = 'left';
  ctx.fillStyle = cor('muted');
  ctx.font = '600 12px "IBM Plex Sans"';
  espacar('1px');
  ctx.fillText('RECORDES DO DIA', P, y + 12);
  espacar('0px');
  y += 16 + 8;
  if (!recs.length) {
    ctx.fillStyle = cor('ink-2');
    ctx.font = '400 14px "IBM Plex Sans"';
    ctx.fillText('Nenhum recorde hoje.', P, y + 20);
    y += 32;
  }
  recs.forEach((r, i) => {
    if (i) { ctx.fillStyle = cor('line'); ctx.fillRect(P, y, W - 2 * P, 1); }
    ctx.font = '600 12px "IBM Plex Sans"';
    const chipL = ctx.measureText('Recorde').width + 16;
    const chipX = W - P - chipL;
    ctx.fillStyle = cor('good-soft');
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(chipX, y + 14, chipL, 20, 10); else ctx.rect(chipX, y + 14, chipL, 20);
    ctx.fill();
    ctx.fillStyle = cor('good-text');
    ctx.fillText('Recorde', chipX + 8, y + 28);
    ctx.fillStyle = cor('ink');
    ctx.font = '600 18px "IBM Plex Mono"';
    ctx.fillText(fmtTempo(r.melhor), P, y + 30);
    const xNome = P + 82, largNome = chipX - 8 - xNome;
    ctx.font = '600 15px "IBM Plex Sans"';
    ctx.fillText(caber(ctx, r.nome, largNome), xNome, y + 21);
    ctx.fillStyle = cor('muted');
    ctx.font = '400 12px "IBM Plex Sans"';
    ctx.fillText(caber(ctx, combo(r.dist, r.estilo), largNome), xNome, y + 38);
    y += LINHA;
  });
  if (extra) {
    ctx.fillStyle = cor('ink-2');
    ctx.font = '400 13px "IBM Plex Sans"';
    ctx.fillText(`+ ${plural(extra, 'recorde', 'recordes')}`, P, y + 16);
    y += 24;
  }

  /* rodapé */
  ctx.textAlign = 'center';
  ctx.fillStyle = cor('muted');
  ctx.font = '400 11px "IBM Plex Sans"';
  ctx.fillText(`Raia · ${NOME_PROJETO}`, W / 2, H - 16);

  return new Promise((ok, falha) => tela.toBlob(b => (b ? ok(b) : falha(new Error('imagem vazia'))), 'image/png'));
}

export async function prepararImagem(dados) {
  const blob = await desenhar(dados);
  return new File([blob], `resumo-treino-${dados.data}.png`, { type: 'image/png' });
}

// Devolve o que aconteceu: 'ok', 'cancelado', 'baixou-copiou', 'baixou', 'copiou' ou 'falhou'.
export async function compartilhar(arquivo, texto, titulo) {
  try {
    if (arquivo && navigator.canShare && navigator.canShare({ files: [arquivo] })) {
      await navigator.share({ files: [arquivo], title: titulo, text: texto });
      return 'ok';
    }
    if (navigator.share) {
      await navigator.share({ title: titulo, text: texto });
      return 'ok';
    }
  } catch (e) {
    if (e && e.name === 'AbortError') return 'cancelado';
  }
  if (arquivo) {
    const a = h('a', { href: URL.createObjectURL(arquivo), download: arquivo.name });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }
  let copiou = false;
  try { await navigator.clipboard.writeText(texto); copiou = true; } catch (e) { /* sem permissão para copiar */ }
  if (arquivo) return copiou ? 'baixou-copiou' : 'baixou';
  return copiou ? 'copiou' : 'falhou';
}
