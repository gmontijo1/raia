// Service worker do Raia: guarda o app no aparelho para abrir e funcionar sem internet.
// Ao mudar qualquer arquivo do app, suba a VERSAO aqui e em js/versao.js.

const VERSAO = '0.4.0';
const CACHE = `raia-${VERSAO}`;
const ARQUIVOS = [
  './', 'index.html', 'manifest.webmanifest', 'css/raia.css',
  'js/app.js', 'js/util.js', 'js/db.js', 'js/grafico.js', 'js/exemplo.js', 'js/lancar.js', 'js/versao.js',
  'js/config.js', 'js/nuvem.js', 'js/sincronia.js', 'js/agenda.js', 'js/repeticoes.js', 'js/evolucao.js', 'js/convite.js',
  'js/telas/inicio.js', 'js/telas/turma.js', 'js/telas/treino.js', 'js/telas/nadador.js', 'js/telas/dados.js',
  'js/telas/entrar.js', 'js/telas/aluno.js', 'js/telas/acessos.js', 'vendor/supabase.js',
  'fontes/big-shoulders-display-800.woff2', 'fontes/ibm-plex-sans-var.woff2', 'fontes/ibm-plex-mono-600.woff2',
  'icones/icone.svg', 'icones/icone-180.png', 'icones/icone-192.png', 'icones/icone-512.png', 'icones/icone-maskable-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ARQUIVOS.map(u => new Request(u, { cache: 'reload' })))));
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('raia-') && k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

// O app pede para trocar de versão quando o usuário toca em "Atualizar agora".
self.addEventListener('message', e => { if (e.data === 'atualizar') self.skipWaiting(); });

// Primeiro o que está guardado no aparelho; a rede só se faltar algo.
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    e.respondWith(caches.match('index.html').then(r => r || fetch(req)));
    return;
  }
  e.respondWith(caches.match(req).then(r => r || fetch(req)));
});
