# Raia · cronômetro e evolução para natação

Contexto para qualquer sessão do Claude que trabalhar neste repositório. Ler inteiro antes de mexer.

> **Este repositório é público.** Nada de nomes de pessoas, da instituição parceira ou de histórias
> internas em arquivo versionado (nem em mensagem de commit). O contexto completo (quem é quem, origem
> do projeto, próximos contatos) está em `privado/CONTEXTO.md`, que só existe no PC do GÊ e o git
> ignora. Se estiver nesse PC, ler esse arquivo também.

## Quem

- **Autor:** GÊ (conta GitHub `gmontijo1`). Fala PT-BR. **Não programa**: o Claude escreve todo o
  código, e instruções para ele são clique a clique, sem terminal sempre que der.
- **Para quem é o app:** projetos de natação com turmas recreativas e equipe de competição, em que os
  professores cronometram repetições de 25 e 50 m na beira da piscina.

## O problema

Os tempos são marcados com cronômetro físico, anotados à mão num caderno na beira da piscina e
depois digitados no Excel. Os dados existem, mas ninguém consegue consultá-los, e cada nadador não
consegue ver a própria evolução.

## A ideia central

**Marcar o tempo já é registrar o tempo.** O celular ou tablet do professor é o cronômetro: cada
nadador tem o próprio, com LARGADA quando ele sai e PARAR quando ele chega, e o tempo vai para o
histórico. Somem o caderno e a digitação no Excel.

**Decisão do GÊ (v0.2.0):** sem divisão por raias. A versão 0.1.0 agrupava por raia, com saída
escalonada automática, e ficou confusa. Agora cada aluno tem o próprio botão, o que também resolve a
saída escalonada (o professor toca LARGADA na hora em que cada um sai). Não voltar a organizar o
treino por raias sem pedido dele.

## Estado atual

- **App v0.2.0 no ar:** https://gmontijo1.github.io/raia/ (ver "Base do app" e "Publicação").
- **Protótipo v1, dados fictícios:** `prototipo/raia-natacao.html`, publicado como Artifact em
  https://claude.ai/artifact/UyJ5x3KDjp6NZPqbAydNPw (para atualizar, publicar de novo nessa URL).
- **O caderno registra só o tempo de 25 m e de 50 m de cada aluno.** Fotos do caderno e a planilha do
  Excel ainda não estão disponíveis; isso só afeta a importação do histórico, não o resto do app.
- **Próximo passo:** validar a ideia com a coordenação do projeto de natação (perguntas em
  `privado/CONTEXTO.md`).

## Base do app — pasta `app/`

App web instalável (PWA), **sem etapa de build**: HTML, CSS e JavaScript puros (módulos ES), abertos
direto no navegador. Não usar bundler, npm ou TypeScript: o PC do GÊ não tem Node nem Python.

- **Telas** (`app/js/telas/`): `inicio` (turmas), `turma` (nadadores, cadastro um a um ou vários de
  uma vez), `treino` (cartão por nadador com LARGADA/PARAR, "Largar todos", cancelar largada, trava de
  1 s após o PARAR contra toque duplo, mínimo de 2 s por tempo, presença, desfazer), `nadador`
  (evolução por distância e estilo, tabela, apagar tempo, editar/arquivar) e `dados` (planilha CSV,
  cópia de segurança JSON, proteção do armazenamento).
- **Dados** (`app/js/db.js`): IndexedDB no aparelho. Lojas `turmas`, `nadadores`, `tempos` e
  `config`. Já pensado para sincronizar: ids gerados no aparelho (UUID), nada é apagado de verdade
  (`apagado: true`), `atualizadoEm` em toda gravação, `sincronizado: false` nos tempos e `dispositivo`
  em cada tempo. Tempo = `{ nadadorId, turmaId, data (AAAA-MM-DD local), dist, estilo, t (segundos),
  rep, origem: cronometro | manual | exemplo }`.
- **Sem internet:** `app/sw.js` guarda todos os arquivos no aparelho (primeiro o cache, depois a
  rede). **Ao mudar qualquer arquivo do app, subir a versão em `app/sw.js` (VERSAO) e em
  `app/js/versao.js` (VERSAO_APP), e incluir arquivo novo na lista `ARQUIVOS` do `sw.js`.** Sem
  isso, os aparelhos continuam com a versão antiga. Quando há versão nova, o app mostra
  "Atualizar agora" (não recarrega sozinho, para não interromper um treino).
- **Exemplo:** `#/carregar-exemplo` cria a "Turma de exemplo" (8 nadadores, 12 semanas de tempos
  inventados). Ela pode ser apagada de vez em "Editar turma".
- **Fontes e ícones** ficam dentro de `app/` (sem depender da internet). Ícones PNG gerados com
  System.Drawing pelo PowerShell.

**Rodar no PC:** dois cliques em `Abrir Raia.cmd` (sobe `ferramentas/servidor.ps1` em
http://localhost:8080 e abre o navegador). **Testar como Claude:** subir o servidor em outra porta
(`-Porta 8091`, com `$env:RAIA_SEM_NAVEGADOR = '1'`) e usar `ferramentas/navegador-teste.ps1`, que
controla um Edge sem janela (abrir rota, rodar JS, tirar foto em largura de celular). O `--dump-dom`
do Edge não serve: ele termina antes de o IndexedDB responder.

## Publicação

GitHub Pages, publicado sozinho pelo workflow `.github/workflows/publicar.yml` a cada push na `main`
que mexe em `app/` (ou manualmente em Actions → Publicar app → Run workflow). Só a pasta `app/` vai
para o site. Endereço: https://gmontijo1.github.io/raia/

## Próximas etapas

1. **Validar com a coordenação do projeto de natação.**
2. **Sincronização e login** (Supabase): vários professores, vários aparelhos, mesmo histórico.
3. **Importar o caderno e o Excel antigos** quando houver acesso.
4. **Visão do nadador** (cada um vê só o seu) e **painel do coordenador**.
5. **Equipe de competição** (tempos parciais, provas) e, se a coordenação quiser, base para pesquisa.

## Regras (não negociáveis)

1. **Dado real de nadador nunca entra no repositório.** Nomes, tempos, fotos do caderno e planilhas
   reais ficam no banco do app ou na pasta local `privado/`, que o git ignora. No repositório, só
   código e dados fictícios.
2. **Repositório público:** nenhum nome de pessoa real, instituição parceira ou história interna em
   arquivo versionado ou mensagem de commit. Isso vai em `privado/CONTEXTO.md`.
3. **LGPD:** coletar o mínimo; cada nadador vê só os próprios dados; se houver menores de idade, os
   responsáveis precisam autorizar.
4. **Pesquisa:** se os dados forem usados em pesquisa, o projeto precisa de aprovação do comitê de
   ética antes.
5. **Sem marca de instituição** no app até o projeto ser formalizado com a coordenação.
6. **Commits feitos pelo Claude no PC do GÊ:** autor `gmontijo1` /
   `321594711+gmontijo1@users.noreply.github.com` (o `git config` local é de outro usuário).
