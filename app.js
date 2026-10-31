/* Biblioteca agropecuaria — v0.1.1
   Todo funciona en el navegador. Los datos quedan en este dispositivo (IndexedDB).
   No hay servidor, cuentas ni dependencias externas. */
(function () {
  "use strict";

  var APP_VERSION = "0.1.1";
  var DB_NOMBRE = "biblioteca-agro";
  var DB_VERSION = 1;
  var FORMATO_RESPALDO = "biblioteca-agro-respaldo";

  var CONJUNTOS = {
    "inventario-26": "Inventario original (26 entradas)",
    "candidatas-n1-n12": "Candidatas N1–N12",
    "fichas-f01-f09": "Fichas F-01 a F-09",
    "tanda2-f10-f15": "Fichas F-10 a F-15 (segunda tanda)",
    "tanda3-f16-f23": "Fichas F-16 a F-23 (tercera tanda)",
    "registros-norma": "Registros de norma",
    "mis-fuentes": "Mis fuentes (cargadas en la app)"
  };

  var ESTADOS_FUENTE = {
    "verificada": { txt: "Verificada en su contenido", ayuda: "Abriste el documento (original o copia íntegra con autoría identificada) y confirmaste título, autoría, fecha y alcance. No significa que aplique a la Cuenca del Salado ni que sea una recomendación." },
    "metadatos": { txt: "Solo metadatos", ayuda: "Confirmaste datos de catálogo, de una ficha oficial o de una nota que describe la fuente, pero no leíste la fuente." },
    "pendiente": { txt: "Pendiente", ayuda: "La página no cargó, o solo hay una nota de prensa sin enlace oficial." },
    "sin-clasificar": { txt: "Sin clasificar", ayuda: "El estado no se pudo asignar al importar: revisá la ficha original." }
  };

  var ESTADOS_OBS = {
    "pendiente": { txt: "Pendiente", css: "pendiente", ayuda: "Recién registrada, sin análisis. No se usa como criterio." },
    "requiere": { txt: "Requiere más datos", css: "requiere", ayuda: "Falta un dato clave o hay contradicción. Anotá cuál en el motivo." },
    "confirmada": { txt: "Confirmada por mí", css: "confirmada", ayuda: "La volviste a observar o la aceptás como criterio personal. No es evidencia publicada." },
    "respaldada": { txt: "Respaldada", css: "respaldada", ayuda: "Coincide con una fuente (indicá el ID) o la validó un profesional (rol y fecha). Solo si esa revisión ocurrió de verdad." },
    "descartada": { txt: "Descartada", css: "descartada", ayuda: "No se repitió, se refutó o tenía otra causa. Se conserva como antecedente." }
  };

  var TIPOS_AFIRMACION = ["Obligación legal", "Dato de fuente", "Recomendación técnica", "Cálculo", "Inferencia", "Consejo general", "Requiere profesional o autoridad", "Experiencia propia", "Sin evidencia"];

  var APLICABILIDAD = {
    "sin-clasificar": "Sin clasificar",
    "local": "Local (Cuenca del Salado)",
    "regional-similar": "Regional similar",
    "otra-region": "Otra región",
    "general": "General (no depende de la región)"
  };

  var COPIA_OFFLINE = {
    "no-verificada": "Licencia no verificada: guardar solo ficha y enlace",
    "permitida": "Copia permitida por la licencia (verificada)",
    "no-permitida": "Copia no permitida: guardar solo ficha y enlace"
  };

  var db = null;
  var datos = { fuentes: [], afirmaciones: [], observaciones: [], fotos: [] };
  var meta = {};
  var urlsFotos = [];

  // ---------------------------------------------------------------- utilidades
  function esc(v) {
    return String(v == null ? "" : v)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function normalizar(t) {
    return String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  }
  function hoyISO() {
    var d = new Date();
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function ahoraISO() { return new Date().toISOString(); }
  function urlSegura(u) { return /^https?:\/\//i.test(String(u || "")) ? String(u) : ""; }
  function enlaceExterno(u, texto) {
    var s = urlSegura(u);
    if (!s) return esc(texto || u || "");
    return '<a href="' + esc(s) + '" target="_blank" rel="noopener noreferrer">' + esc(texto || s) + "</a>";
  }
  // Convierte enlaces markdown [texto](url) en enlaces seguros; el resto se escapa.
  function textoConEnlaces(t) {
    var s = String(t || "");
    var out = "", ultimo = 0, re = /\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g, m;
    while ((m = re.exec(s))) {
      out += esc(s.slice(ultimo, m.index).replace(/\*\*/g, "")) + enlaceExterno(m[2], m[1]);
      ultimo = re.lastIndex;
    }
    return out + esc(s.slice(ultimo).replace(/\*\*/g, ""));
  }
  function badgeFuente(estado) {
    var e = ESTADOS_FUENTE[estado] || ESTADOS_FUENTE["sin-clasificar"];
    return '<span class="estado estado-' + esc(estado) + '">' + esc(e.txt) + "</span>";
  }
  function badgeObs(estado) {
    var e = ESTADOS_OBS[estado] || ESTADOS_OBS.pendiente;
    return '<span class="estado estado-' + e.css + '">' + esc(e.txt) + "</span>";
  }
  function porId(lista, id) {
    for (var i = 0; i < lista.length; i++) if (lista[i].id === id) return lista[i];
    return null;
  }
  function siguienteId(prefijo, lista) {
    var fecha = hoyISO().replace(/-/g, "");
    var base = prefijo + "-" + fecha + "-";
    var max = 0;
    lista.forEach(function (r) {
      if (r.id && r.id.indexOf(base) === 0) {
        var n = parseInt(r.id.slice(base.length), 10);
        if (n > max) max = n;
      }
    });
    return base + pad(max + 1);
  }
  function $(sel) { return document.querySelector(sel); }
  function vista(html) {
    urlsFotos.forEach(function (u) { URL.revokeObjectURL(u); });
    urlsFotos = [];
    var v = $("#vista");
    v.innerHTML = html;
    window.scrollTo(0, 0);
    return v;
  }
  function textoBusqueda(r, campos) {
    return normalizar(campos.map(function (c) {
      var v = r[c];
      if (Array.isArray(v)) return v.map(function (x) { return typeof x === "object" ? JSON.stringify(x) : x; }).join(" ");
      return v || "";
    }).join(" "));
  }

  // ---------------------------------------------------------------- base de datos
  function abrirDB() {
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB_NOMBRE, DB_VERSION);
      req.onupgradeneeded = function () {
        var d = req.result;
        if (!d.objectStoreNames.contains("fuentes")) d.createObjectStore("fuentes", { keyPath: "id" });
        if (!d.objectStoreNames.contains("afirmaciones")) d.createObjectStore("afirmaciones", { keyPath: "id" });
        if (!d.objectStoreNames.contains("observaciones")) d.createObjectStore("observaciones", { keyPath: "id" });
        if (!d.objectStoreNames.contains("fotos")) {
          var f = d.createObjectStore("fotos", { keyPath: "id" });
          f.createIndex("obs_id", "obs_id", { unique: false });
        }
        if (!d.objectStoreNames.contains("meta")) d.createObjectStore("meta", { keyPath: "k" });
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }
  function todos(store) {
    return new Promise(function (resolve, reject) {
      var req = db.transaction(store, "readonly").objectStore(store).getAll();
      req.onsuccess = function () { resolve(req.result || []); };
      req.onerror = function () { reject(req.error); };
    });
  }
  function guardar(store, registros) {
    if (!Array.isArray(registros)) registros = [registros];
    return new Promise(function (resolve, reject) {
      var tx = db.transaction(store, "readwrite");
      var os = tx.objectStore(store);
      registros.forEach(function (r) { os.put(r); });
      tx.oncomplete = function () { resolve(); };
      tx.onerror = function () { reject(tx.error); };
      tx.onabort = function () { reject(tx.error || new Error("Transacción cancelada")); };
    });
  }
  function guardarMeta(k, v) { meta[k] = v; return guardar("meta", { k: k, v: v }); }

  function cargarTodo() {
    return Promise.all([todos("fuentes"), todos("afirmaciones"), todos("observaciones"), todos("meta")]).then(function (r) {
      datos.fuentes = r[0]; datos.afirmaciones = r[1]; datos.observaciones = r[2];
      meta = {};
      r[3].forEach(function (m) { meta[m.k] = m.v; });
      indexar();
    });
  }
  function indexar() {
    datos.fuentes.forEach(function (f) {
      f._busqueda = textoBusqueda(f, ["id", "alias", "titulo", "autoria", "tipo", "areas", "region", "aplicabilidad_texto", "jurisdiccion", "que_se_reviso", "respalda", "aporta", "limites", "no_permite_concluir", "marca_uso", "relacion_texto", "ficha_original", "estado_nota", "lecturas"]);
    });
    datos.afirmaciones.forEach(function (a) {
      a._busqueda = textoBusqueda(a, ["id", "texto", "cita_exacta", "tipo", "respaldo", "uso", "fuente_ids", "region"]);
    });
    datos.observaciones.forEach(function (o) {
      o._busqueda = textoBusqueda(o, ["id", "lugar", "observe", "contexto", "condiciones", "decision", "resultado", "interpretacion", "falto", "confirmaria", "no_aplicaria", "fuentes_relacionadas"]);
    });
  }
  function limpio(r) { // sin campos internos de la app
    var c = {};
    Object.keys(r).forEach(function (k) { if (k.charAt(0) !== "_") c[k] = r[k]; });
    return c;
  }

  // Carga la semilla: agrega los registros que faltan y actualiza solo los importados
  // que nunca editaste (versión 1, origen "base-importada"). Lo que editaste no se pisa.
  function cargarSemilla() {
    return fetch("datos/semilla.json", { cache: "no-cache" }).then(function (r) {
      if (!r.ok) throw new Error("No se pudo leer la semilla (" + r.status + ")");
      return r.json();
    }).then(function (s) {
      if ((meta.semilla_version || 0) >= s.version_semilla) return;
      var informe = { nuevas: 0, actualizadas: [], conservadas: [] };
      function elegir(lista, actuales) {
        return lista.filter(function (reg) {
          var ya = porId(actuales, reg.id);
          if (!ya) { informe.nuevas++; return true; }
          if (JSON.stringify(limpio(ya)) === JSON.stringify(reg)) return false;
          if (ya.origen_registro === "base-importada" && (ya.version || 1) === 1) { informe.actualizadas.push(reg.id); return true; }
          informe.conservadas.push(reg.id);
          return false;
        });
      }
      var f = elegir(s.fuentes, datos.fuentes);
      var a = elegir(s.afirmaciones, datos.afirmaciones);
      return guardar("fuentes", f)
        .then(function () { return guardar("afirmaciones", a); })
        .then(function () { return guardarMeta("semilla_version", s.version_semilla); })
        .then(function () {
          return guardarMeta("semilla_importada", {
            fecha: ahoraISO(), version: s.version_semilla, origen: s.origen,
            nuevas: informe.nuevas, actualizadas: informe.actualizadas, conservadas: informe.conservadas
          });
        })
        .then(cargarTodo);
    });
  }

  // ---------------------------------------------------------------- navegación
  function marcarNav(seccion) {
    document.querySelectorAll(".navegacion a").forEach(function (a) {
      a.classList.toggle("activa", a.getAttribute("data-seccion") === seccion);
    });
  }
  function ruta() {
    var h = location.hash.replace(/^#\/?/, "");
    var partes = h.split("?");
    var segs = partes[0].split("/").map(decodeURIComponent);
    var params = {};
    if (partes[1]) partes[1].split("&").forEach(function (p) { var kv = p.split("="); params[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1] || ""); });
    var r = segs[0] || "buscar";
    var id = segs[1] || "";
    var mapa = {
      "buscar": ["buscar", vistaBuscar],
      "fuentes": ["fuentes", vistaFuentes],
      "fuente": ["fuentes", function () { vistaFuente(id); }],
      "fuente-nueva": ["fuentes", function () { vistaFormFuente(null); }],
      "fuente-editar": ["fuentes", function () { vistaFormFuente(id); }],
      "afirmacion": ["buscar", function () { vistaAfirmacion(id); }],
      "afirmacion-nueva": ["buscar", function () { vistaFormAfirmacion(params.fuente || ""); }],
      "campo": ["campo", vistaCampo],
      "observacion": ["campo", function () { vistaObservacion(id); }],
      "observacion-nueva": ["campo", function () { vistaFormObservacion(null); }],
      "observacion-editar": ["campo", function () { vistaFormObservacion(id); }],
      "respaldo": ["respaldo", vistaRespaldo]
    };
    var destino = mapa[r] || mapa.buscar;
    marcarNav(destino[0]);
    destino[1]();
  }

  // ---------------------------------------------------------------- Buscar
  var ultimaBusqueda = "";
  function coincide(r, palabras) {
    for (var i = 0; i < palabras.length; i++) if (r._busqueda.indexOf(palabras[i]) === -1) return false;
    return true;
  }
  function vistaBuscar() {
    vista(
      '<h2>Buscar</h2>' +
      '<label class="solo-lectores" for="q">Buscar en fuentes, afirmaciones y observaciones</label>' +
      '<input id="q" class="buscador" type="search" autocomplete="off" placeholder="Ej.: brucelosis, Dolores, agua, F-19" value="' + esc(ultimaBusqueda) + '">' +
      '<p class="resumen">Busca en las fichas, en las afirmaciones y en tus observaciones. Todas las palabras deben aparecer; no importan las tildes.</p>' +
      '<div id="resultados"></div>'
    );
    var q = $("#q");
    var t = null;
    q.addEventListener("input", function () { clearTimeout(t); t = setTimeout(function () { ultimaBusqueda = q.value; pintarResultados(); }, 120); });
    pintarResultados();
  }
  function pintarResultados() {
    var cont = $("#resultados");
    if (!cont) return;
    var palabras = normalizar(ultimaBusqueda).split(/\s+/).filter(Boolean);
    if (!palabras.length) {
      cont.innerHTML = '<p class="vacio">Escribí una o más palabras. Hay ' + datos.fuentes.length + ' fuentes, ' + datos.afirmaciones.length + ' afirmaciones y ' + datos.observaciones.length + ' observaciones guardadas.</p>';
      return;
    }
    var f = datos.fuentes.filter(function (r) { return coincide(r, palabras); });
    var a = datos.afirmaciones.filter(function (r) { return coincide(r, palabras); });
    var o = datos.observaciones.filter(function (r) { return coincide(r, palabras); });
    var html = "";
    if (!f.length && !a.length && !o.length) {
      cont.innerHTML = '<p class="vacio">Sin resultados en lo guardado. Que no esté acá no significa que no exista: falta buscarlo y registrarlo.</p>';
      return;
    }
    if (f.length) html += '<p class="grupo-titulo">Fuentes (' + f.length + ")</p>" + listaFuentes(f);
    if (a.length) html += '<p class="grupo-titulo">Afirmaciones (' + a.length + ")</p>" + listaAfirmaciones(a);
    if (o.length) html += '<p class="grupo-titulo">Observaciones propias (' + o.length + ")</p>" + listaObservaciones(o);
    cont.innerHTML = html;
  }

  // ---------------------------------------------------------------- Fuentes
  var filtroConjunto = "todos", filtroEstado = "todos";
  function listaFuentes(lista) {
    return '<ul class="lista">' + lista.map(function (f) {
      return '<li><a class="item" href="#/fuente/' + encodeURIComponent(f.id) + '">' +
        '<div class="item-id">' + esc(f.id) + (f.alias ? " · " + esc(f.alias) : "") + "</div>" +
        '<div class="item-titulo">' + esc(f.titulo) + "</div>" +
        '<div class="item-extra">' + badgeFuente(f.estado) + " " + esc(CONJUNTOS[f.conjunto] || f.conjunto) + "</div>" +
        "</a></li>";
    }).join("") + "</ul>";
  }
  function ordenFuentes(a, b) {
    var orden = Object.keys(CONJUNTOS);
    var d = orden.indexOf(a.conjunto) - orden.indexOf(b.conjunto);
    if (d) return d;
    return a.id.localeCompare(b.id, "es", { numeric: true });
  }
  function vistaFuentes() {
    var opciones = '<option value="todos">Todos los conjuntos</option>' + Object.keys(CONJUNTOS).map(function (k) {
      return '<option value="' + k + '"' + (filtroConjunto === k ? " selected" : "") + ">" + esc(CONJUNTOS[k]) + "</option>";
    }).join("");
    var chips = ["todos", "verificada", "metadatos", "pendiente"].map(function (e) {
      var txt = e === "todos" ? "Todos los estados" : ESTADOS_FUENTE[e].txt;
      return '<button type="button" class="chip" data-estado="' + e + '" aria-pressed="' + (filtroEstado === e) + '">' + esc(txt) + "</button>";
    }).join("");
    vista(
      '<h2>Fuentes</h2>' +
      '<div class="botonera"><a class="boton" href="#/fuente-nueva">Nueva fuente</a></div>' +
      '<label class="solo-lectores" for="conjunto">Conjunto</label><select id="conjunto" class="selector">' + opciones + "</select>" +
      '<div class="filtros">' + chips + "</div>" +
      '<p id="conteo" class="resumen"></p>' +
      '<div id="lista-fuentes"></div>'
    );
    $("#conjunto").addEventListener("change", function (e) { filtroConjunto = e.target.value; pintarFuentes(); });
    document.querySelectorAll(".chip[data-estado]").forEach(function (b) {
      b.addEventListener("click", function () {
        filtroEstado = b.getAttribute("data-estado");
        document.querySelectorAll(".chip[data-estado]").forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); });
        pintarFuentes();
      });
    });
    pintarFuentes();
  }
  function pintarFuentes() {
    var base = datos.fuentes.filter(function (f) { return filtroConjunto === "todos" || f.conjunto === filtroConjunto; });
    var lista = base.filter(function (f) { return filtroEstado === "todos" || f.estado === filtroEstado; }).sort(ordenFuentes);
    var c = { verificada: 0, metadatos: 0, pendiente: 0, "sin-clasificar": 0 };
    base.forEach(function (f) { c[f.estado] = (c[f.estado] || 0) + 1; });
    var txt = base.length + " fuentes: " + c.verificada + " verificadas · " + c.metadatos + " solo metadatos · " + c.pendiente + " pendientes";
    if (c["sin-clasificar"]) txt += " · " + c["sin-clasificar"] + " sin clasificar";
    if (filtroConjunto === "todos") txt += ". Ojo: los conjuntos se solapan (una candidata N puede tener su ficha F); el conteo oficial es el del inventario de 26.";
    $("#conteo").textContent = txt;
    $("#lista-fuentes").innerHTML = lista.length ? listaFuentes(lista) : '<p class="vacio">No hay fuentes con esos filtros.</p>';
  }

  function filaDato(titulo, valor, conEnlaces) {
    if (valor == null || valor === "" || (Array.isArray(valor) && !valor.length)) return "";
    return "<dt>" + esc(titulo) + "</dt><dd>" + (conEnlaces ? textoConEnlaces(valor) : esc(valor)) + "</dd>";
  }
  // Qué se leyó de cada documento citado por una ficha (si la ficha lo detalla).
  function tablaLecturas(f) {
    if (!f.lecturas || !f.lecturas.length) return "";
    var filas = f.lecturas.map(function (l) {
      var noAbierto = /^no abierto/i.test(l.alcance || "");
      return "<tr><th>" + (urlSegura(l.url) ? enlaceExterno(l.url, l.documento) : esc(l.documento)) + "</th>" +
        "<td><strong" + (noAbierto ? ' class="error"' : "") + ">" + esc(l.alcance) + "</strong><br>" + esc(l.respalda) + "</td></tr>";
    }).join("");
    return "<h3>Qué se leyó en cada documento</h3>" +
      '<table class="tabla-original tabla-lecturas"><thead><tr><th>Documento</th><td><strong>Alcance de la lectura · qué respalda</strong></td></tr></thead><tbody>' + filas + "</tbody></table>";
  }

  function vistaFuente(id) {
    var f = porId(datos.fuentes, id);
    if (!f) { vista('<h2>No encontrada</h2><p>No hay ninguna fuente con el ID ' + esc(id) + '.</p><a href="#/fuentes">Volver</a>'); return; }
    var usoLimitado = (f.areas || []).some(function (a) { return a === "SAN" || a === "FIT"; });
    var afs = datos.afirmaciones.filter(function (a) { return (a.fuente_ids || []).indexOf(f.id) !== -1; });
    var obs = datos.observaciones.filter(function (o) { return normalizar(o.fuentes_relacionadas).indexOf(normalizar(f.id)) !== -1; });
    var rels = (f.relaciones || []).map(function (r) {
      var destino = porId(datos.fuentes, r.id) || porId(datos.fuentes, "F-20261030-" + String(r.id).replace("F-", ""));
      var idReal = destino ? destino.id : r.id;
      return "<li>" + (destino ? '<a href="#/fuente/' + encodeURIComponent(idReal) + '">' + esc(idReal) + "</a>" : esc(r.id)) + " — " + esc(r.tipo) + "</li>";
    }).join("");
    var extra = (f.enlaces_extra || []).map(function (e) { return "<li>" + enlaceExterno(e.url, e.texto) + "</li>"; }).join("");
    var original = (f.ficha_original || []).map(function (r) {
      return "<tr><th>" + esc(r.campo) + "</th><td>" + textoConEnlaces(r.contenido) + "</td></tr>";
    }).join("");
    var hist = (f.historial || []).slice().reverse().map(function (h) {
      return "<li><strong>" + esc(h.fecha) + "</strong> · " + esc(h.accion) + " · " + esc(h.por) + "<br>" + esc(h.detalle) + "</li>";
    }).join("");
    var p = f.procedencia || {};
    vista(
      '<p class="item-id">' + esc(f.id) + (f.alias ? " · " + esc(f.alias) : "") + " · " + esc(CONJUNTOS[f.conjunto] || f.conjunto) + " · v" + esc(f.version || 1) + "</p>" +
      "<h2>" + esc(f.titulo) + "</h2>" +
      "<p>" + badgeFuente(f.estado) + "</p>" +
      '<p class="resumen">' + esc((ESTADOS_FUENTE[f.estado] || ESTADOS_FUENTE["sin-clasificar"]).ayuda) + "</p>" +
      (f.estado_nota ? '<div class="caja limite"><strong>Alcance de la verificación:</strong> ' + esc(f.estado_nota) + "</div>" : "") +
      tablaLecturas(f) +
      (usoLimitado ? '<div class="caja limite">Uso limitado: solo para estudiar y preparar preguntas. Ante un caso real, veterinario, ingeniero agrónomo o SENASA. No da diagnósticos, productos ni dosis.</div>' : "") +
      (f.marca_uso ? '<div class="caja"><strong>Marca de uso:</strong> ' + esc(f.marca_uso) + "</div>" : "") +
      '<div class="botonera">' +
        (urlSegura(f.enlace) ? '<a class="boton" href="' + esc(f.enlace) + '" target="_blank" rel="noopener noreferrer">Abrir enlace principal</a>' : "") +
        '<a class="boton secundario" href="#/fuente-editar/' + encodeURIComponent(f.id) + '">Editar</a>' +
        '<a class="boton secundario" href="#/afirmacion-nueva?fuente=' + encodeURIComponent(f.id) + '">Agregar afirmación</a>' +
      "</div>" +
      '<div class="ficha"><dl>' +
        filaDato("Autoría o institución", f.autoria) +
        filaDato("Tipo y fecha", [f.tipo, f.fecha_publicacion].filter(Boolean).join(" · ")) +
        filaDato("Enlace", f.enlace) +
        (extra ? "<dt>Otros enlaces</dt><dd><ul>" + extra + "</ul></dd>" : "") +
        filaDato("Fecha de consulta", f.fecha_consulta) +
        filaDato("Región, periodo y sistema", f.region) +
        filaDato("Aplicabilidad local", (APLICABILIDAD[f.aplicabilidad] || f.aplicabilidad) + (f.aplicabilidad_texto ? " · " + f.aplicabilidad_texto : "")) +
        filaDato("Jurisdicción", f.jurisdiccion) +
        filaDato("Qué se revisó", f.que_se_reviso) +
        filaDato("Qué respalda", f.respalda) +
        filaDato("Qué aporta o utilidad", f.aporta) +
        filaDato("Límites", f.limites) +
        filaDato("No permite concluir", f.no_permite_concluir) +
        filaDato("Licencia", f.licencia) +
        filaDato("Copia sin conexión", COPIA_OFFLINE[f.copia_offline] || f.copia_offline) +
        filaDato("Revisar", f.revisar) +
        filaDato("Relación (texto de la ficha)", f.relacion_texto) +
      "</dl></div>" +
      (rels ? "<h3>Relaciones</h3><ul>" + rels + "</ul>" : "") +
      "<h3>Afirmaciones que cita (" + afs.length + ")</h3>" + (afs.length ? listaAfirmaciones(afs) : '<p class="vacio">Ninguna todavía.</p>') +
      (obs.length ? "<h3>Observaciones propias relacionadas</h3>" + listaObservaciones(obs) : "") +
      (original ? '<details><summary>Ficha original importada (no se modifica)</summary><div><table class="tabla-original">' + original + "</table></div></details>" : "") +
      '<details><summary>Procedencia e historial</summary><div>' +
        "<p><strong>Origen:</strong> " + (p.url ? enlaceExterno(p.url, p.origen) : esc(p.origen || "Cargada en la app")) + "</p>" +
        (p.revision ? "<p><strong>Revisión:</strong> " + esc(p.revision) + "</p>" : "") +
        (p.seccion ? "<p><strong>Sección:</strong> " + esc(p.seccion) + "</p>" : "") +
        (p.importado ? "<p><strong>Importada:</strong> " + esc(p.importado) + " · " + esc(p.importado_por || "") + "</p>" : "") +
        '<ul class="historial">' + hist + "</ul>" +
      "</div></details>"
    );
  }

  function campoTexto(id, etiqueta, valor, opc) {
    opc = opc || {};
    var oblig = opc.obligatorio ? ' class="obligatorio"' : "";
    var ayuda = opc.ayuda ? '<p class="ayuda">' + esc(opc.ayuda) + "</p>" : "";
    var ctrl = opc.area
      ? '<textarea id="' + id + '" name="' + id + '"' + (opc.obligatorio ? " required" : "") + ">" + esc(valor) + "</textarea>"
      : '<input id="' + id + '" name="' + id + '" type="' + (opc.tipo || "text") + '" value="' + esc(valor) + '"' + (opc.obligatorio ? " required" : "") + (opc.placeholder ? ' placeholder="' + esc(opc.placeholder) + '"' : "") + ">";
    return '<div class="campo"><label for="' + id + '"' + oblig + ">" + esc(etiqueta) + "</label>" + ayuda + ctrl + "</div>";
  }
  function campoSelect(id, etiqueta, valor, opciones, opc) {
    opc = opc || {};
    var ops = Object.keys(opciones).map(function (k) { return '<option value="' + esc(k) + '"' + (k === valor ? " selected" : "") + ">" + esc(opciones[k]) + "</option>"; }).join("");
    return '<div class="campo"><label for="' + id + '"' + (opc.obligatorio ? ' class="obligatorio"' : "") + ">" + esc(etiqueta) + "</label>" + (opc.ayuda ? '<p class="ayuda">' + esc(opc.ayuda) + "</p>" : "") + '<select id="' + id + '" name="' + id + '">' + ops + "</select></div>";
  }

  var CAMPOS_FUENTE = [
    ["titulo", "Título exacto", { obligatorio: true }],
    ["autoria", "Autoría o institución", { obligatorio: true }],
    ["tipo", "Tipo de fuente", { ayuda: "Ej.: normativa, ensayo, tesis, guía de extensión, datos oficiales, divulgación" }],
    ["fecha_publicacion", "Fecha de publicación o sanción", { placeholder: "AAAA-MM-DD o año" }],
    ["enlace", "Enlace directo", { tipo: "url", ayuda: "Si no hay enlace, dejalo vacío y explicalo en 'Qué se revisó'." }],
    ["fecha_consulta", "Fecha de consulta", { tipo: "date", obligatorio: true }],
    ["areas", "Áreas (códigos separados por coma)", { ayuda: "REC, CUL, FIT, FOR, ANI, SAN, GES, NOR, TEC, MAQ, INS, SEG, INO, ECO, COM" }],
    ["region", "Región, periodo y sistema de los datos", { area: true, obligatorio: true, ayuda: "Dónde y cuándo se obtuvieron los datos, y para qué sistema." }],
    ["jurisdiccion", "Jurisdicción (si es una norma)", { ayuda: "nacional, provincial-ba o municipal-‹partido›" }],
    ["que_se_reviso", "Qué se revisó exactamente", { area: true, obligatorio: true, ayuda: "Documento completo, páginas, anexos, ficha o resumen. No pongas 'leído' si no lo abriste." }],
    ["respalda", "Qué respalda (con página, tabla o artículo)", { area: true }],
    ["limites", "Límites y diseño de la evidencia", { area: true, obligatorio: true }],
    ["no_permite_concluir", "Qué no permite concluir", { area: true }],
    ["licencia", "Licencia o condiciones de uso", { obligatorio: true, ayuda: "Si no la verificaste, escribí 'No verificada'." }],
    ["marca_uso", "Marca de uso", { ayuda: "Para estudio · referencia técnica · obligación normativa · no usar para decidir un caso real sin verificación profesional" }],
    ["revisar", "Cuándo volver a revisar", {}]
  ];

  function vistaFormFuente(id) {
    var f = id ? porId(datos.fuentes, id) : null;
    if (id && !f) { vista("<h2>No encontrada</h2>"); return; }
    var v = f || { estado: "pendiente", aplicabilidad: "sin-clasificar", copia_offline: "no-verificada", fecha_consulta: hoyISO(), areas: [] };
    var estados = {};
    Object.keys(ESTADOS_FUENTE).forEach(function (k) { if (k !== "sin-clasificar" || v.estado === k) estados[k] = ESTADOS_FUENTE[k].txt; });
    var campos = CAMPOS_FUENTE.map(function (c) {
      var val = c[0] === "areas" ? (v.areas || []).join(", ") : v[c[0]];
      return campoTexto("f_" + c[0], c[1], val || "", c[2]);
    }).join("");
    vista(
      "<h2>" + (f ? "Editar " + esc(f.id) : "Nueva fuente") + "</h2>" +
      (f && f.origen_registro === "base-importada" ? '<div class="caja">Es un registro importado de la base. La ficha original queda guardada sin cambios; tu edición se suma al historial.</div>' : "") +
      '<div class="caja">Una respuesta de IA no es una fuente. Cargá solo documentos que existen y que podés citar.</div>' +
      '<form id="form-fuente" novalidate>' +
        campoSelect("f_estado", "Estado de verificación", v.estado, estados, { obligatorio: true, ayuda: "Verificada: abriste el documento. Solo metadatos: viste el catálogo o una nota. Pendiente: no lo pudiste abrir." }) +
        campos +
        campoSelect("f_aplicabilidad", "Aplicabilidad a la Cuenca del Salado", v.aplicabilidad || "sin-clasificar", APLICABILIDAD) +
        campoSelect("f_copia_offline", "Copia sin conexión", v.copia_offline || "no-verificada", COPIA_OFFLINE, { ayuda: "Esta app no guarda copias de documentos: solo la ficha y el enlace." }) +
        (f ? campoTexto("f_motivo", "Motivo del cambio", "", { obligatorio: true, ayuda: "Queda en el historial junto con los campos que cambiaste." }) : "") +
        campoTexto("f_por", "Tus iniciales", meta.iniciales || "", {}) +
        '<p id="f_error" class="error" role="alert"></p>' +
        '<div class="botonera"><button class="boton" type="submit">Guardar</button><a class="boton secundario" href="' + (f ? "#/fuente/" + encodeURIComponent(f.id) : "#/fuentes") + '">Cancelar</a></div>' +
      "</form>"
    );
    $("#form-fuente").addEventListener("submit", function (e) {
      e.preventDefault();
      var nuevo = f ? JSON.parse(JSON.stringify(limpio(f))) : {};
      CAMPOS_FUENTE.forEach(function (c) {
        var val = $("#f_" + c[0]).value.trim();
        if (c[0] === "areas") nuevo.areas = val ? val.split(",").map(function (x) { return x.trim().toUpperCase(); }).filter(Boolean) : [];
        else nuevo[c[0]] = val;
      });
      nuevo.estado = $("#f_estado").value;
      nuevo.aplicabilidad = $("#f_aplicabilidad").value;
      nuevo.copia_offline = $("#f_copia_offline").value;
      var por = $("#f_por").value.trim();
      var faltan = CAMPOS_FUENTE.filter(function (c) { return c[2].obligatorio && !nuevo[c[0]]; }).map(function (c) { return c[1]; });
      if (nuevo.enlace && !urlSegura(nuevo.enlace)) faltan.push("Enlace (debe empezar con http:// o https://)");
      var motivo = f ? $("#f_motivo").value.trim() : "";
      if (f && !motivo) faltan.push("Motivo del cambio");
      if (faltan.length) { $("#f_error").textContent = "Falta completar: " + faltan.join(", ") + "."; return; }
      if (por) guardarMeta("iniciales", por);
      var fecha = hoyISO();
      if (f) {
        var cambiados = ["estado", "aplicabilidad", "copia_offline"].concat(CAMPOS_FUENTE.map(function (c) { return c[0]; })).filter(function (k) {
          return JSON.stringify(f[k] == null ? "" : f[k]) !== JSON.stringify(nuevo[k] == null ? "" : nuevo[k]);
        });
        if (!cambiados.length) { $("#f_error").textContent = "No cambiaste ningún campo."; return; }
        nuevo.version = (f.version || 1) + 1;
        nuevo.modificado = ahoraISO();
        nuevo.historial = (f.historial || []).concat([{ fecha: fecha, accion: "Editada (v" + nuevo.version + ")", detalle: "Campos: " + cambiados.join(", ") + ". Motivo: " + motivo, por: por || "sin iniciales" }]);
      } else {
        nuevo.id = siguienteId("F", datos.fuentes);
        nuevo.alias = "";
        nuevo.conjunto = "mis-fuentes";
        nuevo.enlaces_extra = [];
        nuevo.relaciones = [];
        nuevo.ficha_original = [];
        nuevo.version = 1;
        nuevo.creado = ahoraISO();
        nuevo.origen_registro = "usuario";
        nuevo.procedencia = { origen: "Cargada en la app por el usuario", importado: "", seccion: "" };
        nuevo.historial = [{ fecha: fecha, accion: "Creada", detalle: "Estado inicial: " + ESTADOS_FUENTE[nuevo.estado].txt, por: por || "sin iniciales" }];
      }
      guardar("fuentes", nuevo).then(cargarTodo).then(function () { location.hash = "#/fuente/" + encodeURIComponent(nuevo.id); })
        .catch(function (err) { $("#f_error").textContent = "No se pudo guardar: " + err.message; });
    });
  }

  // ---------------------------------------------------------------- Afirmaciones
  function listaAfirmaciones(lista) {
    return '<ul class="lista">' + lista.map(function (a) {
      return '<li><a class="item" href="#/afirmacion/' + encodeURIComponent(a.id) + '">' +
        '<div class="item-id">' + esc(a.id) + " · " + esc(a.tipo) + "</div>" +
        '<div class="item-titulo">' + esc(a.texto) + "</div>" +
        '<div class="item-extra">' + esc(a.cita_exacta) + "</div></a></li>";
    }).join("") + "</ul>";
  }
  function vistaAfirmacion(id) {
    var a = porId(datos.afirmaciones, id);
    if (!a) { vista("<h2>No encontrada</h2>"); return; }
    var fuentes = (a.fuente_ids || []).map(function (fid) {
      var f = porId(datos.fuentes, fid);
      return "<li>" + (f ? '<a href="#/fuente/' + encodeURIComponent(fid) + '">' + esc(fid) + "</a> — " + esc(f.titulo) + " " + badgeFuente(f.estado) : esc(fid) + " (no está en la biblioteca)") + "</li>";
    }).join("");
    var hist = (a.historial || []).slice().reverse().map(function (h) { return "<li><strong>" + esc(h.fecha) + "</strong> · " + esc(h.accion) + " · " + esc(h.por) + "<br>" + esc(h.detalle) + "</li>"; }).join("");
    vista(
      '<p class="item-id">' + esc(a.id) + " · " + esc(a.tipo) + "</p>" +
      "<h2>" + esc(a.texto) + "</h2>" +
      '<div class="ficha"><dl>' +
        filaDato("Cita exacta", a.cita_exacta) +
        filaDato("Respaldo", a.respaldo) +
        filaDato("Uso", a.uso) +
        filaDato("Región", a.region) +
        filaDato("Fecha", a.fecha) +
      "</dl></div>" +
      "<h3>Fuentes</h3>" + (fuentes ? "<ul>" + fuentes + "</ul>" : '<p class="vacio">Sin fuente: tratar como inferencia pendiente.</p>') +
      (a.vinculo_nota ? '<p class="resumen">' + esc(a.vinculo_nota) + "</p>" : "") +
      '<details><summary>Procedencia e historial</summary><div><p>' + esc((a.procedencia || {}).seccion || "Cargada en la app") + '</p><ul class="historial">' + hist + "</ul></div></details>"
    );
  }
  function vistaFormAfirmacion(fuenteId) {
    var f = porId(datos.fuentes, fuenteId);
    if (!f) { vista('<h2>Elegí una fuente primero</h2><p>Las afirmaciones se cargan desde la ficha de su fuente, para no perder el respaldo.</p><a class="boton" href="#/fuentes">Ir a Fuentes</a>'); return; }
    var tipos = {};
    TIPOS_AFIRMACION.forEach(function (t) { tipos[t] = t; });
    vista(
      "<h2>Nueva afirmación</h2>" +
      '<p class="resumen">Fuente: ' + esc(f.id) + " — " + esc(f.titulo) + " " + badgeFuente(f.estado) + "</p>" +
      (f.estado !== "verificada" ? '<div class="caja limite">Esta fuente no está verificada en su contenido. La afirmación queda con ese límite.</div>' : "") +
      '<form id="form-af" novalidate>' +
        campoTexto("a_texto", "Afirmación", "", { area: true, obligatorio: true, ayuda: "Una sola idea, con tus palabras, sin copiar párrafos." }) +
        campoTexto("a_cita", "Cita exacta (página, tabla o artículo)", "", { obligatorio: true }) +
        campoSelect("a_tipo", "Tipo de afirmación", "Dato de fuente", tipos, { obligatorio: true }) +
        campoTexto("a_region", "Región o condiciones a las que aplica", "", { obligatorio: true }) +
        campoTexto("a_uso", "Uso", "", { ayuda: "Ej.: para estudio; obligación normativa; consultar al veterinario" }) +
        campoTexto("a_por", "Tus iniciales", meta.iniciales || "", {}) +
        '<p id="a_error" class="error" role="alert"></p>' +
        '<div class="botonera"><button class="boton" type="submit">Guardar</button><a class="boton secundario" href="#/fuente/' + encodeURIComponent(f.id) + '">Cancelar</a></div>' +
      "</form>"
    );
    $("#form-af").addEventListener("submit", function (e) {
      e.preventDefault();
      var a = {
        id: siguienteId("A", datos.afirmaciones),
        texto: $("#a_texto").value.trim(), cita_exacta: $("#a_cita").value.trim(), tipo: $("#a_tipo").value,
        region: $("#a_region").value.trim(), uso: $("#a_uso").value.trim(),
        respaldo: "Fuente " + f.id + ": " + ESTADOS_FUENTE[f.estado].txt,
        fuente_ids: [f.id], fecha: hoyISO(), version: 1, origen_registro: "usuario", creado: ahoraISO(),
        procedencia: { origen: "Cargada en la app por el usuario", seccion: "" }
      };
      var por = $("#a_por").value.trim();
      var faltan = [];
      if (!a.texto) faltan.push("Afirmación");
      if (!a.cita_exacta) faltan.push("Cita exacta");
      if (!a.region) faltan.push("Región o condiciones");
      if (faltan.length) { $("#a_error").textContent = "Falta completar: " + faltan.join(", ") + "."; return; }
      a.historial = [{ fecha: a.fecha, accion: "Creada", detalle: "Desde la ficha " + f.id, por: por || "sin iniciales" }];
      guardar("afirmaciones", a).then(cargarTodo).then(function () { location.hash = "#/afirmacion/" + encodeURIComponent(a.id); })
        .catch(function (err) { $("#a_error").textContent = "No se pudo guardar: " + err.message; });
    });
  }

  // ---------------------------------------------------------------- Observaciones (Formato 2)
  var CAMPOS_OBS = [
    ["fecha", "Fecha", { tipo: "date", obligatorio: true }],
    ["lugar", "Lugar", { obligatorio: true, ayuda: "Zona o partido + código de lote o instalación. Sin nombre del establecimiento, dueños, RENSPA ni CUIT." }],
    ["observe", "Qué observé", { area: true, obligatorio: true, ayuda: "Solo hechos que se ven o se miden." }],
    ["contexto", "Contexto", { obligatorio: true, ayuda: "Cultivo, especie o categoría animal y etapa; NA si no aplica." }],
    ["condiciones", "Condiciones", { area: true, obligatorio: true, ayuda: "Lluvias recientes, estado del suelo, temperatura, manejo previo; ND o PEND + fecha." }],
    ["decision", "Decisión tomada", { obligatorio: true, ayuda: "Qué se hizo y quién decidió, o 'ninguna'." }],
    ["resultado", "Resultado conocido", { obligatorio: true, ayuda: "Qué pasó después, o PEND + fecha para revisar." }],
    ["interpretacion", "Mi interpretación", { area: true, obligatorio: true, ayuda: "Empezá con 'Creo que…'; ND si no tenés. No es un diagnóstico." }]
  ];
  var CAMPOS_OBS_OPC = [
    ["falto", "Qué dato faltó", { area: true }],
    ["confirmaria", "Qué la confirmaría o refutaría", { area: true }],
    ["no_aplicaria", "Cuándo no aplicaría", { area: true }],
    ["fuentes_relacionadas", "Fuentes relacionadas (IDs)", { ayuda: "Ej.: F-19, F-20261030-07" }]
  ];

  function listaObservaciones(lista) {
    return '<ul class="lista">' + lista.map(function (o) {
      return '<li><a class="item" href="#/observacion/' + encodeURIComponent(o.id) + '">' +
        '<div class="item-id">' + esc(o.id) + " · " + esc(o.fecha) + " · " + esc(o.lugar) + "</div>" +
        '<div class="item-titulo">' + esc(String(o.observe || "").slice(0, 140)) + "</div>" +
        '<div class="item-extra">' + badgeObs(o.estado) + " " + ((o.foto_ids || []).length ? (o.foto_ids.length + " foto" + (o.foto_ids.length > 1 ? "s" : "")) : "sin fotos") + "</div></a></li>";
    }).join("") + "</ul>";
  }
  function vistaCampo() {
    var lista = datos.observaciones.slice().sort(function (a, b) { return b.id.localeCompare(a.id, "es", { numeric: true }); });
    vista(
      "<h2>Campo</h2>" +
      '<div class="botonera"><a class="boton ancho" href="#/observacion-nueva">Nueva observación</a></div>' +
      '<p class="resumen">Tus observaciones son experiencia propia: nacen como "Pendiente" y no son evidencia publicada. Funciona sin conexión.</p>' +
      (lista.length ? listaObservaciones(lista) : '<p class="vacio">Todavía no hay observaciones.</p>')
    );
  }

  function leerFotos(obsId) {
    return new Promise(function (resolve, reject) {
      var req = db.transaction("fotos", "readonly").objectStore("fotos").index("obs_id").getAll(obsId);
      req.onsuccess = function () { resolve(req.result || []); };
      req.onerror = function () { reject(req.error); };
    });
  }
  function figuraFoto(foto) {
    var u = URL.createObjectURL(foto.blob);
    urlsFotos.push(u);
    return '<figure><a href="' + u + '" target="_blank" rel="noopener"><img src="' + u + '" alt="Foto ' + esc(foto.id) + '"></a><figcaption>' + esc(foto.id) + " · " + Math.round((foto.bytes || 0) / 1024) + " KB</figcaption></figure>";
  }

  function vistaObservacion(id) {
    var o = porId(datos.observaciones, id);
    if (!o) { vista("<h2>No encontrada</h2>"); return; }
    var hist = (o.historial || []).slice().reverse().map(function (h) { return "<li><strong>" + esc(h.fecha) + "</strong> · " + esc(h.accion) + " · " + esc(h.por) + "<br>" + esc(h.detalle) + "</li>"; }).join("");
    var opcionesEstado = {};
    Object.keys(ESTADOS_OBS).forEach(function (k) { opcionesEstado[k] = ESTADOS_OBS[k].txt; });
    vista(
      '<p class="item-id">' + esc(o.id) + " · v" + esc(o.version || 1) + "</p>" +
      "<h2>Observación del " + esc(o.fecha) + "</h2>" +
      "<p>" + badgeObs(o.estado) + "</p>" +
      '<p class="resumen">' + esc((ESTADOS_OBS[o.estado] || ESTADOS_OBS.pendiente).ayuda) + "</p>" +
      '<div class="botonera"><a class="boton secundario" href="#/observacion-editar/' + encodeURIComponent(o.id) + '">Corregir o agregar fotos</a></div>' +
      '<div id="fotos-obs" class="fotos"></div>' +
      '<div class="ficha"><dl>' +
        CAMPOS_OBS.concat(CAMPOS_OBS_OPC).map(function (c) { return filaDato(c[1], o[c[0]]); }).join("") +
        filaDato("Responsable", o.responsable) +
      "</dl></div>" +
      "<h3>Cambiar estado</h3>" +
      '<form id="form-estado" novalidate>' +
        campoSelect("o_estado", "Estado nuevo", o.estado, opcionesEstado, { ayuda: "El cambio lo hacés vos y queda en el historial." }) +
        campoTexto("o_motivo", "Motivo", "", { obligatorio: true, ayuda: "Para 'Respaldada', indicá el ID de la ficha o el rol del profesional y la fecha." }) +
        campoTexto("o_por_estado", "Tus iniciales", meta.iniciales || "", {}) +
        '<p id="o_estado_error" class="error" role="alert"></p>' +
        '<button class="boton secundario" type="submit">Guardar estado</button>' +
      "</form>" +
      '<details><summary>Historial</summary><div><ul class="historial">' + hist + "</ul></div></details>" +
      '<p class="resumen">Las observaciones no se borran: una descartada sirve para no repetir el error.</p>'
    );
    leerFotos(o.id).then(function (fotos) {
      var c = $("#fotos-obs");
      if (c) c.innerHTML = fotos.length ? fotos.map(figuraFoto).join("") : "";
    });
    $("#form-estado").addEventListener("submit", function (e) {
      e.preventDefault();
      var estado = $("#o_estado").value, motivo = $("#o_motivo").value.trim(), por = $("#o_por_estado").value.trim();
      if (estado === o.estado) { $("#o_estado_error").textContent = "Elegí un estado distinto del actual."; return; }
      if (!motivo) { $("#o_estado_error").textContent = "Escribí el motivo del cambio."; return; }
      var nuevo = JSON.parse(JSON.stringify(limpio(o)));
      nuevo.estado = estado;
      nuevo.version = (o.version || 1) + 1;
      nuevo.modificado = ahoraISO();
      nuevo.historial = (o.historial || []).concat([{ fecha: hoyISO(), accion: "Estado: " + ESTADOS_OBS[estado].txt, detalle: "Motivo: " + motivo, por: por || "sin iniciales" }]);
      if (por) guardarMeta("iniciales", por);
      guardar("observaciones", nuevo).then(cargarTodo).then(function () { vistaObservacion(o.id); });
    });
  }

  // Reduce la foto (lado mayor 1600 px, JPEG). Al recodificar se pierden los metadatos, incluida la ubicación GPS.
  function comprimirFoto(file) {
    var MAX = 1600;
    function dibujar(fuente, w, h) {
      var esc2 = Math.min(1, MAX / Math.max(w, h));
      var cw = Math.round(w * esc2), ch = Math.round(h * esc2);
      var canvas = document.createElement("canvas");
      canvas.width = cw; canvas.height = ch;
      canvas.getContext("2d").drawImage(fuente, 0, 0, cw, ch);
      return new Promise(function (resolve, reject) {
        canvas.toBlob(function (b) { b ? resolve({ blob: b, ancho: cw, alto: ch }) : reject(new Error("No se pudo procesar la foto")); }, "image/jpeg", 0.82);
      });
    }
    if (window.createImageBitmap) {
      return createImageBitmap(file).then(function (bmp) { return dibujar(bmp, bmp.width, bmp.height); }).catch(function () { return porImagen(); });
    }
    return porImagen();
    function porImagen() {
      return new Promise(function (resolve, reject) {
        var u = URL.createObjectURL(file);
        var img = new Image();
        img.onload = function () { URL.revokeObjectURL(u); dibujar(img, img.naturalWidth, img.naturalHeight).then(resolve, reject); };
        img.onerror = function () { URL.revokeObjectURL(u); reject(new Error("Formato de imagen no soportado")); };
        img.src = u;
      });
    }
  }
  function letraFoto(n) { // a, b, … z, aa, ab…
    var s = "";
    n += 1;
    while (n > 0) { var r = (n - 1) % 26; s = String.fromCharCode(97 + r) + s; n = Math.floor((n - 1) / 26); }
    return s;
  }

  function vistaFormObservacion(id) {
    var o = id ? porId(datos.observaciones, id) : null;
    if (id && !o) { vista("<h2>No encontrada</h2>"); return; }
    var v = o || { fecha: hoyISO() };
    vista(
      "<h2>" + (o ? "Corregir " + esc(o.id) : "Nueva observación") + "</h2>" +
      '<p class="resumen">Separá el hecho de tu interpretación. No anotes medicamentos, dosis ni productos recomendados; si se usó un producto, anotalo como hecho (qué y quién lo indicó).</p>' +
      '<form id="form-obs" novalidate>' +
        CAMPOS_OBS.map(function (c) { return campoTexto("o_" + c[0], c[1], v[c[0]] || "", c[2]); }).join("") +
        '<div class="campo"><label for="o_fotos">Fotos</label><p class="ayuda">Podés sacar una foto o elegirla de la galería. Se guarda una copia reducida en la app; la ubicación GPS de la foto se elimina. Evitá personas, patentes y caravanas legibles.</p>' +
        '<input id="o_fotos" type="file" accept="image/*" multiple></div>' +
        '<div id="o_fotos_previa" class="fotos"></div>' +
        '<details><summary>Más campos (opcionales)</summary><div>' +
          CAMPOS_OBS_OPC.map(function (c) { return campoTexto("o_" + c[0], c[1], v[c[0]] || "", c[2]); }).join("") +
        "</div></details>" +
        campoTexto("o_responsable", "Responsable (iniciales)", v.responsable || meta.iniciales || "", { obligatorio: true }) +
        (o ? campoTexto("o_motivo_corr", "Qué corregiste y por qué", "", { obligatorio: true, ayuda: "Queda en 'Correcciones' y sube la versión." }) : "") +
        '<p id="o_error" class="error" role="alert"></p>' +
        '<div class="botonera"><button class="boton" type="submit" id="o_guardar">Guardar</button><a class="boton secundario" href="' + (o ? "#/observacion/" + encodeURIComponent(o.id) : "#/campo") + '">Cancelar</a></div>' +
      "</form>"
    );
    var archivos = [];
    $("#o_fotos").addEventListener("change", function (e) {
      archivos = Array.prototype.slice.call(e.target.files || []);
      $("#o_fotos_previa").innerHTML = archivos.map(function (f) {
        var u = URL.createObjectURL(f); urlsFotos.push(u);
        return '<figure><img src="' + u + '" alt="Foto elegida"><figcaption>' + esc(f.name || "foto") + "</figcaption></figure>";
      }).join("");
    });
    $("#form-obs").addEventListener("submit", function (e) {
      e.preventDefault();
      var nuevo = o ? JSON.parse(JSON.stringify(limpio(o))) : {};
      CAMPOS_OBS.concat(CAMPOS_OBS_OPC).forEach(function (c) { nuevo[c[0]] = $("#o_" + c[0]).value.trim(); });
      nuevo.responsable = $("#o_responsable").value.trim();
      var faltan = CAMPOS_OBS.filter(function (c) { return !nuevo[c[0]]; }).map(function (c) { return c[1]; });
      if (!nuevo.responsable) faltan.push("Responsable");
      var motivo = o ? $("#o_motivo_corr").value.trim() : "";
      if (o && !motivo) faltan.push("Qué corregiste y por qué");
      if (faltan.length) { $("#o_error").textContent = "Falta completar: " + faltan.join(", ") + ". Si no sabés, escribí ND (no disponible) o PEND + fecha."; return; }
      $("#o_guardar").disabled = true;
      $("#o_error").textContent = "";
      guardarMeta("iniciales", nuevo.responsable);
      var fecha = hoyISO();
      if (o) {
        nuevo.version = (o.version || 1) + 1;
        nuevo.modificado = ahoraISO();
        nuevo.correcciones = (o.correcciones || []).concat([{ fecha: fecha, detalle: motivo, por: nuevo.responsable }]);
        nuevo.historial = (o.historial || []).concat([{ fecha: fecha, accion: "Corregida (v" + nuevo.version + ")", detalle: motivo, por: nuevo.responsable }]);
      } else {
        nuevo.id = siguienteId("O", datos.observaciones);
        nuevo.estado = "pendiente";
        nuevo.version = 1;
        nuevo.creado = ahoraISO();
        nuevo.foto_ids = [];
        nuevo.correcciones = [];
        nuevo.guardado_en = "app (este dispositivo)";
        nuevo.sincronizado = "NO";
        nuevo.historial = [{ fecha: fecha, accion: "Creada", detalle: "Estado inicial: Pendiente", por: nuevo.responsable }];
      }
      var inicio = (nuevo.foto_ids || []).length;
      var procesadas = [];
      var cadena = Promise.resolve();
      archivos.forEach(function (file, i) {
        cadena = cadena.then(function () { return comprimirFoto(file); }).then(function (r) {
          procesadas.push({ id: nuevo.id + "-" + letraFoto(inicio + i), obs_id: nuevo.id, blob: r.blob, tipo: "image/jpeg", ancho: r.ancho, alto: r.alto, bytes: r.blob.size, creada: ahoraISO() });
        });
      });
      cadena.then(function () {
        nuevo.foto_ids = (nuevo.foto_ids || []).concat(procesadas.map(function (p) { return p.id; }));
        if (procesadas.length && o) nuevo.historial[nuevo.historial.length - 1].detalle += " · Fotos agregadas: " + procesadas.length;
        return guardar("fotos", procesadas);
      }).then(function () { return guardar("observaciones", nuevo); })
        .then(cargarTodo)
        .then(function () { location.hash = "#/observacion/" + encodeURIComponent(nuevo.id); })
        .catch(function (err) { $("#o_guardar").disabled = false; $("#o_error").textContent = "No se pudo guardar: " + err.message; });
    });
  }

  // ---------------------------------------------------------------- Respaldo
  function blobABase64(blob) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(String(r.result)); };
      r.onerror = function () { reject(r.error); };
      r.readAsDataURL(blob);
    });
  }
  function base64ABlob(dataUrl) {
    var partes = String(dataUrl).split(",");
    var tipo = (partes[0].match(/data:([^;]+)/) || [])[1] || "image/jpeg";
    var bin = atob(partes[1] || "");
    var arr = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: tipo });
  }
  function armarRespaldo() {
    return todos("fotos").then(function (fotos) {
      return Promise.all(fotos.map(function (f) {
        return blobABase64(f.blob).then(function (b64) {
          var c = limpio(f); delete c.blob; c.datos = b64; return c;
        });
      }));
    }).then(function (fotos) {
      return {
        formato: FORMATO_RESPALDO,
        version_esquema: 1,
        app_version: APP_VERSION,
        exportado: ahoraISO(),
        nota: "Respaldo completo. Los IDs, el historial y la procedencia de cada registro se conservan tal cual.",
        fuentes: datos.fuentes.map(limpio),
        afirmaciones: datos.afirmaciones.map(limpio),
        observaciones: datos.observaciones.map(limpio),
        fotos: fotos
      };
    });
  }
  function nombreArchivo() {
    var d = new Date();
    return "biblioteca-agro-respaldo-" + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + "-" + pad(d.getHours()) + pad(d.getMinutes()) + ".json";
  }
  // El archivo se arma antes del toque: Safari solo permite "Compartir" dentro del mismo toque.
  var respaldoPreparado = null;
  function prepararRespaldo() {
    respaldoPreparado = null;
    document.querySelectorAll("#r_compartir, #r_descargar").forEach(function (b) { b.disabled = true; });
    return armarRespaldo().then(function (r) {
      var texto = JSON.stringify(r);
      var nombre = nombreArchivo();
      respaldoPreparado = { r: r, texto: texto, nombre: nombre, archivo: new File([texto], nombre, { type: "application/json" }) };
      document.querySelectorAll("#r_compartir, #r_descargar").forEach(function (b) { b.disabled = false; });
    }).catch(function (err) {
      var estado = $("#r_estado");
      if (estado) { estado.className = "error"; estado.textContent = "No se pudo preparar el respaldo: " + err.message; }
    });
  }
  function registrarRespaldo(p) {
    var estado = $("#r_estado");
    return guardarMeta("ultimo_respaldo", { fecha: ahoraISO(), archivo: p.nombre, fuentes: p.r.fuentes.length, afirmaciones: p.r.afirmaciones.length, observaciones: p.r.observaciones.length, fotos: p.r.fotos.length })
      .then(function () {
        if (estado) { estado.className = "ok"; estado.textContent = "Respaldo listo: " + p.nombre + " (" + Math.round(p.texto.length / 1024) + " KB). Guardalo fuera del teléfono (por ejemplo, en la PC o en la nube)."; }
        pintarEstadoRespaldo();
      });
  }
  function descargar(p) {
    var u = URL.createObjectURL(p.archivo);
    var a = document.createElement("a");
    a.href = u; a.download = p.nombre; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(u); a.remove(); }, 4000);
    return registrarRespaldo(p);
  }
  function exportar(modo) {
    var p = respaldoPreparado;
    var estado = $("#r_estado");
    if (!p) { estado.className = ""; estado.textContent = "Todavía se está preparando el respaldo. Probá en unos segundos."; return; }
    if (modo === "compartir" && navigator.canShare && navigator.canShare({ files: [p.archivo] })) {
      navigator.share({ files: [p.archivo], title: "Respaldo de la biblioteca agropecuaria" })
        .then(function () { return registrarRespaldo(p); })
        .catch(function (err) {
          if (err && err.name === "AbortError") { estado.className = ""; estado.textContent = "Cancelaste el envío. No se registró el respaldo."; return; }
          return descargar(p);
        });
      return;
    }
    descargar(p).catch(function (err) { estado.className = "error"; estado.textContent = "No se pudo exportar: " + err.message; });
  }

  // Importa sin pisar nada: agrega lo que falta y avisa de los IDs que ya existen con otro contenido.
  function importar(file) {
    var estado = $("#r_estado");
    estado.className = ""; estado.textContent = "Leyendo " + file.name + "…";
    return file.text().then(function (t) {
      var r;
      try { r = JSON.parse(t); } catch (e) { throw new Error("El archivo no es un JSON válido."); }
      if (!r || (r.formato !== FORMATO_RESPALDO && r.formato !== "biblioteca-agro-semilla")) throw new Error("No es un respaldo de esta biblioteca.");
      var informe = { nuevos: 0, iguales: 0, conflictos: [] };
      function comparar(store, lista, actuales) {
        var aGuardar = [];
        (lista || []).forEach(function (reg) {
          if (!reg || !reg.id) return;
          var ya = porId(actuales, reg.id);
          if (!ya) { aGuardar.push(reg); informe.nuevos++; }
          else if (JSON.stringify(limpio(ya)) === JSON.stringify(reg)) informe.iguales++;
          else informe.conflictos.push(store + " " + reg.id);
        });
        return guardar(store, aGuardar);
      }
      return comparar("fuentes", r.fuentes, datos.fuentes)
        .then(function () { return comparar("afirmaciones", r.afirmaciones, datos.afirmaciones); })
        .then(function () { return comparar("observaciones", r.observaciones, datos.observaciones); })
        .then(function () { return todos("fotos"); })
        .then(function (fotosActuales) {
          var nuevas = (r.fotos || []).filter(function (f) { return f && f.id && !porId(fotosActuales, f.id); }).map(function (f) {
            var c = JSON.parse(JSON.stringify(f)); c.blob = base64ABlob(f.datos); delete c.datos; return c;
          });
          informe.fotos = nuevas.length;
          return guardar("fotos", nuevas);
        })
        .then(cargarTodo)
        .then(function () {
          pintarEstadoRespaldo();
          prepararRespaldo();
          estado.className = informe.conflictos.length ? "error" : "ok";
          estado.textContent = "Importación terminada: " + informe.nuevos + " registros nuevos, " + informe.fotos + " fotos nuevas, " + informe.iguales + " ya estaban iguales." +
            (informe.conflictos.length ? " " + informe.conflictos.length + " con el mismo ID y contenido distinto no se tocaron: " + informe.conflictos.slice(0, 12).join(", ") + (informe.conflictos.length > 12 ? "…" : "") + ". Revisalos a mano." : "");
        });
    }).catch(function (err) { estado.className = "error"; estado.textContent = "No se pudo importar: " + err.message; });
  }

  function pintarEstadoRespaldo() {
    var c = $("#r_info");
    if (!c) return;
    var ult = meta.ultimo_respaldo;
    var sem = meta.semilla_importada;
    var nFotos = datos.observaciones.reduce(function (s, o) { return s + (o.foto_ids || []).length; }, 0);
    var html = "<ul>" +
      "<li>" + datos.fuentes.length + " fuentes, " + datos.afirmaciones.length + " afirmaciones, " + datos.observaciones.length + " observaciones, " + nFotos + " fotos.</li>" +
      "<li>Último respaldo: " + (ult ? esc(ult.fecha.slice(0, 16).replace("T", " ")) + " (" + esc(ult.archivo) + ")" : "<strong>nunca</strong>") + ".</li>" +
      (sem ? "<li>Datos iniciales (versión " + esc(sem.version || 1) + ") cargados el " + esc(String(sem.fecha).slice(0, 10)) + " desde la base (" + esc((sem.origen || {}).revision || "") + ")." +
        (sem.actualizadas && sem.actualizadas.length ? " Actualizados porque no los habías editado: " + esc(sem.actualizadas.join(", ")) + "." : "") +
        (sem.conservadas && sem.conservadas.length ? " Conservados con tus ediciones (la versión nueva de la base no se aplicó): " + esc(sem.conservadas.join(", ")) + "." : "") +
        "</li>" : "") +
      "<li>Versión de la app: " + APP_VERSION + ".</li></ul>";
    c.innerHTML = html;
    if (navigator.storage && navigator.storage.estimate) {
      navigator.storage.estimate().then(function (e) {
        var li = document.createElement("li");
        li.textContent = "Espacio usado: " + (e.usage / 1048576).toFixed(1) + " MB de " + (e.quota / 1048576).toFixed(0) + " MB disponibles para la app.";
        c.querySelector("ul").appendChild(li);
      });
    }
    if (navigator.storage && navigator.storage.persisted) {
      navigator.storage.persisted().then(function (p) {
        var el = $("#r_persistente");
        if (el) el.textContent = p ? "Almacenamiento persistente: concedido. El navegador no debería borrar estos datos por falta de espacio." : "Almacenamiento persistente: no concedido. Los datos pueden borrarse si el teléfono se queda sin espacio: hacé respaldos.";
      });
    }
  }
  function vistaRespaldo() {
    vista(
      "<h2>Respaldo</h2>" +
      '<div class="caja">Los datos viven solo en este dispositivo. Si borrás la app, borrás los datos del navegador o el teléfono se queda sin espacio, se pueden perder. Exportá un respaldo después de cada salida a campo.</div>' +
      '<div id="r_info"></div>' +
      '<p id="r_persistente" class="resumen"></p>' +
      '<div class="botonera">' +
        '<button type="button" class="boton" id="r_compartir">Exportar respaldo</button>' +
        '<button type="button" class="boton secundario" id="r_descargar">Descargar archivo</button>' +
      "</div>" +
      '<p class="resumen">"Exportar" abre el menú de compartir (en iPhone: "Guardar en Archivos"). "Descargar" guarda el archivo directo. El archivo incluye fuentes, afirmaciones, observaciones y fotos, con sus IDs, historial y procedencia.</p>' +
      "<h3>Importar un respaldo</h3>" +
      '<p class="resumen">Agrega lo que falta y no reemplaza nada. Si un ID ya existe con otro contenido, te avisa y no lo toca.</p>' +
      '<label class="solo-lectores" for="r_archivo">Archivo de respaldo</label><input id="r_archivo" type="file" accept="application/json,.json">' +
      '<p id="r_estado" role="status"></p>' +
      "<h3>Almacenamiento</h3>" +
      '<div class="botonera"><button type="button" class="boton secundario" id="r_persistir">Pedir almacenamiento persistente</button></div>' +
      '<p class="resumen">En iPhone conviene usar la app desde el ícono de la pantalla de inicio: así es más probable que el sistema conceda el almacenamiento persistente.</p>'
    );
    pintarEstadoRespaldo();
    prepararRespaldo();
    $("#r_compartir").addEventListener("click", function () { exportar("compartir"); });
    $("#r_descargar").addEventListener("click", function () { exportar("descargar"); });
    $("#r_archivo").addEventListener("change", function (e) {
      var archivo = e.target.files[0];
      if (!archivo) return;
      importar(archivo).then(function () { e.target.value = ""; }); // permite volver a elegir el mismo archivo
    });
    $("#r_persistir").addEventListener("click", function () {
      if (!navigator.storage || !navigator.storage.persist) { $("#r_persistente").textContent = "Este navegador no permite pedir almacenamiento persistente."; return; }
      navigator.storage.persist().then(function () { pintarEstadoRespaldo(); });
    });
  }

  // ---------------------------------------------------------------- arranque
  function avisoConexion() { $("#aviso-conexion").hidden = navigator.onLine; }
  function registrarSW() {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("sw.js").then(function (reg) {
      reg.addEventListener("updatefound", function () {
        var nuevo = reg.installing;
        if (!nuevo) return;
        nuevo.addEventListener("statechange", function () {
          if (nuevo.state === "installed" && navigator.serviceWorker.controller) $("#aviso-actualizacion").hidden = false;
        });
      });
    }).catch(function () { /* sin service worker la app sigue funcionando con conexión */ });
    $("#btn-recargar").addEventListener("click", function () { location.reload(); });
  }

  function iniciar() {
    window.addEventListener("online", avisoConexion);
    window.addEventListener("offline", avisoConexion);
    avisoConexion();
    if (!window.indexedDB) { vista('<h2>Este navegador no sirve</h2><p>La biblioteca necesita IndexedDB para guardar datos en el dispositivo.</p>'); return; }
    abrirDB().then(function (d) { db = d; return cargarTodo(); })
      .then(cargarSemilla)
      .catch(function (err) { console.error(err); })
      .then(function () {
        window.addEventListener("hashchange", ruta);
        ruta();
        registrarSW();
      });
  }
  window.__biblioteca = { version: APP_VERSION, datos: datos }; // para pruebas
  iniciar();
})();
