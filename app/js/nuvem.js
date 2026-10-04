// Conexão com a nuvem: login com Google, perfil (aluno, professor ou master) e convites.
// A biblioteca do Supabase vem de vendor/supabase.js (carregada no index.html).

import { NUVEM } from './config.js';
import * as db from './db.js';

let cliente = null;
let perfilAtual = null;

export const nuvemLigada = () => !!(NUVEM.url && NUVEM.chave && window.supabase);

export function sb() {
  if (!cliente) {
    cliente = window.supabase.createClient(NUVEM.url, NUVEM.chave, {
      auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'raia-sessao' }
    });
  }
  return cliente;
}

// Mensagem em português a partir do erro que o Supabase devolve.
export function explicar(erro) {
  const m = String((erro && (erro.message || erro.error_description)) || erro || '');
  if (/failed to fetch|networkerror|network request|load failed/i.test(m)) return 'Sem conexão com a internet. Tente de novo quando conectar.';
  if (/jwt|token/i.test(m) && /expired|invalid/i.test(m)) return 'Sua sessão expirou. Saia e entre de novo.';
  return m || 'Algo deu errado.';
}

/* ---------- sessão e perfil ---------- */
export const perfil = () => perfilAtual;
export const eEquipe = () => !!perfilAtual && (perfilAtual.papel === 'professor' || perfilAtual.papel === 'master');
export const eMaster = () => !!perfilAtual && perfilAtual.papel === 'master';

export async function sessaoAtual() {
  const { data, error } = await sb().auth.getSession();
  if (error) throw error;
  return data.session;
}

export async function entrarComGoogle() {
  const volta = location.origin + location.pathname;
  const { error } = await sb().auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: volta, queryParams: { prompt: 'select_account' } }
  });
  if (error) throw error;
}

export async function sair() {
  try { await sb().auth.signOut(); } catch (e) { /* sem internet: a sessão local sai do mesmo jeito */ }
  await db.config.set('perfil', null);
  perfilAtual = null;
}

// Busca o perfil na nuvem e guarda uma cópia no aparelho, para abrir sem internet.
export async function carregarPerfil(sessao) {
  const u = sessao.user;
  const base = { uid: u.id, email: u.email || '', nome: (u.user_metadata && (u.user_metadata.full_name || u.user_metadata.name)) || '' };
  try {
    const { data, error } = await sb().from('perfis').select('papel, nadador_id, nome, email').eq('usuario_id', u.id).maybeSingle();
    if (error) throw error;
    perfilAtual = data ? { ...base, papel: data.papel, nadadorId: data.nadador_id, nome: data.nome || base.nome } : { ...base, papel: null };
    await db.config.set('perfil', perfilAtual);
  } catch (e) {
    const guardado = await db.config.get('perfil', null);
    if (!guardado || guardado.uid !== u.id) throw e;
    perfilAtual = { ...guardado, semInternet: true };
  }
  return perfilAtual;
}

// Sem sessão válida e sem internet: usa o último perfil guardado (professor na piscina sem Wi-Fi).
export async function perfilGuardado() {
  const p = await db.config.get('perfil', null);
  if (p) perfilAtual = { ...p, semInternet: true };
  return perfilAtual;
}

/* ---------- códigos de convite ---------- */
export const formatarCodigo = c => (c && c.length === 8 ? `${c.slice(0, 4)}-${c.slice(4)}` : c);

async function rpc(nome, args) {
  const { data, error } = await sb().rpc(nome, args);
  if (error) throw error;
  return data;
}
export const resgatarCodigo = codigo => rpc('resgatar_convite', { p_codigo: codigo });
export const criarConvite = (papel, nadadorId = null) => rpc('criar_convite', { p_papel: papel, p_nadador: nadadorId, p_dias: 30 });
export const cancelarConvite = codigo => rpc('cancelar_convite', { p_codigo: codigo });
export const listarAcessos = () => rpc('listar_acessos', {});
export const removerAcesso = uid => rpc('remover_acesso', { p_usuario: uid });

export async function convitesPendentes() {
  const { data, error } = await sb().from('convites')
    .select('codigo, papel, nadador_id, expira_em, criado_em')
    .is('usado_por', null).gt('expira_em', new Date().toISOString())
    .order('criado_em', { ascending: false });
  if (error) throw error;
  return data;
}
