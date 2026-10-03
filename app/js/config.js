// Conexão com o banco na nuvem (Supabase). Vazio = o app funciona só no aparelho, sem login.
//
// A chave aqui é a PÚBLICA ("anon" / "publishable"): ela pode ficar no código, porque quem
// protege os dados são as regras do banco (RLS, ver supabase/esquema.sql).
// NUNCA colocar aqui a chave secreta ("service_role" / "secret") nem a senha do banco.
export const NUVEM = {
  url: '',
  chave: ''
};
