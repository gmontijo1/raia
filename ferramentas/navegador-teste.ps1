# Controla um Edge sem janela pelo protocolo de depuração (CDP) para testar o app.
# Ferramenta para o Claude (este PC não tem Node). Com o servidor rodando na porta 8091:
#   . .\ferramentas\navegador-teste.ps1 -Perfil "<pasta temporária NOVA>"
#   Ir 'http://localhost:8091/#/carregar-exemplo' 3000
#   JS "return document.querySelector('h2').textContent"
#   Foto "<arquivo>.png" 420 1400
#   Fechar
# Use sempre um perfil novo: o modo offline guarda a versão anterior do app no perfil.
param([string]$Perfil, [int]$Porta = 9333)

$edge = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
$script:proc = Start-Process -FilePath $edge -ArgumentList @('--headless=new', '--disable-gpu', '--no-first-run', "--remote-debugging-port=$Porta", "--user-data-dir=$Perfil", '--window-size=520,1400', 'about:blank') -PassThru
$alvos = $null
for ($i = 0; $i -lt 40 -and -not $alvos; $i++) {
  Start-Sleep -Milliseconds 250
  try { $alvos = Invoke-RestMethod "http://localhost:$Porta/json" } catch { }
}
$pagina = $alvos | Where-Object { $_.type -eq 'page' } | Select-Object -First 1
$script:ws = New-Object System.Net.WebSockets.ClientWebSocket
$script:ws.ConnectAsync([Uri]$pagina.webSocketDebuggerUrl, [Threading.CancellationToken]::None).Wait()
$script:seq = 0

function Cdp([string]$metodo, $params) {
  $script:seq++
  $id = $script:seq
  $msg = @{ id = $id; method = $metodo; params = $params } | ConvertTo-Json -Depth 10 -Compress
  $bytes = [Text.Encoding]::UTF8.GetBytes($msg)
  $script:ws.SendAsync([ArraySegment[byte]]$bytes, 'Text', $true, [Threading.CancellationToken]::None).Wait()
  while ($true) {
    $buf = New-Object byte[] 1048576
    $ms = New-Object IO.MemoryStream
    do {
      $r = $script:ws.ReceiveAsync([ArraySegment[byte]]$buf, [Threading.CancellationToken]::None).Result
      $ms.Write($buf, 0, $r.Count)
    } while (-not $r.EndOfMessage)
    $txt = [Text.Encoding]::UTF8.GetString($ms.ToArray())
    $obj = $txt | ConvertFrom-Json
    if ($obj.id -eq $id) { return $obj }
  }
}

# Avalia JavaScript na página (pode ser async) e devolve o valor.
function JS([string]$expr) {
  $r = Cdp 'Runtime.evaluate' @{ expression = "(async () => { $expr })()"; awaitPromise = $true; returnByValue = $true }
  if ($r.result.exceptionDetails) { return 'EXCECAO: ' + $r.result.exceptionDetails.exception.description }
  return $r.result.result.value
}

function Ir([string]$url, [int]$espera = 1500) {
  $null = Cdp 'Page.navigate' @{ url = $url }
  Start-Sleep -Milliseconds $espera
}

function Foto([string]$arquivo, [int]$largura = 420, [int]$altura = 1400) {
  $null = Cdp 'Emulation.setDeviceMetricsOverride' @{ width = $largura; height = $altura; deviceScaleFactor = 1; mobile = $true }
  Start-Sleep -Milliseconds 400
  $r = Cdp 'Page.captureScreenshot' @{ format = 'png'; captureBeyondViewport = $false }
  [IO.File]::WriteAllBytes($arquivo, [Convert]::FromBase64String($r.result.data))
}

function Fechar { try { $script:ws.Dispose() } catch { }; try { Stop-Process -Id $script:proc.Id -Force } catch { } }
