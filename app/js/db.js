// Banco local (IndexedDB). Tudo o que o app registra fica guardado primeiro no próprio
// aparelho; com a nuvem ligada, `sincronia.js` envia e recebe as mudanças.
//
// Pensado para sincronizar:
// - todo registro tem id gerado no aparelho (sem colisão entre aparelhos);
// - nada é apagado de verdade: `apagado: true` (para a remoção também sincronizar);
// - `atualizadoEm` em toda gravação local decide quem ganha num conflito.

import { novoId, agoraISO, porNome } from './util.js';

const NOME = 'raia';
const VERSAO = 2;
let conexao = null;

// Avisa o resto do app que algo foi gravado aqui (a sincronização escuta isso).
const avisarMudanca = () => window.dispatchEvent(new CustomEvent('raia:mudou'));

function abrir() {
  if (conexao) return conexao;
  conexao = new Promise((ok, falha) => {
    const req = indexedDB.open(NOME, VERSAO);
    req.onupgradeneeded = e => {
      const db = req.result;
      if (e.oldVersion < 1) {
        db.createObjectStore('turmas', { keyPath: 'id' });
        const nad = db.createObjectStore('nadadores', { keyPath: 'id' });
        nad.createIndex('turmaId', 'turmaId');
        const tempos = db.createObjectStore('tempos', { keyPath: 'id' });
        tempos.createIndex('nadadorId', 'nadadorId');
        tempos.createIndex('turmaId', 'turmaId');
        db.createObjectStore('config');
      }
      if (e.oldVersion < 2) {
        const planos = db.createObjectStore('planos', { keyPath: 'id' });
        planos.createIndex('turmaId', 'turmaId');
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => db.close();
      ok(db);
    };
    req.onerror = () => { conexao = null; falha(req.error); };
    req.onblocked = () => falha(new Error('Feche as outras abas do Raia e recarregue.'));
  });
  return conexao;
}

const pedido = req => new Promise((ok, falha) => {
  req.onsuccess = () => ok(req.result);
  req.onerror = () => falha(req.error);
});

async function loja(nome, modo = 'readonly') {
  const db = await abrir();
  return db.transaction(nome, modo).objectStore(nome);
}
async function todos(nome, indice, valor) {
  const st = await loja(nome);
  return pedido(indice ? st.index(indice).getAll(valor) : st.getAll());
}
async function um(nome, id) {
  const st = await loja(nome);
  return pedido(st.get(id));
}
async function gravar(nome, obj) {
  obj.atualizadoEm = agoraISO();
  const st = await loja(nome, 'readwrite');
  await pedido(st.put(obj));
  avisarMudanca();
  return obj;
}
async function gravarVarios(nome, lista) {
  if (!lista.length) return 0;
  const db = await abrir();
  return new Promise((ok, falha) => {
    const tx = db.transaction(nome, 'readwrite');
    const st = tx.objectStore(nome);
    for (const o of lista) st.put(o);
    tx.oncomplete = () => ok(lista.length);
    tx.onerror = () => falha(tx.error);
    tx.onabort = () => falha(tx.error);
  });
}

/* ---------- configurações ---------- */
export const config = {
  async get(chave, padrao) {
    const st = await loja('config');
    const v = await pedido(st.get(chave));
    return v === undefined ? padrao : v;
  },
  async set(chave, valor) {
    const st = await loja('config', 'readwrite');
    await pedido(st.put(valor, chave));
  }
};

let dispositivo = null;
export async function dispositivoId() {
  if (dispositivo) return dispositivo;
  dispositivo = await config.get('dispositivoId');
  if (!dispositivo) {
    dispositivo = novoId();
    await config.set('dispositivoId', dispositivo);
  }
  return dispositivo;
}

/* ---------- turmas ---------- */
export async function listarTurmas({ incluirArquivadas = false } = {}) {
  const l = await todos('turmas');
  return l.filter(t => !t.apagado && (incluirArquivadas || !t.arquivada)).sort(porNome);
}
export const turma = id => um('turmas', id);
export function salvarTurma(t) {
  return gravar('turmas', { id: novoId(), criadoEm: agoraISO(), arquivada: false, apagado: false, ...t });
}

/* ---------- nadadores ---------- */
export async function nadadoresDaTurma(turmaId, { incluirArquivados = false } = {}) {
  const l = await todos('nadadores', 'turmaId', turmaId);
  return l.filter(n => !n.apagado && (incluirArquivados || !n.arquivado)).sort(porNome);
}
export const nadador = id => um('nadadores', id);
export function salvarNadador(n) {
  return gravar('nadadores', { id: novoId(), criadoEm: agoraISO(), arquivado: false, apagado: false, ...n });
}
export async function salvarNadadores(lista) {
  const agora = agoraISO();
  const objs = lista.map(n => ({ id: novoId(), criadoEm: agora, atualizadoEm: agora, arquivado: false, apagado: false, ...n }));
  await gravarVarios('nadadores', objs);
  avisarMudanca();
  return objs;
}

/* ---------- treinos planejados (um por turma e data) ---------- */
export async function planosDaTurma(turmaId) {
  return (await todos('planos', 'turmaId', turmaId)).filter(p => !p.apagado);
}
// Texto vazio apaga o plano daquela data.
export async function salvarPlano(turmaId, data, descricao) {
  const existente = (await todos('planos', 'turmaId', turmaId)).find(p => p.data === data);
  const texto = descricao.trim();
  if (existente) return gravar('planos', { ...existente, descricao: texto || existente.descricao, apagado: !texto });
  if (!texto) return null;
  return gravar('planos', { id: novoId(), criadoEm: agoraISO(), turmaId, data, descricao: texto, apagado: false });
}

/* ---------- tempos ---------- */
export async function temposDoNadador(nadadorId) {
  return (await todos('tempos', 'nadadorId', nadadorId)).filter(t => !t.apagado);
}
export async function temposDaTurma(turmaId) {
  return (await todos('tempos', 'turmaId', turmaId)).filter(t => !t.apagado);
}
export async function registrarTempo(r) {
  return gravar('tempos', {
    id: novoId(), criadoEm: agoraISO(), dispositivo: await dispositivoId(),
    origem: 'cronometro', apagado: false, sincronizado: false, ...r
  });
}
export async function apagarTempo(id) {
  const t = await um('tempos', id);
  if (!t) return null;
  t.apagado = true;
  t.sincronizado = false;
  return gravar('tempos', t);
}

/* ---------- números gerais ---------- */
export async function contagem() {
  const [t, n, r] = await Promise.all([todos('turmas'), todos('nadadores'), todos('tempos')]);
  const vivos = l => l.filter(o => !o.apagado);
  return { turmas: vivos(t).length, nadadores: vivos(n).length, tempos: vivos(r).length };
}

/* ---------- cópia de segurança ---------- */
const LOJAS_DADOS = ['turmas', 'nadadores', 'tempos', 'planos'];

export async function exportarTudo() {
  const [turmas, nadadores, tempos, planos] = await Promise.all(LOJAS_DADOS.map(n => todos(n)));
  return { app: 'raia', formato: 2, exportadoEm: agoraISO(), dispositivo: await dispositivoId(), turmas, nadadores, tempos, planos };
}

// Mescla registros com o que já existe: fica a versão mais recente de cada um (pelo
// `atualizadoEm`). Usado pela cópia de segurança e pela sincronização com a nuvem.
// Devolve quantos registros mudaram de verdade (a mesma versão de novo não conta).
export async function mesclar(nome, registros) {
  const atuais = new Map((await todos(nome)).map(o => [o.id, o]));
  const novos = registros.filter(o => o && typeof o.id === 'string' &&
    (!atuais.has(o.id) || String(o.atualizadoEm || '') > String(atuais.get(o.id).atualizadoEm || '')));
  return gravarVarios(nome, novos);
}

export async function importarTudo(b) {
  if (!b || b.app !== 'raia' || !Array.isArray(b.turmas) || !Array.isArray(b.nadadores) || !Array.isArray(b.tempos)) {
    throw new Error('Esse arquivo não é uma cópia de segurança do Raia.');
  }
  let total = 0;
  for (const nome of LOJAS_DADOS) total += await mesclar(nome, b[nome] || []);
  if (total) avisarMudanca();
  return total;
}

// Leitura crua de uma loja inteira (para a sincronização).
export const todosDe = nome => todos(nome);

// Só para a turma de exemplo: remove de vez (são dados inventados, não precisam de histórico).
export async function apagarTurmaDeVez(turmaId) {
  const [nads, temps, plans] = await Promise.all([todos('nadadores', 'turmaId', turmaId), todos('tempos', 'turmaId', turmaId), todos('planos', 'turmaId', turmaId)]);
  const db = await abrir();
  return new Promise((ok, falha) => {
    const tx = db.transaction(['turmas', 'nadadores', 'tempos', 'planos'], 'readwrite');
    tx.objectStore('turmas').delete(turmaId);
    nads.forEach(n => tx.objectStore('nadadores').delete(n.id));
    temps.forEach(t => tx.objectStore('tempos').delete(t.id));
    plans.forEach(p => tx.objectStore('planos').delete(p.id));
    tx.oncomplete = () => ok();
    tx.onerror = () => falha(tx.error);
  });
}
export async function gravarExemplo(turma, nadadores, tempos) {
  await gravarVarios('turmas', [turma]);
  await gravarVarios('nadadores', nadadores);
  await gravarVarios('tempos', tempos);
}

/* ---------- armazenamento protegido (o navegador não apaga sozinho) ---------- */
export async function armazenamentoProtegido() {
  try { return !!(navigator.storage && navigator.storage.persisted && await navigator.storage.persisted()); }
  catch (e) { return false; }
}
export async function protegerArmazenamento() {
  try { return !!(navigator.storage && navigator.storage.persist && await navigator.storage.persist()); }
  catch (e) { return false; }
}
