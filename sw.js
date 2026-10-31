/* Service worker de la Biblioteca agropecuaria.
   Guarda los archivos de la app para abrirla sin conexión.
   Al publicar una versión nueva, cambiá CACHE (por ejemplo v0.1.2). Mantené el prefijo. */
var PREFIJO = "biblioteca-agro-";
var CACHE = PREFIJO + "v0.1.1";
var ARCHIVOS = [
  "./",
  "index.html",
  "estilos.css",
  "app.js",
  "manifest.webmanifest",
  "datos/semilla.json",
  "iconos/icono-192.png",
  "iconos/icono-512.png",
  "iconos/apple-touch-icon.png"
];

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(ARCHIVOS); }));
});

// Borra solo las cachés viejas de esta app (mismo prefijo, otra versión).
// Las cachés de otros proyectos publicados en el mismo dominio no se tocan.
self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (claves) {
      return Promise.all(claves.filter(function (k) {
        return k.indexOf(PREFIJO) === 0 && k !== CACHE;
      }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

// Busca primero en la caché propia de la app, no en todas las cachés del dominio.
self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // los enlaces externos van directo a internet
  e.respondWith(
    caches.open(CACHE).then(function (cache) {
      return cache.match(req, { ignoreSearch: true }).then(function (guardado) {
        if (guardado) return guardado;
        return fetch(req).catch(function () {
          if (req.mode === "navigate") {
            return cache.match("index.html").then(function (inicio) {
              return inicio || new Response("Sin conexión", { status: 503, statusText: "Sin conexión" });
            });
          }
          return new Response("Sin conexión", { status: 503, statusText: "Sin conexión" });
        });
      });
    })
  );
});
