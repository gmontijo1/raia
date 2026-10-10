# Raia

Cronômetro de beira de piscina e acompanhamento da evolução de nadadores.

**Use agora:** https://gmontijo1.github.io/raia/ (funciona no celular, no tablet e no computador; pode
ser instalado na tela inicial). **Status:** versão 0.7.0, em teste. Entrada com conta Google e um
código de convite.

## A ideia

Hoje, em muitos treinos de natação, os tempos são marcados no cronômetro, anotados num caderno e depois
digitados no Excel. No Raia, o professor marca o tempo direto no celular ou tablet: cada nadador tem
o próprio cronômetro, com LARGADA quando ele sai e PARAR quando ele chega. O tempo já vai para o
histórico, com um gráfico de evolução para cada um.

## O que já funciona

**Professores**
- Turmas com dias e horário de treino, e o treino planejado de cada data.
- Nadadores (um a um ou colando a lista inteira).
- Cronômetro por nadador: LARGADA e PARAR no cartão de cada um, "Largar todos" para saída em
  grupo, cancelar largada, presença do dia, desfazer.
- Tocando no nome do nadador durante o treino: as repetições de hoje em tempo real (gráfico
  repetição por repetição, média, melhor do dia, quanto caiu ou subiu da 1ª para a última).
- Encerrar o treino de cada nadador (os dados do dia vão para a nuvem na hora) ou da turma toda,
  com um resumo do dia (repetições, recordes pessoais, melhor de cada um) para compartilhar no
  grupo da turma.
- Planejamento do semestre: um nadador que avança pela raia conforme as semanas passam, o
  gráfico de volume e intensidade por semana (colorido pelo período), os treinos de cada semana
  (que aparecem sozinhos no treino do dia de cada turma) e a escala de professores.
- Velocidade crítica (Vcrit) de cada aluno, calculada pelos tiros de 400 m e 200 m crawl, com o
  tempo-alvo de cada distância no cartão do cronômetro.
- PSE (percepção subjetiva de esforço, 0 a 10) de cada aluno em cada treino: marcada ao encerrar
  o treino ou respondida pelo próprio aluno, com a carga (PSE × minutos), a média da semana ao
  lado da intensidade planejada e a planilha para o Excel.
- Acompanhamento do esforço: a PSE média de cada treino comparada com o esforço planejado, em
  gráfico ao longo do tempo (de todas as turmas ou de uma), com a tabela e a planilha das médias.
- Painel da semana de cada turma: MVP da semana (quem mais melhorou o próprio recorde), pódio das
  maiores evoluções, números da semana e a evolução da turma semana a semana.
- Evolução de cada nadador, lançamento de tempo à mão, planilha para o Excel e cópia de segurança.
- Funciona sem internet na beira da piscina; os tempos sobem para a nuvem quando há conexão, e
  todos os professores veem o mesmo histórico.
- Menu na parte de baixo da tela, ao alcance do polegar, e o logo do projeto de natação no topo.

**Alunos**
- Veem só os próprios dados: os treinos da semana (datas e treino planejado), a evolução (com a
  própria Vcrit e a PSE), cada treino com as repetições e os tempos.
- Respondem a PSE de cada treino no próprio celular, pela escala do projeto.

**Coordenação (master)**
- Convida professores e outros coordenadores, vê quem tem acesso e remove acessos.

## Rodar no próprio PC (Windows)

Dois cliques em **`Abrir Raia.cmd`**. Abre uma janela preta (o servidor) e o app no navegador.
Deixe a janela aberta enquanto usa e feche quando terminar.

## Privacidade

Veja https://gmontijo1.github.io/raia/privacidade.html. Cada aluno vê só os próprios dados, e essa
regra fica no próprio banco de dados. Este repositório guarda só código e dados de exemplo.
