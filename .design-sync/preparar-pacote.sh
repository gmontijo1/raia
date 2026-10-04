#!/usr/bin/env bash
# Monta em .ds-sync/pacote/ o "pacote" que o conversor do /design-sync lê.
# O Raia não tem build nem componentes React: o pacote é o CSS real do app
# (app/css/raia.css, com as cores em :root) e as fontes, copiados sem mudança.
# Rode a partir da raiz do repositório antes de cada sincronia.
set -euo pipefail
cd "$(dirname "$0")/.."
VERSAO=$(sed -n "s/^export const VERSAO_APP = '\(.*\)';/\1/p" app/js/versao.js)
P=.ds-sync/pacote
rm -rf "$P"
mkdir -p "$P/css" "$P/fontes"
cp app/css/raia.css "$P/css/"
cp app/fontes/*.woff2 "$P/fontes/"
# Extras que não podem ir para o repositório público (ficam em privado/, ignorado pelo git):
# privado/marca/marca.css traz o logo do projeto embutido, só para o Claude Design.
if [ -f privado/marca/marca.css ]; then
  cat privado/marca/marca.css >> "$P/css/raia.css"
  echo "incluído privado/marca/marca.css (logo do projeto)"
else
  echo "aviso: privado/marca/marca.css não existe neste PC; o logo do projeto não vai no pacote"
fi
printf '{"name":"raia","version":"%s","private":true,"main":"index.js"}\n' "$VERSAO" > "$P/package.json"
echo 'export {};' > "$P/index.js"
echo "pacote raia@$VERSAO pronto em $P"
