# Raia: como desenhar telas com este sistema

**Não existem componentes React.** O Raia é um app web sem etapa de build (HTML, CSS e JS puro), e `window.Raia` vem vazio de propósito. Monte as telas com elementos HTML comuns em JSX (`className`) usando as classes abaixo. Todas existem em `_ds_bundle.css`, que já chega pelo `styles.css`. Use uma classe existente sempre que ela resolver. Layout novo pode usar `style` com os tokens `var(--…)`; nunca escreva cor em hex.

**Leia antes de estilizar:** `_ds_bundle.css` é o CSS real do app (cerca de 330 linhas, com seções comentadas: cabeçalho e menu embaixo, estrutura, botões e campos, listas, cronômetro, fim do treino e resumo, painel do nadador, evolução, diálogo, conta e sincronização, agenda).

**Tema:** claro por padrão, escuro automático por `prefers-color-scheme: dark`. Os nomes dos tokens são os mesmos nos dois temas; só o valor muda.

## Tokens (`var(--…)`)

- Superfícies: `--bg` (fundo da página), `--surface` (cartões), `--surface-2`, `--line` (bordas), `--axis` (eixos de gráfico).
- Texto: `--ink`, `--ink-2` (apoio), `--muted` (rótulos curtos; contraste baixo no tema claro, não use em texto corrido).
- Marca: `--accent` (azul de piscina, ação principal) com `--accent-ink` por cima; `--rope` e `--rope-soft` (amarelo da corda de raia: nadador em andamento, avisos).
- Estado: `--good`, `--good-text`, `--good-soft` (recorde, melhora); `--danger`, `--danger-soft` (erro, apagar); `--parar`, `--parar-ink` (só o botão PARAR).
- Gráficos: `--series`, `--series-soft`; balão do gráfico `--tip-bg`, `--tip-ink`.
- Planejamento: `--agua` (água da raia); cores fixas dos períodos `--fase-retreino`, `--fase-anaerobia`, `--fase-aerobia`, `--fase-supercomp` (validadas para daltonismo na ordem em que os períodos se sucedem; sempre com legenda escrita).
- Fontes: `--font-display` (Big Shoulders Display 800, sempre em MAIÚSCULAS: títulos `h2`, marca RAIA, nome do nadador no painel); `--font-botao` (Helvetica Neue / Helvetica / Arial, só nos botões LARGADA e PARAR, com `letter-spacing: -.02em`); `--font-body` (IBM Plex Sans 400–600); `--font-mono` (IBM Plex Mono 600, para todo tempo e número, com `font-variant-numeric: tabular-nums`).

## Classes

| Família | Classes |
|---|---|
| Página | `topo` > `topo-in` (grade de 3 colunas: `marca` à esquerda, `logo-projeto` no centro, `sincronia` à direita), `corda` (faixa de 5px da corda de raia sob o cabeçalho), `nav-baixo` (menu fixo embaixo: `a` com `a[aria-current="page"]`; com ele, o `html` ganha a classe `com-menu-baixo`), `faixa` / `faixa erro` (aviso), `wrap` (coluna de até 1120px), `tela` (pilha com espaço 16px), `cabeca`, `voltar`, `rodape` ("Raia · nome do projeto", no fim de cada tela) |
| Entrada | `entrada` (sem cartão: `logo-projeto` grande, `corda`, `entrada-titulo` com `h2` e `dica`, `entrada-form`); nela o `topo` fica escondido |
| Cartões e texto | `card`, `card-head`, `lbl` (rótulo em maiúsculas), `sub`, `mut`, `dica`, `linha`, `vazio`, `etiqueta`, `chip recorde`, `chip neutro`, `mono` |
| Ações | `btn` com `primario`, `fantasma`, `perigo`, `pequeno` ou `grande`; `link`; `acoes` (grupo de botões) |
| Formulário | `form` (grade automática) com `campo` (label + input/select/textarea + `small`), `cheio` (ocupa a linha), `seg` (segmentado: `input type="radio"` seguido de `label`), `erro-campo`, `campo-codigo` |
| Cronômetro | `barra-largada`; `atletas` (1 coluna, 2 a partir de 760px) > `atleta` (`data-st="nadando"` ou `"chegou"`) > `at-info` (`at-nome-btn` com `span.seta`, `at-melhor`, `at-nota`, `btn pequeno at-encerrar`) + `at-acao` (`at-relogio`, `btn-cron largar` ou `btn-cron parar`) |
| Fim do treino | `encerrados` (`lbl` + `atletas` com `atleta encerrado`: `at-nome`, `at-melhor`, `link` Reabrir e `span.sincronia`); `dialog.pergunta` (`h3`, `sub`, `acoes-coluna` com `btn primario grande` e `btn grande fantasma`); resumo: `resumo-cartao` > `resumo-faixa` (`logo-projeto`, `resumo-numeros` > `resumo-num` com `b` e `span`) + `corda` + `resumo-recordes` (`lbl`, `lista sessao`), `card linha-nuvem` |
| Planejamento | `card raia-semestre` > `raia-agua` (`raia-linha`, `nadador` com o SVG animado e `--pos` de 0 a 1) + `semanas-barra` > `seg-semana` (`feita`, `atual` com `--feito`, `futura`) + `raia-rodape` (`raia-contador`); gráfico `grafico grafico-semestre` com `legenda` (`leg-item`, `leg-cor`); `semana-detalhe` (`semana-periodo` com `cor-periodo`); `treinos-semana` > `treino-bloco` (`treino-cab`, `treino-partes` com `dt`/`dd`, `series`); `item item-semana` (índice); `escala-dia` > `item item-escala`; `contexto-treino` com `etiqueta semana-link` |
| Listas | `lista` > `li` > `item` (`b`, `sub`, `lado` em mono à direita); `turmas` > `card turma-card` (`nome`); `lista sessao` (`t`, `quem`, `meta`) |
| Números | `blocos` > `bloco` (`lbl`, `v` ou `v bom`, `d`); `graficos` > `card` > `grafico` (SVG) + `dica-eixo`, com `balao` no toque; `tabela` > `table` (`td.n`, `td.bom`, `tr.riscado`) |
| Outros | `painel` > `painel-in` (`painel-topo`, `painel-cab`, `painel-nome`), `sincronia` (`data-fase`: `ok`, `enviando`, `offline`, `erro`), `caixa-codigo` (`codigo`, `mensagem`), `agenda` > `agenda-item` (`agenda-topo`), `card plano` + `plano-texto`, `presenca`, `toast`, `sr` (só para leitor de tela) |

## Logo do projeto

`<span className="logo-projeto" role="img" aria-label="(nome do projeto)" />` mostra o logo completo (símbolo, nome e traço; largura padrão 160px). `<span className="logo-projeto-simbolo" role="img" aria-label="(nome do projeto)" />` mostra só o símbolo do nadador (64px), para espaços pequenos. O desenho é uma máscara e pinta com a cor do texto: use `color: var(--ink)` em fundo claro e `color: var(--accent-ink)` sobre `--accent`. No app, o topo usa o logo com 92px em `--ink` e a entrada usa até 260px em `--accent`. Mude o tamanho só pela `width`, porque a proporção é fixa. Escreva o nome do projeto no `aria-label` como ele aparece no logo.

## Regras da marca

- Toque: alvos de pelo menos 44px (já garantidos em `btn`, `campo`, `seg`). Botão do cronômetro com 58px de altura e coluna de ação com 132px de largura. O app é usado na beira da piscina, com a mão molhada.
- LARGADA usa `--accent` e PARAR usa `--parar`. Vermelho só aparece em PARAR e em erro.
- Tempos sempre em `--font-mono`, com vírgula decimal e centésimos: `38,42`, `1:02,35`.
- Texto de interface em português do Brasil, curto e direto, sem emoji.
- Nadador em andamento (`data-st="nadando"`): fundo `--rope-soft`, borda `--rope` e barra de 5px à esquerda (o CSS já aplica).

## Exemplo

```jsx
<div className="wrap"><div className="tela">
  <div className="cabeca">
    <div><span className="lbl">Turma da manhã</span><h2>Treino de hoje</h2></div>
    <button className="btn primario">Largar todos</button>
  </div>
  <div className="atletas">
    <div className="atleta" data-st="nadando">
      <div className="at-info">
        <button className="at-nome-btn"><span>Lia Costa</span><span className="seta" aria-hidden="true">›</span></button>
        <span className="at-melhor">melhor 50 m livre: 38,42</span>
      </div>
      <div className="at-acao">
        <div className="at-relogio">21,40</div>
        <button className="btn-cron parar">PARAR</button>
      </div>
    </div>
  </div>
</div></div>
```
