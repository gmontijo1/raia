// Sincronização com a nuvem (só professores e master): envia o que foi gravado neste
// aparelho e baixa o que outros aparelhos gravaram. Sem internet, só espera; nada se perde,
// porque tudo já está guardado no aparelho.

import * as db from './db.js';
import { sb, explicar } from './nuvem.js';

// Nome no aparelho → nome na nuvem, por tabela.
const TABELAS = [
  { nome: 'turmas', campos: { id: 'id', nome: 'nome', horario: 'horario', agenda: 'agenda', arquivada: 'arquivada', apagado: 'apagado', criadoEm: 'criado_em', atualizadoEm: 'atualizado_em' } },
  { nome: 'nadadores', campos: { id: 'id', turmaId: 'turma_id', nome: 'nome', arquivado: 'arquivado', apagado: 'apagado', criadoEm: 'criado_em', atualizadoEm: 'atualizado_em' } },
  { nome: 'tempos', campos: { id: 'id', turmaId: 'turma_id', nadadorId: 'nadador_id', data: 'data', dist: 'dist', estilo: 'estilo', t: 't', rep: 'rep', origem: 'origem', dispositivo: 'dispositivo', apagado: 'apagado', criadoEm: 'criado_em', atualizadoEm: 'atualizado_em' } },
  { nome: 'planos', campos: { id: 'id', turmaId: 'turma_id', data: 'data', descricao: 'descricao', apagado: 'apagado', criadoEm: 'criado_em', atualizadoEm: 'atualizado_em' } },
  // Opcionais: se a tabela ainda não existe na nuvem (esquema.sql antigo), são puladas sem
  // travar o resto da sincronização.
  { nome: 'semanas', opcional: true, campos: { id: 'id', semestre: 'semestre', numero: 'numero', inicio: 'inicio', periodo: 'periodo', conteudo: 'conteudo', volume: 'volume', intensidade: 'intensidade', extras: 'extras', treinos: 'treinos', apagado: 'apagado', criadoEm: 'criado_em', atualizadoEm: 'atualizado_em' } },
  { nome: 'escala', opcional: true, campos: { id: 'id', dia: 'dia', hora: 'hora', professores: 'professores', apagado: 'apagado', criadoEm: 'criado_em', atualizadoEm: 'atualizado_em' } },
  { nome: 'pse', opcional: true, campos: { id: 'id', turmaId: 'turma_id', nadadorId: 'nadador_id', data: 'data', valor: 'valor', duracao: 'duracao', origem: 'origem', apagado: 'apagado', criadoEm: 'criado_em', atualizadoEm: 'atualizado_em' } }
];
// Valor usado quando o registro do aparelho não tem o campo (registros antigos).
const PADRAO = { horario: null, agenda: [], arquivada: false, arquivado: false, apagado: false, rep: null, origem: 'cronometro', dispositivo: null, treinos: [], extras: null, periodo: null, conteudo: null, volume: null, intensidade: null };
const NUMEROS = ['t', 'volume', 'intensidade'];   // numeric da nuvem pode chegar como texto
// "tabela não existe" (PostgreSQL 42P01) ou fora do cache do PostgREST (PGRST205)
const faltaTabela = e => e && (e.code === '42P01' || e.code === 'PGRST205' || /does not exist|schema cache/i.test(e.message || ''));
const LOTE = 500;
const FOLGA_MS = 5 * 60 * 1000;   // ao baixar, volta 5 min para pegar o que chegou fora de ordem

const iso = v => (v ? new Date(v).toISOString() : v);

function paraNuvem(tab, o) {
  const r = {};
  for (const [local, remoto] of Object.entries(tab.campos)) {
    const v = o[local];
    r[remoto] = v === undefined ? (local in PADRAO ? PADRAO[local] : null) : v;
  }
  if (!r.criado_em) r.criado_em = r.atualizado_em;
  return r;
}
function doNuvem(tab, r) {
  const o = {};
  for (const [local, remoto] of Object.entries(tab.campos)) o[local] = r[remoto];
  o.criadoEm = iso(o.criadoEm);
  o.atualizadoEm = iso(o.atualizadoEm);
  for (const k of NUMEROS) if (k in o && o[k] != null) o[k] = Number(o[k]);
  return o;
}

// A turma de exemplo (e tudo dentro dela) nunca sobe para a nuvem.
function eExemplo(tab, o, exemplos) {
  return tab.nome === 'turmas' ? !!o.exemplo : exemplos.has(o.turmaId);
}

async function pendentesDe(tab, exemplos) {
  const desde = await db.config.get(`envio:${tab.nome}`, '');
  return (await db.todosDe(tab.nome)).filter(o => String(o.atualizadoEm || '') > desde && !eExemplo(tab, o, exemplos));
}
async function idsExemplo() {
  return new Set((await db.todosDe('turmas')).filter(t => t.exemplo).map(t => t.id));
}
export async function contarPendentes() {
  const ex = await idsExemplo();
  let n = 0;
  for (const tab of TABELAS) if (!semTabela.has(tab.nome)) n += (await pendentesDe(tab, ex)).length;
  return n;
}

// Tabelas opcionais que a nuvem ainda não tem: não contam como pendentes até existirem.
const semTabela = new Set();
function falhou(tab, error) {
  if (tab.opcional && faltaTabela(error)) {
    if (!semTabela.has(tab.nome)) console.warn(`Sincronização: a tabela "${tab.nome}" ainda não existe na nuvem (rode o supabase/esquema.sql).`);
    semTabela.add(tab.nome);
    return true;
  }
  throw error;
}

async function enviar(tab, exemplos) {
  const inicio = new Date().toISOString();
  const lista = await pendentesDe(tab, exemplos);
  for (let i = 0; i < lista.length; i += LOTE) {
    const { error } = await sb().from(tab.nome).upsert(lista.slice(i, i + LOTE).map(o => paraNuvem(tab, o)), { onConflict: 'id' });
    if (error && falhou(tab, error)) return 0;
  }
  await db.config.set(`envio:${tab.nome}`, inicio);
  return lista.length;
}

async function receber(tab) {
  const chave = `recebido:${tab.nome}`;
  const cursor = await db.config.get(chave, 0);
  const desde = new Date(Math.max(0, cursor - FOLGA_MS)).toISOString();
  let maior = cursor, total = 0;
  for (let de = 0; ; de += 1000) {
    const { data, error } = await sb().from(tab.nome).select('*')
      .gt('sincronizado_em', desde).order('sincronizado_em', { ascending: true }).range(de, de + 999);
    if (error && falhou(tab, error)) return 0;
    semTabela.delete(tab.nome);
    if (!data.length) break;
    total += await db.mesclar(tab.nome, data.map(r => doNuvem(tab, r)));
    for (const r of data) maior = Math.max(maior, Date.parse(r.sincronizado_em));
    if (data.length < 1000) break;
  }
  await db.config.set(chave, maior);
  return total;
}

/* ---------- estado, para o indicador no topo da tela ---------- */
let estado = { fase: 'parado', pendentes: 0, erro: null, ultimaVez: null };
const ouvintes = new Set();
export function aoMudarEstado(fn) { ouvintes.add(fn); fn(estado); return () => ouvintes.delete(fn); }
function definir(parte) { estado = { ...estado, ...parte }; ouvintes.forEach(f => f(estado)); }
export const estadoSincronia = () => estado;

let emAndamento = null, deNovo = false;

export function sincronizar() {
  if (emAndamento) { deNovo = true; return emAndamento; }
  emAndamento = ciclo().finally(() => {
    emAndamento = null;
    if (deNovo) { deNovo = false; sincronizar(); }
  });
  return emAndamento;
}

async function ciclo() {
  if (!navigator.onLine) { definir({ fase: 'offline', pendentes: await contarPendentes() }); return; }
  definir({ fase: 'enviando' });
  try {
    const exemplos = await idsExemplo();
    for (const tab of TABELAS) await enviar(tab, exemplos);
    let recebidos = 0;
    for (const tab of TABELAS) recebidos += await receber(tab);
    definir({ fase: 'ok', erro: null, ultimaVez: new Date().toISOString(), pendentes: await contarPendentes() });
    window.dispatchEvent(new CustomEvent('raia:recebido', { detail: { total: recebidos } }));
  } catch (e) {
    console.warn('Sincronização:', e);
    definir({ fase: navigator.onLine ? 'erro' : 'offline', erro: explicar(e), pendentes: await contarPendentes() });
  }
}

let ligada = false;
export function ligarSincronia() {
  if (ligada) return;
  ligada = true;
  let espera = 0;
  window.addEventListener('raia:mudou', () => { clearTimeout(espera); espera = setTimeout(sincronizar, 2500); });
  window.addEventListener('online', () => sincronizar());
  window.addEventListener('offline', async () => definir({ fase: 'offline', pendentes: await contarPendentes() }));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') sincronizar(); });
  setInterval(() => { if (document.visibilityState === 'visible') sincronizar(); }, 60 * 1000);
  sincronizar();
}
