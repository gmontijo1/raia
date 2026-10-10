-- =====================================================================================
-- Raia · banco de dados na nuvem (Supabase)
--
-- Como usar: no projeto do Supabase, SQL Editor → New query → colar este arquivo inteiro
-- → Run. Pode rodar de novo sem problema (não apaga nada). No fim aparece o CÓDIGO
-- MASTER inicial, válido por 7 dias, se ainda não existir nenhum master.
--
-- Segurança (Row Level Security em todas as tabelas):
--   aluno     → lê só o próprio cadastro, os próprios tempos, a agenda, os planos da turma e o
--               planejamento do semestre (semanas).
--   professor → lê e grava turmas, nadadores, tempos, planos, semanas e escala; gera códigos de aluno.
--   master    → tudo do professor + gera códigos de professor e master, vê e remove acessos.
-- Quem entra com Google mas ainda não usou um código não vê nada.
--
-- Sincronização: o app grava `atualizado_em` (relógio do aparelho, decide quem ganha num
-- conflito) e o banco carimba `sincronizado_em` (relógio do servidor, usado para baixar
-- só o que mudou).
-- =====================================================================================

-- ---------------------------------------------------------------- tabelas de dados

create table if not exists public.turmas (
  id               uuid primary key,
  nome             text not null check (length(nome) between 1 and 80),
  horario          text check (length(horario) <= 80),
  agenda           jsonb not null default '[]'::jsonb,      -- [{ "dia": 2, "hora": "07:00" }], dia 0 = domingo
  arquivada        boolean not null default false,
  apagado          boolean not null default false,
  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz not null default now(),
  sincronizado_em  timestamptz not null default now()
);

create table if not exists public.nadadores (
  id               uuid primary key,
  turma_id         uuid not null references public.turmas (id),
  nome             text not null check (length(nome) between 1 and 80),
  arquivado        boolean not null default false,
  apagado          boolean not null default false,
  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz not null default now(),
  sincronizado_em  timestamptz not null default now()
);
create index if not exists nadadores_turma on public.nadadores (turma_id);
create index if not exists nadadores_sinc on public.nadadores (sincronizado_em);

create table if not exists public.tempos (
  id               uuid primary key,
  turma_id         uuid not null references public.turmas (id),
  nadador_id       uuid not null references public.nadadores (id),
  data             date not null,
  dist             smallint not null check (dist between 1 and 1500),
  estilo           text not null check (estilo in ('crawl', 'costas', 'peito', 'borboleta')),
  t                numeric(7, 2) not null check (t > 0 and t < 3600),
  rep              smallint,
  origem           text not null default 'cronometro' check (length(origem) <= 20),
  dispositivo      uuid,
  registrado_por   uuid default auth.uid(),
  apagado          boolean not null default false,
  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz not null default now(),
  sincronizado_em  timestamptz not null default now()
);
create index if not exists tempos_nadador_data on public.tempos (nadador_id, data);
create index if not exists tempos_sinc on public.tempos (sincronizado_em);

-- treino planejado de uma turma numa data (ex.: "8×50 crawl, saída a cada 1:30")
create table if not exists public.planos (
  id               uuid primary key,
  turma_id         uuid not null references public.turmas (id),
  data             date not null,
  descricao        text not null check (length(descricao) <= 2000),
  apagado          boolean not null default false,
  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz not null default now(),
  sincronizado_em  timestamptz not null default now()
);
create index if not exists planos_turma_data on public.planos (turma_id, data);
create index if not exists planos_sinc on public.planos (sincronizado_em);

-- planejamento do semestre: uma linha por semana, igual para todas as turmas (v0.7.0)
create table if not exists public.semanas (
  id               uuid primary key,
  semestre         text not null check (length(semestre) between 1 and 20),
  numero           smallint not null check (numero between 1 and 60),
  inicio           date not null,                              -- segunda-feira da semana
  periodo          text check (length(periodo) <= 80),         -- ex.: "Potência Aeróbia"
  conteudo         text check (length(conteudo) <= 200),       -- ex.: "A3, AN2"
  volume           numeric(4, 3) check (volume between 0 and 2),        -- fração de 4500 m
  intensidade      numeric(4, 3) check (intensidade between 0 and 1),
  extras           text check (length(extras) <= 200),         -- ex.: "Vcrit; Avaliação física"
  treinos          jsonb not null default '[]'::jsonb,         -- [{ dia, aquecimento, principal, soltura, total, ...Obs }]
  apagado          boolean not null default false,
  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz not null default now(),
  sincronizado_em  timestamptz not null default now()
);
create index if not exists semanas_sinc on public.semanas (sincronizado_em);

-- escala de professores: quem dá aula em cada dia da semana e horário (v0.7.0)
create table if not exists public.escala (
  id               uuid primary key,
  dia              smallint not null check (dia between 0 and 6),   -- 0 = domingo
  hora             text not null check (hora ~ '^[0-2][0-9]:[0-5][0-9]$'),
  professores      text not null check (length(professores) <= 300),
  apagado          boolean not null default false,
  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz not null default now(),
  sincronizado_em  timestamptz not null default now()
);
create index if not exists escala_sinc on public.escala (sincronizado_em);

create index if not exists turmas_sinc on public.turmas (sincronizado_em);

-- ---------------------------------------------------------------- acessos

create table if not exists public.perfis (
  usuario_id  uuid primary key references auth.users (id) on delete cascade,
  papel       text not null check (papel in ('master', 'professor', 'aluno')),
  nadador_id  uuid references public.nadadores (id),
  nome        text,
  email       text,
  criado_em   timestamptz not null default now(),
  check (papel <> 'aluno' or nadador_id is not null)
);

create table if not exists public.convites (
  codigo      text primary key,
  papel       text not null check (papel in ('master', 'professor', 'aluno')),
  nadador_id  uuid references public.nadadores (id),
  criado_por  uuid references auth.users (id) on delete set null,
  criado_em   timestamptz not null default now(),
  expira_em   timestamptz not null,
  usado_por   uuid references auth.users (id) on delete set null,
  usado_em    timestamptz,
  check (papel <> 'aluno' or nadador_id is not null)
);

-- ---------------------------------------------------------------- carimbo de sincronização

create or replace function public.carimbar() returns trigger
language plpgsql set search_path = public as $$
begin
  -- chegou uma versão mais antiga (de um aparelho que ficou offline): mantém a que já está
  if tg_op = 'UPDATE' and new.atualizado_em < old.atualizado_em then
    return old;
  end if;
  new.sincronizado_em := clock_timestamp();
  return new;
end $$;

drop trigger if exists carimbar on public.turmas;
create trigger carimbar before insert or update on public.turmas for each row execute function public.carimbar();
drop trigger if exists carimbar on public.nadadores;
create trigger carimbar before insert or update on public.nadadores for each row execute function public.carimbar();
drop trigger if exists carimbar on public.tempos;
create trigger carimbar before insert or update on public.tempos for each row execute function public.carimbar();
drop trigger if exists carimbar on public.planos;
create trigger carimbar before insert or update on public.planos for each row execute function public.carimbar();
drop trigger if exists carimbar on public.semanas;
create trigger carimbar before insert or update on public.semanas for each row execute function public.carimbar();
drop trigger if exists carimbar on public.escala;
create trigger carimbar before insert or update on public.escala for each row execute function public.carimbar();

-- ---------------------------------------------------------------- quem é quem

create or replace function public.meu_papel() returns text
language sql stable security definer set search_path = public as $$
  select papel from public.perfis where usuario_id = auth.uid()
$$;

create or replace function public.e_equipe() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.perfis where usuario_id = auth.uid() and papel in ('master', 'professor'))
$$;

create or replace function public.e_master() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.perfis where usuario_id = auth.uid() and papel = 'master')
$$;

create or replace function public.meu_nadador() returns uuid
language sql stable security definer set search_path = public as $$
  select nadador_id from public.perfis where usuario_id = auth.uid() and papel = 'aluno'
$$;

create or replace function public.minha_turma() returns uuid
language sql stable security definer set search_path = public as $$
  select n.turma_id
  from public.perfis p join public.nadadores n on n.id = p.nadador_id
  where p.usuario_id = auth.uid() and p.papel = 'aluno'
$$;

-- ---------------------------------------------------------------- permissões (RLS)

alter table public.turmas    enable row level security;
alter table public.nadadores enable row level security;
alter table public.tempos    enable row level security;
alter table public.planos    enable row level security;
alter table public.semanas   enable row level security;
alter table public.escala    enable row level security;
alter table public.perfis    enable row level security;
alter table public.convites  enable row level security;

-- turmas
drop policy if exists turmas_ler on public.turmas;
create policy turmas_ler on public.turmas for select to authenticated
  using (public.e_equipe() or (id = public.minha_turma() and not apagado));
drop policy if exists turmas_inserir on public.turmas;
create policy turmas_inserir on public.turmas for insert to authenticated with check (public.e_equipe());
drop policy if exists turmas_alterar on public.turmas;
create policy turmas_alterar on public.turmas for update to authenticated
  using (public.e_equipe()) with check (public.e_equipe());

-- nadadores
drop policy if exists nadadores_ler on public.nadadores;
create policy nadadores_ler on public.nadadores for select to authenticated
  using (public.e_equipe() or id = public.meu_nadador());
drop policy if exists nadadores_inserir on public.nadadores;
create policy nadadores_inserir on public.nadadores for insert to authenticated with check (public.e_equipe());
drop policy if exists nadadores_alterar on public.nadadores;
create policy nadadores_alterar on public.nadadores for update to authenticated
  using (public.e_equipe()) with check (public.e_equipe());

-- tempos
drop policy if exists tempos_ler on public.tempos;
create policy tempos_ler on public.tempos for select to authenticated
  using (public.e_equipe() or (nadador_id = public.meu_nadador() and not apagado));
drop policy if exists tempos_inserir on public.tempos;
create policy tempos_inserir on public.tempos for insert to authenticated with check (public.e_equipe());
drop policy if exists tempos_alterar on public.tempos;
create policy tempos_alterar on public.tempos for update to authenticated
  using (public.e_equipe()) with check (public.e_equipe());

-- planos
drop policy if exists planos_ler on public.planos;
create policy planos_ler on public.planos for select to authenticated
  using (public.e_equipe() or (turma_id = public.minha_turma() and not apagado));
drop policy if exists planos_inserir on public.planos;
create policy planos_inserir on public.planos for insert to authenticated with check (public.e_equipe());
drop policy if exists planos_alterar on public.planos;
create policy planos_alterar on public.planos for update to authenticated
  using (public.e_equipe()) with check (public.e_equipe());

-- perfis e convites: só leitura direta; mudanças passam pelas funções abaixo
-- semanas: a equipe lê e grava; o aluno lê o planejamento (não tem nada pessoal)
drop policy if exists semanas_ler on public.semanas;
create policy semanas_ler on public.semanas for select to authenticated
  using (public.e_equipe() or (public.meu_papel() = 'aluno' and not apagado));
drop policy if exists semanas_inserir on public.semanas;
create policy semanas_inserir on public.semanas for insert to authenticated with check (public.e_equipe());
drop policy if exists semanas_alterar on public.semanas;
create policy semanas_alterar on public.semanas for update to authenticated
  using (public.e_equipe()) with check (public.e_equipe());

-- escala: só a equipe
drop policy if exists escala_ler on public.escala;
create policy escala_ler on public.escala for select to authenticated using (public.e_equipe());
drop policy if exists escala_inserir on public.escala;
create policy escala_inserir on public.escala for insert to authenticated with check (public.e_equipe());
drop policy if exists escala_alterar on public.escala;
create policy escala_alterar on public.escala for update to authenticated
  using (public.e_equipe()) with check (public.e_equipe());

drop policy if exists perfis_ler on public.perfis;
create policy perfis_ler on public.perfis for select to authenticated
  using (usuario_id = auth.uid() or public.e_master());
drop policy if exists convites_ler on public.convites;
create policy convites_ler on public.convites for select to authenticated
  using (public.e_master() or (public.e_equipe() and papel = 'aluno'));

-- Quem não entrou (anon) não acessa tabela nenhuma; quem entrou só faz o que a RLS deixa.
-- As permissões são dadas aqui uma a uma, então o projeto pode (e deve) ficar com
-- "Automatically expose new tables" desligado. O anon só usa o schema para a função ping.
revoke all on public.turmas, public.nadadores, public.tempos, public.planos, public.semanas, public.escala, public.perfis, public.convites from anon;
grant usage on schema public to anon, authenticated;
grant select, insert, update on public.turmas, public.nadadores, public.tempos, public.planos, public.semanas, public.escala to authenticated;
revoke delete on public.turmas, public.nadadores, public.tempos, public.planos, public.semanas, public.escala from authenticated;
grant select on public.perfis, public.convites to authenticated;
revoke insert, update, delete on public.perfis, public.convites from authenticated;

-- ---------------------------------------------------------------- códigos de convite

-- 8 caracteres sem letras/números que se confundem (sem I, L, O, 0, 1)
create or replace function public.novo_codigo() returns text
language plpgsql volatile set search_path = public as $$
declare
  alfabeto constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  b bytea := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
  i int;
  c text := '';
begin
  foreach i in array array[0, 1, 2, 3, 4, 5, 10, 11] loop
    c := c || substr(alfabeto, (get_byte(b, i) % 31) + 1, 1);
  end loop;
  return c;
end $$;

create or replace function public.criar_convite(p_papel text, p_nadador uuid default null, p_dias int default 30)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_codigo text;
begin
  if p_papel = 'aluno' then
    if not public.e_equipe() then raise exception 'Só professores geram código de aluno.'; end if;
    if p_nadador is null or not exists (select 1 from public.nadadores where id = p_nadador and not apagado) then
      raise exception 'Esse nadador ainda não está na nuvem. Sincronize o app e tente de novo.';
    end if;
  elsif p_papel in ('professor', 'master') then
    if not public.e_master() then raise exception 'Só o master gera código de professor ou de master.'; end if;
    p_nadador := null;
  else
    raise exception 'Tipo de acesso inválido.';
  end if;
  loop
    v_codigo := public.novo_codigo();
    exit when not exists (select 1 from public.convites where codigo = v_codigo);
  end loop;
  insert into public.convites (codigo, papel, nadador_id, criado_por, expira_em)
  values (v_codigo, p_papel, p_nadador, auth.uid(), now() + make_interval(days => greatest(1, least(coalesce(p_dias, 30), 90))));
  return v_codigo;
end $$;

create or replace function public.resgatar_convite(p_codigo text)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v public.convites%rowtype;
  v_codigo text := upper(regexp_replace(coalesce(p_codigo, ''), '[^A-Za-z0-9]', '', 'g'));
  v_atual text := public.meu_papel();
  peso constant jsonb := '{"aluno": 1, "professor": 2, "master": 3}';
begin
  if auth.uid() is null then raise exception 'Entre com a sua conta primeiro.'; end if;
  select * into v from public.convites where codigo = v_codigo for update;
  if not found then raise exception 'Código não encontrado. Confira as letras e os números.'; end if;
  if v.usado_por is not null then raise exception 'Esse código já foi usado. Peça um novo.'; end if;
  if v.expira_em < now() then raise exception 'Esse código venceu. Peça um novo.'; end if;
  if v_atual is not null and (peso ->> v.papel)::int < (peso ->> v_atual)::int then
    raise exception 'Você já tem um acesso maior que esse.';
  end if;
  insert into public.perfis (usuario_id, papel, nadador_id, nome, email)
  values (auth.uid(), v.papel, v.nadador_id,
          coalesce(auth.jwt() -> 'user_metadata' ->> 'full_name', auth.jwt() -> 'user_metadata' ->> 'name'),
          auth.jwt() ->> 'email')
  on conflict (usuario_id) do update
    set papel = excluded.papel, nadador_id = excluded.nadador_id, nome = excluded.nome, email = excluded.email;
  update public.convites set usado_por = auth.uid(), usado_em = now() where codigo = v_codigo;
  return v.papel;
end $$;

create or replace function public.cancelar_convite(p_codigo text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from public.convites
  where codigo = upper(p_codigo) and usado_por is null
    and (public.e_master() or (public.e_equipe() and papel = 'aluno'));
end $$;

create or replace function public.listar_acessos()
returns table (usuario_id uuid, papel text, nome text, email text, nadador_id uuid, nadador_nome text, criado_em timestamptz)
language sql stable security definer set search_path = public as $$
  select p.usuario_id, p.papel, p.nome, p.email, p.nadador_id, n.nome, p.criado_em
  from public.perfis p left join public.nadadores n on n.id = p.nadador_id
  where public.e_master()
  order by p.papel, p.nome
$$;

create or replace function public.remover_acesso(p_usuario uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.e_master() then raise exception 'Só o master remove acessos.'; end if;
  if p_usuario = auth.uid() then raise exception 'Você não pode remover o seu próprio acesso.'; end if;
  delete from public.perfis where usuario_id = p_usuario;
end $$;

-- usado pela visita diária do GitHub que impede o projeto gratuito de "dormir"
create or replace function public.ping() returns text
language sql stable as $$ select 'ok'::text $$;

revoke execute on function
  public.novo_codigo(), public.criar_convite(text, uuid, int), public.resgatar_convite(text),
  public.cancelar_convite(text), public.listar_acessos(), public.remover_acesso(uuid),
  public.meu_papel(), public.e_equipe(), public.e_master(), public.meu_nadador(), public.minha_turma()
from public, anon;
grant execute on function
  public.criar_convite(text, uuid, int), public.resgatar_convite(text),
  public.cancelar_convite(text), public.listar_acessos(), public.remover_acesso(uuid),
  public.meu_papel(), public.e_equipe(), public.e_master(), public.meu_nadador(), public.minha_turma()
to authenticated;
grant execute on function public.ping() to anon, authenticated;

-- ---------------------------------------------------------------- código master inicial

do $$
begin
  if not exists (select 1 from public.perfis where papel = 'master')
     and not exists (select 1 from public.convites where papel = 'master' and usado_por is null and expira_em > now()) then
    insert into public.convites (codigo, papel, expira_em) values (public.novo_codigo(), 'master', now() + interval '7 days');
  end if;
end $$;

select codigo as "CÓDIGO MASTER (mande para o Claude)", expira_em as "vale até"
from public.convites
where papel = 'master' and usado_por is null and expira_em > now();
