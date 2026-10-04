# Notas da sincronia com o Claude Design

- **Projeto no Claude Design:** https://claude.ai/design/p/78456406-bb9d-4474-9a54-889dce596c98
  (primeira sincronia em 04/10/2026, 12 arquivos).
- **Sistema só de estilo.** O Raia não tem componentes React nem build. O conversor roda no modo
  "tokens-only": `_ds_bundle.js` vazio (`window.Raia = {}`), `_ds_bundle.css` = `app/css/raia.css`
  sem mudança, fontes de `app/fontes/`. O guia para o agente de design está em `conventions.md`
  (ligado por `readmeHeader`) e é o que ensina o vocabulário de classes.
- **O "pacote" é montado na hora** por `bash .design-sync/preparar-pacote.sh` (é o `buildCmd`):
  copia o CSS e as fontes para `.ds-sync/pacote/` com um `package.json` mínimo. Assim o repositório
  não precisa de `package.json` na raiz. Rode o script antes de cada build.
- **PC sem Node.** Usamos o Node portátil v24 LTS baixado do nodejs.org (conferido pelo SHA256)
  numa pasta temporária da sessão, sem instalar no Windows. Essa pasta some: numa sessão nova,
  baixe de novo (https://nodejs.org/dist/index.json, primeira versão LTS com `win-x64-zip`). Dependências do conversor em `.ds-sync/`:
  `npm i esbuild ts-morph @types/react react react-dom playwright` com
  `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`. O npm 11 bloqueia o postinstall do esbuild; funciona assim mesmo.
- **Render check com o Edge do Windows**, sem baixar o Chromium:
  `DS_CHROMIUM_PATH="C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"`.
- **React 19** no `_vendor/` (sem UMD, o conversor empacota com esbuild). O app não usa React;
  é só o runtime dos desenhos do agente.
- Comando completo, a partir da raiz do repositório:
  `bash .design-sync/preparar-pacote.sh && node .ds-sync/resync.mjs --config .design-sync/config.json --node-modules .ds-sync/node_modules --out ./ds-bundle [--remote .design-sync/.cache/remote-sync.json]`

- **Logo do projeto** (desde a v0.5.0 está no app): `app/marca/logo-completo.png` e
  `logo-simbolo.png`, branco com transparência, usados como máscara nas classes `.logo-projeto` e
  `.logo-projeto-simbolo` do `raia.css`. O conversor não leva imagens, então o
  `preparar-pacote.sh` anexa ao pacote as duas regras com o logo embutido em data URI.
- **Desenhos do GÊ dentro do projeto** (`templates/`, `uploads/`): são dele, feitos no Claude
  Design. A sincronia nunca apaga nada fora das pastas que ela mesma gera. A tela da v0.5.0 veio de
  `templates/app-natacao-ufla/` (opção "2a").

## Riscos na próxima sincronia

- O logo foi tirado de um print em baixa resolução (540×319). Se aparecer o arquivo original,
  troque os dois PNG em `app/marca/` (mesma proporção, ou ajuste o `aspect-ratio` no `raia.css`).

- `conventions.md` cita classes e tokens à mão. Se `app/css/raia.css` renomear ou remover alguma
  classe, o guia fica errado. Antes de enviar, confira cada nome citado contra o `_ds_bundle.css`.
- O design system no formato Artifact (claude.ai/artifact/73oVPuG9FL9NprUk1SCWgz) é separado deste
  projeto e não é atualizado pela sincronia.
- Sem cartões de componente: o painel do Claude Design mostra só cores, fontes e o guia.
