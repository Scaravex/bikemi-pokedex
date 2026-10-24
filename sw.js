// Service worker: tiene una copia dell'app e dei file che non cambiano, così
// l'app si apre anche senza rete e si installa sulla schermata Home.
//
// Il nome va cambiato solo se cambia il modo di mettere in cache, non a ogni
// aggiornamento dell'app: la pagina si prende dalla rete, quindi si aggiorna da sé.
const CACHE = 'bikemi-v3';
const SHELL = ['./', './index.html', './manifest.json', './icons/icon-192.png', './icons/icon-512.png'];

// Installazione: mette subito in cache l'essenziale per aprire l'app offline.
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)));
  self.skipWaiting();
});

// Attivazione: cancella le cache delle versioni precedenti.
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

// Ogni richiesta dell'app passa da qui e decide se servire la rete o la cache.
// Le richieste non elencate (per esempio il servizio dei percorsi) vanno in rete
// senza intervento.
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Sprite, libreria della mappa e tile: non cambiano, la cache va prima.
  const immutabile = url.hostname === 'raw.githubusercontent.com' ||
                     url.hostname === 'unpkg.com' ||
                     url.hostname === 'tile.openstreetmap.org';
  // Ogni scrittura in cache passa da waitUntil: senza, il browser può spegnere
  // il service worker prima che il salvataggio finisca.
  const salva = (r) => { if (r.ok) { const copia = r.clone(); e.waitUntil(caches.open(CACHE).then(c => c.put(req, copia))); } return r; };

  if (immutabile) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(salva)));
    return;
  }

  // L'app e l'elenco stazioni devono restare aggiornati: rete prima, cache solo
  // offline. Con la cache prima, chi aveva aperto l'app una volta restava
  // per sempre sulla vecchia versione, e il feed stazioni non si rinnovava mai.
  const fresco = url.origin === self.location.origin || url.hostname.endsWith('urbansharing.com');
  if (fresco) {
    // cache:'no-cache' obbliga a ricontrollare col server anche se l'host non
    // dice per quanto tenere la pagina: altrimenti il browser può riusare una
    // copia vecchia e la "rete prima" diventa solo apparente.
    e.respondWith(
      fetch(req, { cache: 'no-cache' }).then(salva).catch(() => caches.match(req, { ignoreSearch: true }).then(hit =>
        hit || (req.mode === 'navigate' ? caches.match('./index.html').then(i => i || Response.error()) : Response.error())
      ))
    );
  }
});
