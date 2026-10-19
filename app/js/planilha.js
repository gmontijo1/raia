// Lê a planilha do Excel (.xlsx) do planejamento direto no aparelho, sem biblioteca:
// o .xlsx é um zip de XMLs. Usado por "Trazer da planilha" na tela Semanas: cada aba de
// semana ("19 a 2410", "2610 a 3110"…) traz os treinos Dia 1, 2, 3 da semana que começa ali.

/* ---------- zip ---------- */
async function abrirZip(buf) {
  const v = new DataView(buf);
  let fim = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 65557); i--) {
    if (v.getUint32(i, true) === 0x06054b50) { fim = i; break; }
  }
  if (fim < 0) throw new Error('Esse arquivo não é uma planilha .xlsx. No Excel, use Salvar como → Pasta de Trabalho do Excel (.xlsx).');
  const total = v.getUint16(fim + 10, true);
  let p = v.getUint32(fim + 16, true);
  const entradas = new Map();
  for (let k = 0; k < total; k++) {
    const metodo = v.getUint16(p + 10, true), tamanho = v.getUint32(p + 20, true);
    const nLen = v.getUint16(p + 28, true), xLen = v.getUint16(p + 30, true), cLen = v.getUint16(p + 32, true);
    const local = v.getUint32(p + 42, true);
    const nome = new TextDecoder().decode(new Uint8Array(buf, p + 46, nLen));
    entradas.set(nome, { metodo, tamanho, local });
    p += 46 + nLen + xLen + cLen;
  }
  return async nome => {
    const e = entradas.get(nome);
    if (!e) return null;
    const ini = e.local + 30 + v.getUint16(e.local + 26, true) + v.getUint16(e.local + 28, true);
    const dados = new Uint8Array(buf, ini, e.tamanho);
    if (e.metodo === 0) return new TextDecoder().decode(dados);
    if (typeof DecompressionStream === 'undefined') throw new Error('Este navegador é antigo para ler a planilha. Use o Chrome, o Edge ou o Safari atualizados.');
    const fluxo = new Blob([dados]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Response(fluxo).text();
  };
}

/* ---------- planilha: { nomeDaAba: { linha: { coluna: texto } } } ---------- */
const xml = t => new DOMParser().parseFromString(t, 'application/xml');
const filhos = (el, nome) => [...el.getElementsByTagNameNS('*', nome)];
const coluna = ref => [...ref.match(/^[A-Z]+/)[0]].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);

export async function lerPlanilha(arquivo) {
  const ler = await abrirZip(await arquivo.arrayBuffer());
  const textos = await ler('xl/sharedStrings.xml');
  const compartilhados = textos ? filhos(xml(textos), 'si').map(si => filhos(si, 't').map(t => t.textContent).join('')) : [];
  const livro = await ler('xl/workbook.xml');
  if (!livro) throw new Error('Esse arquivo não é uma planilha .xlsx.');
  const rels = new Map(filhos(xml(await ler('xl/_rels/workbook.xml.rels')), 'Relationship').map(r => [r.getAttribute('Id'), r.getAttribute('Target')]));
  const abas = {};
  for (const aba of filhos(xml(livro), 'sheet')) {
    const alvo = rels.get(aba.getAttribute('r:id') || aba.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id')) || '';
    const conteudo = await ler(alvo.startsWith('/') ? alvo.slice(1) : `xl/${alvo}`);
    if (!conteudo) continue;
    const linhas = {};
    for (const row of filhos(xml(conteudo), 'row')) {
      for (const c of filhos(row, 'c')) {
        const tipo = c.getAttribute('t'), vEl = filhos(c, 'v')[0];
        let val = null;
        if (tipo === 's' && vEl) val = compartilhados[+vEl.textContent];
        else if (tipo === 'inlineStr') val = filhos(c, 't').map(t => t.textContent).join('');
        else if (vEl) val = vEl.textContent;
        if (val == null || !String(val).trim()) continue;
        (linhas[+row.getAttribute('r')] ||= {})[coluna(c.getAttribute('r'))] = String(val).trim();
      }
    }
    abas[aba.getAttribute('name')] = linhas;
  }
  return abas;
}

/* ---------- abas de semana ---------- */
const semAcento = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
const pad = n => String(n).padStart(2, '0');

// "05 a 1010", "3108 a 0409", "19 a 24/10", "19/10 a 24/10" → { dia, mes } do início
export function inicioDaAba(nome) {
  const m = String(nome).trim().match(/^(\d{1,2})(?:[/.-]?(\d{2}))?\s*(?:a|à|ate|até|-)\s*(\d{1,2})[/.-]?(\d{2})$/i);
  if (!m) return null;
  const dia = +m[1], diaFim = +m[3], mesFim = +m[4];
  let mes = m[2] ? +m[2] : mesFim;
  if (!m[2] && dia > diaFim) mes = mesFim === 1 ? 12 : mesFim - 1;   // "28 a 0210": começa no mês anterior
  return dia >= 1 && dia <= 31 && mes >= 1 && mes <= 12 ? { dia, mes } : null;
}

// Números do Excel ("400.0") viram "400"; texto fica como está, com os espaços arrumados.
const valor = v => (v === undefined ? '' : /^-?\d+(\.\d+)?$/.test(v) ? (Number.isInteger(+v) ? String(+v) : String(+v).replace('.', ',')) : v.replace(/[ \t]+/g, ' ').trim());

// Os treinos de uma aba: blocos "DIA n" com AQUECIMENTO, PARTE PRINCIPAL, SOLTURA e TOTAL
// (coluna A = parte, B = o nado, C = observações).
export function treinosDaAba(linhas) {
  const saida = [];
  let atual = null;
  for (const r of Object.keys(linhas).map(Number).sort((a, b) => a - b)) {
    const a = semAcento(linhas[r][1]), b = linhas[r][2], c = linhas[r][3];
    const m = a.match(/^DIA\s*(\d+)/);
    if (m) { atual = { dia: +m[1] }; saida.push(atual); continue; }
    if (!atual) continue;
    if (a.startsWith('AQUECIMENTO')) { atual.aquecimento = valor(b); atual.aquecimentoObs = valor(c); }
    else if (a.startsWith('PARTE PRINCIPAL')) { atual.principal = valor(b); atual.principalObs = valor(c); }
    else if (a.startsWith('SOLTURA')) { atual.soltura = valor(b); atual.solturaObs = valor(c); }
    else if (a.startsWith('TOTAL')) { const n = Math.round(Number(b)); atual.total = b && isFinite(n) && n > 0 ? n : null; }
  }
  return saida.filter(t => t.aquecimento || t.principal || t.soltura || t.total);
}

// Mesma forma do editor de semana, para comparar o que veio com o que já está no app.
const CAMPOS = ['aquecimento', 'aquecimentoObs', 'principal', 'principalObs', 'soltura', 'solturaObs'];
export const iguais = (a, b) => {
  const forma = l => JSON.stringify((l || []).slice().sort((x, y) => x.dia - y.dia)
    .map(t => [t.dia, ...CAMPOS.map(k => String(t[k] ?? '').replace(/\s+/g, ' ').trim()), Number(t.total) || null]));
  return forma(a) === forma(b);
};

// Casa cada aba de semana com uma semana do planejamento (a que contém a data de início da aba).
// Devolve { achadas: [{ aba, semana, treinos, situacao: 'nova' | 'muda' | 'igual' }], soltas: [{ aba, motivo }] }
export function semanasDaPlanilha(abas, semanas) {
  const achadas = [], soltas = [];
  for (const [nome, linhas] of Object.entries(abas)) {
    const ini = inicioDaAba(nome);
    if (!ini) continue;
    const treinos = treinosDaAba(linhas);
    const semana = semanas.find(s => {
      const data = `${s.inicio.slice(0, 4)}-${pad(ini.mes)}-${pad(ini.dia)}`;
      const fim = new Date(`${s.inicio}T12:00:00`); fim.setDate(fim.getDate() + 6);
      return data >= s.inicio && data <= `${fim.getFullYear()}-${pad(fim.getMonth() + 1)}-${pad(fim.getDate())}`;
    });
    if (!treinos.length) { soltas.push({ aba: nome, motivo: 'não achei os blocos DIA 1, DIA 2… nessa aba' }); continue; }
    if (!semana) { soltas.push({ aba: nome, motivo: `nenhuma semana do planejamento tem o dia ${pad(ini.dia)}/${pad(ini.mes)}` }); continue; }
    const situacao = !(semana.treinos || []).length ? 'nova' : iguais(semana.treinos, treinos) ? 'igual' : 'muda';
    achadas.push({ aba: nome, semana, treinos, situacao });
  }
  achadas.sort((a, b) => a.semana.inicio.localeCompare(b.semana.inicio));
  return { achadas, soltas };
}
