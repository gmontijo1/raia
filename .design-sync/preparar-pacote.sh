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
# O conversor só leva fontes, não imagens: o raia.css aponta o logo para ../marca/*.png,
# que não existe no Claude Design. Aqui o logo vai embutido (data URI) por cima dessas regras.
{
  echo
  echo '/* logo embutido para o Claude Design (o app usa os arquivos em marca/) */'
  for nome in logo-completo:logo-projeto logo-simbolo:logo-projeto-simbolo; do
    arq="app/marca/${nome%%:*}.png"; classe="${nome##*:}"
    uri="data:image/png;base64,$(base64 -w0 "$arq")"
    echo ".$classe { -webkit-mask-image: url(\"$uri\"); mask-image: url(\"$uri\"); }"
  done
} >> "$P/css/raia.css"
printf '{"name":"raia","version":"%s","private":true,"main":"index.js"}\n' "$VERSAO" > "$P/package.json"
echo 'export {};' > "$P/index.js"
echo "pacote raia@$VERSAO pronto em $P (com o logo embutido)"
