# Raia · cronômetro e evolução para natação

Contexto para qualquer sessão do Claude que trabalhar neste repositório. Ler inteiro antes de mexer.

> **Este repositório é público.** Nada de nomes de pessoas nem de histórias internas em arquivo
> versionado (nem em mensagem de commit). Única exceção: o nome e o logo do projeto de natação que
> usa o app, liberados pelo GÊ em 04/10/2026 e guardados só em `app/js/marca.js` e `app/marca/`.
> O contexto completo (quem é quem, origem do projeto, próximos contatos) está em
> `privado/CONTEXTO.md`, que só existe no PC do GÊ e o git ignora. Se estiver nesse PC, ler esse
> arquivo também.

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

- **App v0.7.0 no ar (com login):** https://gmontijo1.github.io/raia/ (ver "Base do app" e "Publicação").
- **Coordenação aprovou (10/10/2026) e mandou a planilha real** (`privado/*.xlsx`: participantes,
  periodização do semestre, treinos semanais, escala). Dados reais entram no app só pelo arquivo de
  importação: `python privado/importar_planilha.py privado/<planilha>.xlsx privado/raia-importacao-<semestre>.json`
  (ids estáveis com uuid5, `"tipo": "importacao"`) → no app, Dados → Restaurar cópia. A
  importação carimba tudo como gravado agora, para a sincronização enviar. Sem lista de espera
  (decisão do GÊ). Os tempos antigos dos alunos ainda não chegaram.
- **Planejamento do semestre (v0.7.0):** menu "Semanas", `#/planejamento/<n>`
  (`telas/planejamento.js`, lógica em `js/semana.js`). Uma linha por semana na tabela `semanas`
  (período, conteúdo, volume e intensidade em fração de 4.500 m, extras, `treinos` = Dia 1/2/3),
  igual para todas as turmas. Tela: a raia (nadador animado que avança com o semestre + barra das
  semanas, ideia do GÊ), gráfico (barra clara = volume, cheia = volume × intensidade, traço = média
  dos treinos escritos, ● Vcrit, ◆ avaliação; cores dos períodos `--fase-*` validadas para
  daltonismo na ordem em que se sucedem), detalhe com os treinos, editor, índice e a **escala de
  professores** (tabela `escala`: dia, hora, nomes). Na tela de treino: semana, professores do
  horário e o treino do dia (o Dia N é o N-ésimo dia de aula da turma na semana; um plano escrito
  para a data, `planos`, tem prioridade).
- **Vcrit (v0.7.0, `js/vcrit.js`):** distâncias 200 e 400 m no cronômetro; Vcrit = 200 ÷ (t400 −
  t200) com os melhores 400 e 200 crawl em até 14 dias (o 400 tem de ficar entre 2× e 2,8× o 200).
  Aparece na evolução (professor e aluno) com o tempo-alvo por distância, e no cartão do treino
  ("Vcrit 47,50" na distância escolhida, só crawl).
- **PSE (v0.8.0, pedido da coordenação):** escala de 0 a 10 do projeto (`js/pse.js`, `NIVEIS_PSE`,
  copiada da imagem de referência; página `#/pse`). Uma resposta por aluno por dia na tabela `pse`,
  com id determinístico (`db.idPse`, SHA-1 de aluno + data em formato UUID v5): professor e aluno
  respondendo no mesmo dia não duplicam, vale a última. Professor marca ao encerrar o treino
  (`perguntarPse`, dá para pular), na lista "Treino encerrado", no resumo do treino e na tela do
  nadador (corrigir/apagar). Aluno responde em "Meus treinos" (treinos dos últimos 7 dias sem PSE),
  direto na nuvem (RLS: só a própria, `origem = 'aluno'`). Carga = PSE × duração (min, padrão 50,
  lembrada por turma). Aparece no histórico do aluno, na PSE média da semana no planejamento e na
  planilha "Baixar PSE" (tela Dados).
- **Tabelas novas exigem rodar o `supabase/esquema.sql` de novo.** Até isso, a sincronização
  pula `semanas`, `escala` e `pse` (marcadas `opcional`) sem travar o resto; o aluno também.
- **Fim do treino (v0.6.0, rodada 3 do Claude Design):** cada cartão do treino tem "Encerrar
  treino". Confirma, tira o nadador da lista de hoje (vai para "Treino encerrado", com "Reabrir")
  e chama `sincronizar()` na hora; a pílula mostra o estado real (`statusNuvem` em
  `js/resumo-dia.js`: na nuvem, na fila, sem internet, no aparelho). Quem encerrou fica em
  `config` (`encerrados:<turma>`, só no aparelho, vale para o dia). "Encerrar treino da turma"
  encerra todos (descarta tempos em andamento) e abre `#/resumo/<turma>` (`telas/resumo.js`):
  números do dia, recordes pessoais (melhor de hoje abaixo do melhor de todos os dias anteriores,
  na mesma prova) e o melhor de cada nadador. "Compartilhar resumo" (`js/compartilhar.js`)
  desenha o cartão num canvas e usa o compartilhamento do celular; no computador, baixa a
  imagem e copia o texto.
- **Visual (v0.5.0, escolhido pelo GÊ no Claude Design, opção "2a"):** topo com RAIA à esquerda, o
  logo do projeto no centro e a sincronização à direita; menu fixo embaixo (some com menos de 2
  itens); entrada sem cartão, com o logo grande e a corda de raia; LARGADA/PARAR em Helvetica
  (`--font-botao`, vira Arial no Android) com letras mais juntas; rodapé "Raia · <projeto>". O
  design system do Claude Design é sincronizado deste repositório (ver `.design-sync/NOTES.md`).
- **Protótipo v1, dados fictícios:** `prototipo/raia-natacao.html`, publicado como Artifact em
  https://claude.ai/artifact/UyJ5x3KDjp6NZPqbAydNPw (para atualizar, publicar de novo nessa URL).
- **O caderno registra só o tempo de 25 m e de 50 m de cada aluno.** Os tempos antigos ainda não
  chegaram (o GÊ está vendo com a coordenação); quando chegarem, importar como `origem: 'importado'`.
- **A equipe de competição** existe, mas não está na planilha: vira uma turma quando houver a lista.

## Base do app — pasta `app/`

App web instalável (PWA), **sem etapa de build**: HTML, CSS e JavaScript puros (módulos ES), abertos
direto no navegador. Não usar bundler, npm ou TypeScript: o PC do GÊ não tem Node nem Python.

- **Telas** (`app/js/telas/`): `inicio` (turmas), `turma` (nadadores, cadastro um a um ou vários de
  uma vez), `treino` (cartão por nadador com LARGADA/PARAR, "Largar todos", cancelar largada, trava de
  1 s após o PARAR contra toque duplo, mínimo de 2 s por tempo, presença, desfazer; tocar no nome abre
  o painel do nadador com as repetições de hoje em tempo real, com o próprio LARGADA/PARAR — tela
  cheia no celular, lateral a partir de 900px), `nadador`
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

## Nuvem, login e papéis (v0.4.0)

- **Banco:** Supabase (servidor em São Paulo). O esquema inteiro está em `supabase/esquema.sql`
  (tabelas, RLS, funções de convite); rodar de novo no SQL Editor é seguro. A conexão fica em
  `app/js/config.js` (URL + chave **pública** anon/publishable). Com o `config.js` vazio, o app
  volta ao modo local, sem login. **Nunca** pôr a chave service_role/secret nem a senha do banco
  no repositório.
- **Papéis:** `aluno` lê só o próprio cadastro, os próprios tempos, a agenda e os planos da turma;
  `professor` lê e grava tudo e gera código de aluno; `master` também convida professor/master e
  remove acessos. Quem não tem papel não vê nada. Quem garante é a RLS do banco, não o app.
- **Entrada:** Google (OAuth do Supabase) + código de convite de 8 caracteres, de uso único, com
  validade de 30 dias. Na primeira vez, a pessoa digita o código (`resgatar_convite`) e ganha o
  papel. O primeiro código master sai no fim do `esquema.sql`.
- **Modos do app** (`app/js/app.js`): `local`, `visitante` (só "Entrar"), `sem-papel` (só o
  código), `aluno` (`telas/aluno.js`), `equipe` (o app inteiro; master também vê
  `telas/acessos.js`). Sem internet, usa o último perfil guardado no aparelho.
- **Sincronização** (`app/js/sincronia.js`, só para a equipe): tudo é gravado primeiro no
  IndexedDB. Depois o app envia o que mudou (`atualizadoEm` maior que o último envio, via upsert)
  e baixa o que outros aparelhos gravaram (`sincronizado_em`, carimbado pelo banco, com 5 min de
  folga). Num conflito, ganha o `atualizado_em` mais novo (trigger `carimbar`). A turma de exemplo
  nunca sobe.
- **Agenda:** a turma tem `agenda` (dias da semana + horário) e `planos` (treino planejado por
  data). O professor planeja na tela da turma, e o aluno vê "Seus treinos desta semana".
- **Biblioteca:** `app/vendor/supabase.js` (versão fixa, ver `LEIA-ME.txt` ao lado), dentro do app
  para funcionar sem internet.
- **Visita diária:** o workflow `manter-nuvem.yml` chama a função `ping` todo dia, para o
  projeto gratuito não "dormir" (ele dorme com 7 dias sem uso).

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
2. **Repositório público:** nenhum nome de pessoa real nem história interna em arquivo versionado
   ou mensagem de commit. Isso vai em `privado/CONTEXTO.md`. O nome e o logo do projeto de natação
   ficam só em `app/js/marca.js` e `app/marca/`; o resto do código usa `NOME_PROJETO`.
3. **LGPD:** coletar o mínimo; cada nadador vê só os próprios dados; se houver menores de idade, os
   responsáveis precisam autorizar.
4. **Pesquisa:** se os dados forem usados em pesquisa, o projeto precisa de aprovação do comitê de
   ética antes.
5. **Marca do projeto:** o GÊ decidiu em 04/10/2026 pôr o logo e o nome do projeto de natação no
   app (v0.5.0). O logo veio de um print em baixa resolução (540×319); trocar pelo arquivo original
   quando houver.
6. **Commits feitos pelo Claude no PC do GÊ:** autor `gmontijo1` /
   `321594711+gmontijo1@users.noreply.github.com` (o `git config` local é de outro usuário).
