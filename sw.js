// Service Worker — Frota Axial
// Estratégia: guarda o "casco" do app (HTML, ícones e libs de CDN) para
// abrir offline. NUNCA faz cache das chamadas ao Supabase (dados/fotos),
// que sempre vão para a rede.

// IMPORTANTE: ao publicar uma nova versão do app, troque o número da versão
// abaixo (ex: v2, v3...). Isso força os celulares a baixarem a versão nova.
const VERSION = 'frota-axial-v77';
const CACHE = VERSION;

// O que o install baixa: só o que é pequeno e o app não abre sem.
//
// As bibliotecas de CDN (React, ReactDOM, Babel, supabase-js, jsPDF) saíram
// desta lista de propósito. Juntas passam de 3 MB — o Babel sozinho leva mais
// de 2 — e baixar tudo isso no install disputava a rede com as primeiras
// consultas ao Supabase. Num celular de obra isso estourava o tempo limite
// do app e a tela ficava em "Carregando máquinas…" na primeira abertura
// depois de cada publicação.
//
// Elas continuam indo para o cache, só que pelo handler de fetch lá embaixo,
// quando a página realmente as pede. O efeito prático é o mesmo: quem abriu
// o app uma vez tem tudo guardado para abrir offline depois.
const APP_SHELL = [
  './',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
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

  // Navegação (abrir o app): mostra o que está guardado e atualiza por trás.
  //
  // Era network-first: o app esperava baixar 400 KB de index.html antes de
  // desenhar qualquer coisa, a cada abertura. Em obra, com sinal fraco, isso
  // é tela branca por vários segundos mesmo com a versão certa já no celular.
  //
  // Agora quem já abriu o app uma vez vê a tela na hora. A versão nova é
  // baixada em segundo plano e entra na próxima abertura — ou antes, porque
  // o index.html registra o SW e pede ativação assim que detecta atualização.
  if (req.mode === 'navigate') {
    event.respondWith(
      caches.match('./index.html').then((cacheada) => {
        const rede = fetch(req)
          .then((resp) => {
            if (resp && resp.status === 200) {
              const copia = resp.clone();
              caches.open(CACHE).then((c) => c.put('./index.html', copia));
            }
            return resp;
          })
          .catch(() => cacheada || caches.match('./'));
        // Sem cache (primeira visita): espera a rede, que é o único caminho.
        return cacheada || rede;
      })
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
