// Permite abrir la app sin internet. Primero intenta la red, para que cada cambio que se
// publique en GitHub llegue solo; si no hay conexión, usa la última copia guardada.
// Los datos NO pasan por aquí: Google Apps Script se comunica directo y nunca se guarda en caché.
const CACHE = 'sistema-tareas-v5';
const CACHE_FUENTES = 'sistema-tareas-fuentes-v1';
const ARCHIVOS = [
    './', 'index.html', 'finanzas.html', 'styles.css', 'app.js', 'vistas.js', 'pwa.js', 'manifest.webmanifest',
    'vendor/lucide.min.js', 'vendor/jspdf.umd.min.js', 'vendor/jspdf.plugin.autotable.min.js',
    'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png',
    'icons/apple-touch-icon.png', 'icons/favicon-48.png'
];

self.addEventListener('install', (e) => {
    e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARCHIVOS.map((a) => new Request(a, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys()
            .then((claves) => Promise.all(claves
                .filter((k) => k !== CACHE && k !== CACHE_FUENTES)
                .map((k) => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

// Aviso diario enviado desde GitHub: llega aunque la app esté cerrada.
self.addEventListener('push', (e) => {
    let aviso = {};
    try { aviso = e.data ? e.data.json() : {}; } catch (err) { aviso = { cuerpo: e.data.text() }; }
    e.waitUntil(self.registration.showNotification(aviso.titulo || 'Sistema de Tareas', {
        body: aviso.cuerpo || '',
        tag: aviso.tag,
        renotify: Boolean(aviso.tag), // vuelve a sonar aunque reemplace al anterior
        requireInteraction: true,
        vibrate: [300, 150, 300, 150, 300],
        icon: 'icons/icon-192.png',
        badge: 'icons/favicon-48.png',
        data: { url: aviso.url || 'index.html' }
    }));
});

self.addEventListener('notificationclick', (e) => {
    e.notification.close();
    const destino = new URL(e.notification.data?.url || 'index.html', self.registration.scope).href;
    e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((ventanas) => {
        const abierta = ventanas.find((v) => v.url.startsWith(self.registration.scope));
        if (abierta) return abierta.focus();
        return self.clients.openWindow(destino);
    }));
});

self.addEventListener('fetch', (e) => {
    const { request } = e;
    if (request.method !== 'GET') return;
    const url = new URL(request.url);

    if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
        e.respondWith(caches.open(CACHE_FUENTES).then(async (c) => {
            const guardada = await c.match(request);
            if (guardada) return guardada;
            const resp = await fetch(request);
            if (resp.ok || resp.type === 'opaque') c.put(request, resp.clone());
            return resp;
        }));
        return;
    }

    if (url.origin !== self.location.origin) return; // Apps Script y demás: sin tocar

    // no-cache: GitHub deja guardar cada archivo 10 minutos, y tras publicar se mezclarían versiones.
    e.respondWith(
        fetch(request.url, { cache: 'no-cache' })
            .then((resp) => {
                if (resp.ok) {
                    const copia = resp.clone();
                    caches.open(CACHE).then((c) => c.put(request, copia));
                }
                return resp;
            })
            .catch(async () => {
                const guardada = await caches.match(request, { ignoreSearch: true });
                if (guardada) return guardada;
                if (request.mode === 'navigate') return caches.match('index.html');
                return Response.error();
            })
    );
});
