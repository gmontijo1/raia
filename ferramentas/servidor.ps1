# Servidor local do Raia: abre o app em http://localhost:8080 neste PC, sem instalar nada.
# Uso normal: dois cliques em "Abrir Raia.cmd", na pasta do projeto. Para parar, feche a janela.

param([int]$Porta = 8080)

$raiz = (Resolve-Path (Join-Path $PSScriptRoot '..\app')).Path
$tipos = @{
  '.html' = 'text/html; charset=utf-8'; '.js' = 'text/javascript; charset=utf-8'; '.css' = 'text/css; charset=utf-8'
  '.json' = 'application/json'; '.webmanifest' = 'application/manifest+json'; '.svg' = 'image/svg+xml'
  '.png' = 'image/png'; '.woff2' = 'font/woff2'; '.ico' = 'image/x-icon'
}

$servidor = New-Object System.Net.HttpListener
$servidor.Prefixes.Add("http://localhost:$Porta/")
try { $servidor.Start() } catch {
  Write-Host "Não consegui usar a porta $Porta. Talvez o Raia já esteja aberto em outra janela." -ForegroundColor Yellow
  Read-Host 'Aperte Enter para fechar'
  exit 1
}
Write-Host "Raia rodando em http://localhost:$Porta" -ForegroundColor Cyan
Write-Host 'Deixe esta janela aberta enquanto usa o app. Para parar, feche a janela.'
if (-not $env:RAIA_SEM_NAVEGADOR) { Start-Process "http://localhost:$Porta/" }

try {
  while ($servidor.IsListening) {
    $ctx = $servidor.GetContext()
    $caminho = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath).TrimStart('/')
    if ($caminho -eq '') { $caminho = 'index.html' }
    $arquivo = [System.IO.Path]::GetFullPath((Join-Path $raiz $caminho))
    $resp = $ctx.Response
    if ($arquivo.StartsWith($raiz) -and (Test-Path -LiteralPath $arquivo -PathType Leaf)) {
      $bytes = [System.IO.File]::ReadAllBytes($arquivo)
      $ext = [System.IO.Path]::GetExtension($arquivo).ToLower()
      $resp.ContentType = if ($tipos.ContainsKey($ext)) { $tipos[$ext] } else { 'application/octet-stream' }
      $resp.Headers.Add('Cache-Control', 'no-cache')
      $resp.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
      $resp.StatusCode = 404
    }
    $resp.Close()
  }
} finally {
  $servidor.Stop()
}
