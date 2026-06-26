// Service Worker — Frota Axial
// Estratégia: guarda o "casco" do app (HTML, ícones e libs de CDN) para
// abrir offline. NUNCA faz cache das chamadas ao Supabase (dados/fotos),
// que sempre vão para a rede.

// IMPORTANTE: ao publicar uma nova versão do app, troque o número da versão
// abaixo (ex: v2, v3...). Isso força os celulares a baixarem a versão nova.
const VERSION = 'frota-axial-v38';
const CACHE = VERSION;

// Arquivos essenciais do app (o "casco")
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  // bibliotecas de CDN usadas pelo app (para abrir offline)
  'https://unpkg.com/react@18.3.1/umd/react.production.min.js',
  'https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js',
  'https://unpkg.com/@babel/standalone@7/babel.min.js',
  'https://unpkg.com/@supabase/supabase-js@2',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
];

// Instalação: baixa e guarda o casco
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      // addAll falha se algum recurso falhar; usamos add individual tolerante
      Promise.allSettled(APP_SHELL.map((url) => cache.add(url)))
    ).then(() => self.skipWaiting())
  );
});

// Ativação: limpa caches de versões antigas
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((nomes) =>
      Promise.all(nomes.filter((n) => n !== CACHE).map((n) => caches.delete(n)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Só lidamos com GET. POST/PATCH/DELETE (Supabase) passam direto pela rede.
  if (req.method !== 'GET') return;

  // NUNCA faz cache de chamadas ao Supabase (API e Storage) — sempre rede.
  if (url.hostname.endsWith('supabase.co')) {
    return; // deixa o navegador tratar normalmente (vai à rede)
  }

  // Navegação (abrir o app): network-first, cai pro cache se offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((resp) => {
          const copia = resp.clone();
          caches.open(CACHE).then((c) => c.put('./index.html', copia));
          return resp;
        })
        .catch(() => caches.match('./index.html').then((r) => r || caches.match('./')))
    );
    return;
  }

  // Demais GET (libs, ícones): cache-first, atualiza em segundo plano.
  event.respondWith(
    caches.match(req).then((cacheada) => {
      const rede = fetch(req)
        .then((resp) => {
          if (resp && resp.status === 200) {
            const copia = resp.clone();
            caches.open(CACHE).then((c) => c.put(req, copia));
          }
          return resp;
        })
        .catch(() => cacheada);
      return cacheada || rede;
    })
  );
});

// Permite que a página peça ativação imediata da nova versão
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
