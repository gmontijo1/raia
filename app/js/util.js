// Utilidades compartilhadas: montagem de DOM, tempos, datas e avisos.

export const ESTILOS = ['crawl', 'costas', 'peito', 'borboleta'];
export const DISTANCIAS = [25, 50, 100];
export const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
export const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const MENOS = '−';

export const $ = (sel, raiz = document) => raiz.querySelector(sel);

// Cria um elemento: h('button', { class: 'btn', onclick: fn }, 'Texto', outroElemento)
export function h(tag, attrs, ...filhos) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const k in attrs) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  for (const f of filhos.flat(Infinity)) {
    if (f == null || f === false) continue;
    el.append(f.nodeType ? f : document.createTextNode(String(f)));
  }
  return el;
}

const SVGNS = 'http://www.w3.org/2000/svg';
export function s(tag, attrs) {
  const el = document.createElementNS(SVGNS, tag);
  for (const k in attrs) el.setAttribute(k, attrs[k]);
  return el;
}

export function novoId() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const x = [...b].map(v => v.toString(16).padStart(2, '0')).join('');
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}

/* ---------- tempos ---------- */
export const pad = n => String(n).padStart(2, '0');

// 38.42 -> "38,42"; 62.35 -> "1:02,35"
export function fmtTempo(seg) {
  if (seg == null || !isFinite(seg)) return '–';
  const cs = Math.round(seg * 100);
  const m = Math.floor(cs / 6000), r = cs - m * 6000;
  const s = Math.floor(r / 100), c = pad(r % 100);
  return m ? `${m}:${pad(s)},${c}` : `${s},${c}`;
}
export const fmtDelta = d => (d > 0 ? '+' : MENOS) + fmtTempo(Math.abs(d));

// Aceita "38,42", "38.42", "1:02,35", "1:02.35" e "62,35". Devolve segundos ou null.
export function lerTempo(txt) {
  const t = String(txt || '').trim().replace(/\s/g, '').replace(',', '.');
  if (!t) return null;
  const partes = t.split(':');
  if (partes.length > 2) return null;
  const num = x => (/^\d+(\.\d{1,3})?$/.test(x) ? parseFloat(x) : NaN);
  let seg;
  if (partes.length === 2) {
    const m = /^\d+$/.test(partes[0]) ? +partes[0] : NaN;
    const sg = num(partes[1]);
    if (isNaN(m) || isNaN(sg) || sg >= 60) return null;
    seg = m * 60 + sg;
  } else {
    seg = num(partes[0]);
  }
  if (!isFinite(seg) || seg <= 0 || seg >= 3600) return null;
  return Math.round(seg * 100) / 100;
}

export const dec1 = x => x.toFixed(1).replace('.', ',');
export const dec2 = x => x.toFixed(2).replace('.', ',');
export const combo = (dist, estilo) => `${dist} m ${estilo}`;

/* ---------- datas (sempre no fuso do aparelho) ---------- */
export const isoLocal = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const hoje = () => isoLocal(new Date());
export const agoraISO = () => new Date().toISOString();
const meioDia = iso => new Date(iso + 'T12:00:00');
export const dataCurta = iso => { const p = iso.split('-'); return `${+p[2]} ${MESES[+p[1] - 1]}`; };
export const diaSemana = iso => DIAS[meioDia(iso).getDay()];
export const dataLonga = iso => `${diaSemana(iso)}, ${dataCurta(iso)}`;
export const mesAno = iso => { const p = iso.split('-'); return `${MESES[+p[1] - 1]}/${p[0]}`; };
export const hora = isoOuMs => { const d = new Date(isoOuMs); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };

export const porNome = (a, b) => a.nome.localeCompare(b.nome, 'pt-BR');

/* ---------- contas sobre tempos ---------- */

// Melhor tempo de cada dia de treino, em ordem de data.
export function porTreino(tempos) {
  const m = new Map();
  for (const r of tempos) {
    const c = m.get(r.data);
    if (!c || r.t < c.t) m.set(r.data, { data: r.data, t: r.t, id: r.id });
  }
  return [...m.values()].sort((a, b) => a.data.localeCompare(b.data));
}

// Combinações distância + estilo presentes, com 50 m crawl primeiro.
export function combos(tempos) {
  const vistos = new Map();
  for (const r of tempos) vistos.set(`${r.dist}|${r.estilo}`, [r.dist, r.estilo]);
  const peso = ([d, e]) => ESTILOS.indexOf(e) * 1000 + (d === 50 ? 0 : d);
  return [...vistos.values()].sort((a, b) => peso(a) - peso(b));
}
export const doCombo = (tempos, dist, estilo) => tempos.filter(r => r.dist === dist && r.estilo === estilo);
export const melhorDe = lista => (lista.length ? Math.min(...lista.map(r => r.t)) : null);

/* ---------- avisos ---------- */
let avisoT = 0;
export function aviso(txt) {
  const el = $('#aviso');
  if (!el) return;
  el.textContent = txt;
  el.hidden = false;
  clearTimeout(avisoT);
  avisoT = setTimeout(() => { el.hidden = true; }, 3000);
}

// Botão que pede um segundo toque antes de executar (confirm() é ruim no celular).
export function botaoConfirmar(rotulo, rotuloConfirma, acao, classe = 'btn pequeno perigo') {
  let armado = 0;
  const b = h('button', { class: classe, type: 'button' }, rotulo);
  b.addEventListener('click', async () => {
    if (!armado) {
      b.textContent = rotuloConfirma;
      armado = setTimeout(() => { armado = 0; b.textContent = rotulo; }, 3500);
      return;
    }
    clearTimeout(armado);
    armado = 0;
    b.disabled = true;
    try { await acao(); } finally { b.disabled = false; b.textContent = rotulo; }
  });
  return b;
}

// Pergunta com dois botões, que sobe da parte de baixo no celular. Resolve true (confirmou) ou false.
export function perguntar({ titulo, texto, botao }) {
  return new Promise(resolve => {
    const dlg = h('dialog', { class: 'pergunta', 'aria-labelledby': 'pergunta-titulo' });
    const fim = ok => { dlg.close(); dlg.remove(); resolve(ok); };
    dlg.append(
      h('h3', { id: 'pergunta-titulo', text: titulo }),
      texto ? h('p', { class: 'sub', text: texto }) : null,
      h('div', { class: 'acoes-coluna' },
        h('button', { class: 'btn primario grande', type: 'button', onclick: () => fim(true) }, botao),
        h('button', { class: 'btn grande fantasma', type: 'button', onclick: () => fim(false) }, 'Cancelar')));
    dlg.addEventListener('cancel', e => { e.preventDefault(); fim(false); });
    document.body.append(dlg);
    dlg.showModal();
  });
}

export function naoEncontrado(oque) {
  return h('div', { class: 'card vazio' },
    h('h3', { text: `${oque} não encontrado` }),
    h('p', { text: 'Talvez tenha sido arquivado ou apagado neste aparelho.' }),
    h('a', { class: 'btn', href: '#/' }, 'Voltar para as turmas'));
}
