/* Biblioteca agropecuaria — v0.2.0
   Todo funciona en el navegador. Los datos quedan en este dispositivo (IndexedDB).
   No hay servidor, cuentas, rastreadores ni dependencias externas. */
(function () {
  "use strict";

  var APP_VERSION = "0.2.0";
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
    "tanda4-v020": "Fuentes nuevas de la v0.2.0 (31/10/2026)",
    "mis-fuentes": "Mis fuentes (cargadas en la app)"
  };

  var ESTADOS_FUENTE = {
    "verificada": { txt: "Verificada", largo: "Verificada en el documento", icono: "✓", ayuda: "Se abrió el documento (original o copia íntegra con autoría identificada) y se confirmó título, autoría, fecha y alcance. No significa que aplique a la Cuenca del Salado ni que sea una recomendación." },
    "metadatos": { txt: "Solo metadatos", largo: "Solo metadatos", icono: "◐", ayuda: "Se confirmaron datos de catálogo, de una ficha oficial o de una nota que describe la fuente, pero no se leyó la fuente." },
    "pendiente": { txt: "Pendiente", largo: "Pendiente", icono: "○", ayuda: "La página no cargó, o solo hay una nota de prensa sin enlace oficial." },
    "sin-clasificar": { txt: "Sin clasificar", largo: "Sin clasificar", icono: "?", ayuda: "El estado no se pudo asignar al importar: revisá la ficha original." }
  };

  var ESTADOS_OBS = {
    "pendiente": { txt: "Pendiente", css: "pendiente", ayuda: "Recién registrada, sin análisis. No se usa como criterio." },
    "requiere": { txt: "Requiere más datos", css: "requiere", ayuda: "Falta un dato clave o hay contradicción. Anotá cuál en el motivo." },
    "confirmada": { txt: "Confirmada por mí", css: "confirmada", ayuda: "La volviste a observar o la aceptás como criterio personal. No es evidencia publicada." },
    "respaldada": { txt: "Respaldada", css: "respaldada", ayuda: "Coincide con una fuente (indicá el ID) o la validó un profesional (rol y fecha). Solo si esa revisión ocurrió de verdad." },
    "descartada": { txt: "Descartada", css: "descartada", ayuda: "No se repitió, se refutó o tenía otra causa. Se conserva como antecedente." }
  };

  var CLASES = {
    "obligacion-normativa": { corto: "Norma", largo: "Obligación normativa" },
    "evidencia-experimental": { corto: "Investigación", largo: "Evidencia experimental o de investigación" },
    "recomendacion-tecnica": { corto: "Recomendación", largo: "Recomendación técnica" },
    "comunicacion-institucional": { corto: "Institucional", largo: "Comunicación institucional o dato oficial" },
    "interpretacion": { corto: "Interpretación", largo: "Interpretación (no es un dato de la fuente)" }
  };

  var RUBROS = {
    "todos": "Todo",
    "ganaderia": "Ganadería",
    "agricultura": "Agricultura",
    "mixto": "Mixto"
  };

  var ESTADOS_TEMA = {
    "vigente": { txt: "Vigente", ayuda: "Igual conviene confirmar lo marcado abajo antes de usarlo." },
    "revisar": { txt: "Revisar vigencia", ayuda: "Incluye normas o datos que cambian seguido. Confirmá que siguen vigentes antes de actuar." },
    "limitado": { txt: "Alcance limitado", ayuda: "La evidencia es escasa, de otra zona o falta leer fuentes clave." }
  };

  var EVIDENCIA_LOCAL = {
    "local": "Evidencia de la zona",
    "parcial": "Evidencia parcial de la zona",
    "sin": "Sin evidencia local: referencia de otra zona"
  };

  var AREAS = {
    REC: "Recursos naturales y suelos", CUL: "Cultivos", FIT: "Fitosanitarios", FOR: "Forrajes y pasturas",
    ANI: "Producción animal", SAN: "Sanidad", GES: "Gestión", NOR: "Normativa", TEC: "Tecnología",
    MAQ: "Maquinaria", INS: "Instalaciones", SEG: "Seguridad laboral", INO: "Inocuidad", ECO: "Economía",
    COM: "Comercialización", CLI: "Clima", INU: "Inundaciones", AGU: "Agua"
  };
  var AREAS_GANADERIA = ["ANI", "SAN", "FOR", "INS", "INO"];
  var AREAS_AGRICULTURA = ["CUL", "FIT"];

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
  var contenido = { temas: [], listas: [], herramientas: [], ilustraciones: {}, cargado: false };
  var meta = {};
  var urlsFotos = [];
  var marcadosListas = {};

  // ---------------------------------------------------------------- utilidades
  function esc(v) {
    return String(v == null ? "" : v)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function normalizar(t) {
    return String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function hoyISO() {
    var d = new Date();
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }
  function ahoraISO() { return new Date().toISOString(); }
  function fechaCorta(iso) {
    var m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? m[3] + "/" + m[2] + "/" + m[1] : String(iso || "");
  }
  function mesTexto(ym) {
    var meses = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
    var m = String(ym || "").match(/^(\d{4})-(\d{2})/);
    return m ? meses[parseInt(m[2], 10) - 1] + " de " + m[1] : String(ym || "");
  }
  function urlSegura(u) { return /^https?:\/\//i.test(String(u || "")) ? String(u) : ""; }
  function enlaceExterno(u, texto) {
    var s = urlSegura(u);
    if (!s) return esc(texto || u || "");
    return '<a href="' + esc(s) + '" target="_blank" rel="noopener noreferrer">' + esc(texto || s) + "</a>";
  }
  function textoConEnlaces(t) {
    var s = String(t || "");
    var out = "", ultimo = 0, re = /\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g, m;
    while ((m = re.exec(s))) {
      out += esc(s.slice(ultimo, m.index).replace(/\*\*/g, "")) + enlaceExterno(m[2], m[1]);
      ultimo = re.lastIndex;
    }
    return out + esc(s.slice(ultimo).replace(/\*\*/g, ""));
  }
  function lsLeer(k, def) { try { var v = localStorage.getItem(k); return v == null ? def : v; } catch (e) { return def; } }
  function lsGuardar(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* sin almacenamiento local: se usa el valor en memoria */ } }

  function badgeFuente(estado, corto) {
    var e = ESTADOS_FUENTE[estado] || ESTADOS_FUENTE["sin-clasificar"];
    return '<span class="estado estado-' + esc(estado) + '"><span aria-hidden="true">' + e.icono + "</span> " + esc(corto ? e.txt : e.largo) + "</span>";
  }
  function badgeObs(estado) {
    var e = ESTADOS_OBS[estado] || ESTADOS_OBS.pendiente;
    return '<span class="estado estado-' + e.css + '">' + esc(e.txt) + "</span>";
  }
  function badgeClase(c) {
    var x = CLASES[c] || CLASES.interpretacion;
    return '<span class="clase clase-' + esc(c) + '" title="' + esc(x.largo) + '">' + esc(x.corto) + "</span>";
  }
  function badgeTema(t) {
    var e = ESTADOS_TEMA[t.estado] || ESTADOS_TEMA.vigente;
    return '<span class="estado tema-' + esc(t.estado) + '">' + esc(e.txt) + "</span>";
  }
  function badgeRubros(rubros) {
    return (rubros || []).map(function (r) { return '<span class="rubro rubro-' + esc(r) + '">' + esc(RUBROS[r] || r) + "</span>"; }).join("");
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
      if (v && typeof v === "object") return JSON.stringify(v);
      return v || "";
    }).join(" "));
  }
  function temaVence(t) { return t.revisar_en && t.revisar_en <= hoyISO().slice(0, 7); }

  // Rubros de una fuente según sus áreas; las que no son de ganadería ni agricultura son transversales.
  function rubrosFuente(f) {
    var a = f.areas || [], g = false, c = false;
    a.forEach(function (x) { if (AREAS_GANADERIA.indexOf(x) !== -1) g = true; if (AREAS_AGRICULTURA.indexOf(x) !== -1) c = true; });
    if (g && c) return ["ganaderia", "agricultura", "mixto"];
    if (g) return ["ganaderia"];
    if (c) return ["agricultura"];
    return ["transversal"];
  }
  function fuenteEnRubro(f, rubro) {
    if (rubro === "todos") return true;
    var r = rubrosFuente(f);
    return r.indexOf(rubro) !== -1 || r.indexOf("transversal") !== -1;
  }
  function temaEnRubro(t, rubro) { return rubro === "todos" || (t.rubros || []).indexOf(rubro) !== -1; }
  function obsEnRubro(o, rubro) {
    if (rubro === "todos" || !o.tema_id) return true;
    var t = porId(contenido.temas, o.tema_id);
    return !t || temaEnRubro(t, rubro);
  }

  var rubroActivo = lsLeer("ba_rubro", "todos");
  if (!RUBROS[rubroActivo]) rubroActivo = "todos";
  function selectorRubro(onCambio) {
    var html = '<div class="segmentado" role="group" aria-label="Filtrar por rubro">' + Object.keys(RUBROS).map(function (k) {
      return '<button type="button" data-rubro="' + k + '" aria-pressed="' + (rubroActivo === k) + '">' + esc(RUBROS[k]) + "</button>";
    }).join("") + "</div>";
    setTimeout(function () {
      document.querySelectorAll("[data-rubro]").forEach(function (b) {
        b.addEventListener("click", function () {
          rubroActivo = b.getAttribute("data-rubro");
          lsGuardar("ba_rubro", rubroActivo);
          document.querySelectorAll("[data-rubro]").forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); });
          onCambio();
        });
      });
    }, 0);
    return html;
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
      o._busqueda = textoBusqueda(o, ["id", "titulo", "lugar", "observe", "contexto", "condiciones", "decision", "resultado", "interpretacion", "falto", "confirmaria", "no_aplicaria", "fuentes_relacionadas", "tema_id"]);
    });
    contenido.temas.forEach(function (t) {
      t._busqueda = textoBusqueda(t, ["id", "titulo", "categoria", "resumen", "zona", "confirmar", "limites", "pendientes"]) + " " +
        normalizar((t.puntos || []).map(function (p) { return p.texto + " " + p.fuentes.join(" "); }).join(" ")) + " " +
        normalizar((t.rubros || []).map(function (r) { return RUBROS[r]; }).join(" "));
    });
  }
  function limpio(r) {
    var c = {};
    Object.keys(r).forEach(function (k) { if (k.charAt(0) !== "_") c[k] = r[k]; });
    return c;
  }

  // Lee los datos iniciales (temas, listas y herramientas se usan siempre desde este archivo).
  // Las fuentes se agregan a la base local: solo las que faltan, y se actualizan solo las importadas
  // que nunca editaste (versión 1, origen "base-importada"). Tus datos no se tocan.
  function cargarSemilla() {
    return fetch("datos/semilla.json", { cache: "no-cache" }).then(function (r) {
      if (!r.ok) throw new Error("No se pudieron leer los datos iniciales (" + r.status + ")");
      return r.json();
    }).then(function (s) {
      contenido.temas = s.temas || [];
      contenido.listas = s.listas || [];
      contenido.herramientas = s.herramientas || [];
      contenido.ilustraciones = s.ilustraciones || {};
      contenido.version = s.version_semilla;
      contenido.cargado = true;
      if ((meta.semilla_version || 0) >= s.version_semilla) { indexar(); return; }
      var informe = { nuevas: 0, actualizadas: [], conservadas: [] };
      function elegir(lista, actuales) {
        return (lista || []).filter(function (reg) {
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
      var activa = a.getAttribute("data-seccion") === seccion;
      a.classList.toggle("activa", activa);
      if (activa) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
  }
  function ruta() {
    var h = location.hash.replace(/^#\/?/, "");
    var partes = h.split("?");
    var segs = partes[0].split("/").map(decodeURIComponent);
    var params = {};
    if (partes[1]) partes[1].split("&").forEach(function (p) { var kv = p.split("="); params[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1] || ""); });
    var r = segs[0] || "inicio";
    var id = segs[1] || "";
    var mapa = {
      "inicio": ["inicio", vistaInicio],
      "temas": ["temas", function () { vistaTemas(params); }],
      "tema": ["temas", function () { vistaTema(id); }],
      "lista": ["temas", function () { vistaLista(id); }],
      "herramienta": ["temas", function () { vistaHerramienta(id); }],
      "buscar": ["buscar", function () { vistaBuscar(params); }],
      "fuentes": ["mas", vistaFuentes],
      "fuente": ["mas", function () { vistaFuente(id); }],
      "fuente-nueva": ["mas", function () { vistaFormFuente(null); }],
      "fuente-editar": ["mas", function () { vistaFormFuente(id); }],
      "afirmacion": ["mas", function () { vistaAfirmacion(id); }],
      "afirmacion-nueva": ["mas", function () { vistaFormAfirmacion(params.fuente || ""); }],
      "campo": ["campo", vistaCampo],
      "observacion": ["campo", function () { vistaObservacion(id); }],
      "observacion-nueva": ["campo", function () { vistaFormObservacion(null, params); }],
      "observacion-editar": ["campo", function () { vistaFormObservacion(id, {}); }],
      "respaldo": ["mas", vistaRespaldo],
      "mas": ["mas", vistaMas],
      "acerca": ["mas", vistaAcerca]
    };
    var destino = mapa[r] || mapa.inicio;
    marcarNav(destino[0]);
    destino[1]();
  }

  // ---------------------------------------------------------------- Inicio
  function diasDesde(iso) { return iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86400000) : null; }
  function vistaInicio() {
    function pintar() {
      var temas = contenido.temas.filter(function (t) { return temaEnRubro(t, rubroActivo); });
      var cats = {};
      temas.forEach(function (t) { cats[t.categoria] = (cats[t.categoria] || 0) + 1; });
      var revisar = temas.filter(function (t) { return t.estado !== "vigente" || temaVence(t); }).length;
      var notas = datos.observaciones.filter(function (o) { return obsEnRubro(o, rubroActivo); }).length;
      var ult = meta.ultimo_respaldo;
      var dias = ult ? diasDesde(ult.fecha) : null;
      var avisoResp = "";
      if (datos.observaciones.length && (dias === null || dias > 7)) {
        avisoResp = '<a class="tarjeta tarjeta-aviso" href="#/respaldo"><strong>' + (dias === null ? "Todavía no exportaste un respaldo" : "Hace " + dias + " días del último respaldo") + "</strong><span>Tus notas y fotos viven solo en este dispositivo. Tocá para exportar.</span></a>";
      }
      $("#inicio-cuerpo").innerHTML =
        avisoResp +
        '<h3 class="seccion-titulo">Temas</h3>' +
        '<div class="grilla">' + Object.keys(cats).sort().map(function (c) {
          return '<a class="tarjeta tarjeta-cat" href="#/temas?cat=' + encodeURIComponent(c) + '"><span class="tarjeta-titulo">' + esc(c) + '</span><span class="tarjeta-num">' + cats[c] + (cats[c] === 1 ? " tema" : " temas") + "</span></a>";
        }).join("") + "</div>" +
        '<div class="grilla grilla-2">' +
          '<a class="tarjeta" href="#/temas?estado=revisar"><span class="tarjeta-titulo">Para revisar</span><span class="tarjeta-num">' + revisar + ' temas con vigencia por confirmar o alcance limitado</span></a>' +
          '<a class="tarjeta tarjeta-nota" href="#/campo"><span class="tarjeta-titulo">Mis notas</span><span class="tarjeta-num">' + notas + (notas === 1 ? " guardada" : " guardadas") + ' en este dispositivo</span></a>' +
        "</div>" +
        '<h3 class="seccion-titulo">Herramientas y listas</h3>' +
        '<ul class="lista lista-compacta">' +
          contenido.herramientas.map(function (h) { return '<li><a class="item" href="#/herramienta/' + encodeURIComponent(h.id) + '"><span class="item-titulo">' + esc(h.titulo) + "</span></a></li>"; }).join("") +
          contenido.listas.map(function (l) { return '<li><a class="item" href="#/lista/' + encodeURIComponent(l.id) + '"><span class="item-titulo">' + esc(l.titulo) + "</span></a></li>"; }).join("") +
        "</ul>";
    }
    vista(
      '<section class="portada">' +
        '<p class="portada-zona">Cuenca del Salado · Lezama, Castelli, Dolores, Pila, Chascomús, Gral. Belgrano</p>' +
        "<h2>¿Qué querés consultar?</h2>" +
        '<form id="form-inicio" class="buscador-form" role="search"><label class="solo-lectores" for="q-inicio">Buscar</label>' +
        '<input id="q-inicio" class="buscador" type="search" autocomplete="off" placeholder="Ej.: DT-e, brucelosis, desbaste, Dolores">' +
        '<button class="boton" type="submit">Buscar</button></form>' +
        selectorRubro(pintar) +
      "</section>" +
      (contenido.cargado ? "" : '<div class="caja limite">No se pudieron leer los temas. Abrí la app una vez con conexión.</div>') +
      '<div id="inicio-cuerpo"></div>' +
      '<p class="pie">Herramienta de estudio y organización. No diagnostica enfermedades, no indica medicamentos ni dosis y no reemplaza a veterinarios, ingenieros agrónomos ni organismos oficiales.</p>'
    );
    $("#form-inicio").addEventListener("submit", function (e) {
      e.preventDefault();
      location.hash = "#/buscar?q=" + encodeURIComponent($("#q-inicio").value.trim());
    });
    pintar();
  }

  // ---------------------------------------------------------------- Temas
  var filtroCat = "todas", filtroEstadoTema = "todos";
  function tarjetaTema(t) {
    var vence = temaVence(t);
    return '<li><a class="item item-tema" href="#/tema/' + encodeURIComponent(t.id) + '">' +
      '<span class="item-id">' + esc(t.categoria) + "</span>" +
      '<span class="item-titulo">' + esc(t.titulo) + "</span>" +
      '<span class="item-extra">' + badgeRubros(t.rubros) + badgeTema(t) + (vence ? '<span class="estado tema-revisar">Toca revisar</span>' : "") +
      '<span class="evidencia evidencia-' + esc(t.evidencia_local) + '">' + esc(EVIDENCIA_LOCAL[t.evidencia_local] || "") + "</span></span></a></li>";
  }
  function vistaTemas(params) {
    if (params && params.cat) filtroCat = params.cat;
    if (params && params.estado) filtroEstadoTema = params.estado;
    function pintar() {
      var base = contenido.temas.filter(function (t) { return temaEnRubro(t, rubroActivo); });
      var cats = [];
      base.forEach(function (t) { if (cats.indexOf(t.categoria) === -1) cats.push(t.categoria); });
      cats.sort();
      if (filtroCat !== "todas" && cats.indexOf(filtroCat) === -1) filtroCat = "todas";
      $("#cat").innerHTML = '<option value="todas">Todas las categorías</option>' + cats.map(function (c) {
        return '<option value="' + esc(c) + '"' + (filtroCat === c ? " selected" : "") + ">" + esc(c) + "</option>";
      }).join("");
      var lista = base.filter(function (t) {
        if (filtroCat !== "todas" && t.categoria !== filtroCat) return false;
        if (filtroEstadoTema === "revisar") return t.estado !== "vigente" || temaVence(t);
        if (filtroEstadoTema !== "todos") return t.estado === filtroEstadoTema;
        return true;
      });
      $("#conteo-temas").textContent = lista.length + (lista.length === 1 ? " tema" : " temas");
      $("#lista-temas").innerHTML = lista.length ? '<ul class="lista">' + lista.map(tarjetaTema).join("") + "</ul>" : '<p class="vacio">No hay temas con esos filtros.</p>';
    }
    var chips = [["todos", "Todos"], ["vigente", "Vigentes"], ["revisar", "Para revisar"], ["limitado", "Alcance limitado"]].map(function (c) {
      return '<button type="button" class="chip" data-et="' + c[0] + '" aria-pressed="' + (filtroEstadoTema === c[0]) + '">' + esc(c[1]) + "</button>";
    }).join("");
    vista(
      "<h2>Temas</h2>" +
      '<p class="resumen">Cada tema resume qué dicen las fuentes, a qué zona aplica y qué falta confirmar. Los puntos marcados "Interpretación" son de la app, no de la fuente.</p>' +
      selectorRubro(pintar) +
      '<label class="solo-lectores" for="cat">Categoría</label><select id="cat" class="selector"></select>' +
      '<div class="filtros">' + chips + "</div>" +
      '<p id="conteo-temas" class="resumen"></p><div id="lista-temas"></div>'
    );
    $("#cat").addEventListener("change", function (e) { filtroCat = e.target.value; pintar(); });
    document.querySelectorAll("[data-et]").forEach(function (b) {
      b.addEventListener("click", function () {
        filtroEstadoTema = b.getAttribute("data-et");
        document.querySelectorAll("[data-et]").forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); });
        pintar();
      });
    });
    pintar();
  }

  function chipFuente(fid) {
    var f = porId(datos.fuentes, fid);
    if (!f) return '<span class="chip-fuente">' + esc(fid) + " (no está en la biblioteca)</span>";
    var e = ESTADOS_FUENTE[f.estado] || ESTADOS_FUENTE["sin-clasificar"];
    return '<a class="chip-fuente estado-' + esc(f.estado) + '" href="#/fuente/' + encodeURIComponent(fid) + '" title="' + esc(f.titulo) + '"><span aria-hidden="true">' + e.icono + "</span> " + esc(fid) + " · " + esc(e.txt) + "</a>";
  }

  function vistaTema(id) {
    var t = porId(contenido.temas, id);
    if (!t) { vista('<h2>No encontrado</h2><p>No hay ningún tema ' + esc(id) + '.</p><a href="#/temas">Volver a Temas</a>'); return; }
    var usoLimitado = /sanidad|inocuidad|fitosanitario/i.test(t.categoria + " " + t.titulo);
    var puntos = (t.puntos || []).map(function (p) {
      return '<li class="punto punto-' + esc(p.clase) + '">' + badgeClase(p.clase) + '<p>' + esc(p.texto) + "</p>" +
        (p.fuentes.length ? '<div class="fuentes-punto">' + p.fuentes.map(chipFuente).join("") + "</div>" : '<div class="fuentes-punto"><span class="chip-fuente">Sin fuente: criterio de la app</span></div>') + "</li>";
    }).join("");
    var notas = datos.observaciones.filter(function (o) { return o.tema_id === t.id; });
    var lista = t.lista ? porId(contenido.listas, t.lista) : null;
    var herr = t.herramienta ? porId(contenido.herramientas, t.herramienta) : null;
    var ilu = t.ilustracion ? ilustracion(t.ilustracion) : "";
    vista(
      '<p class="miga"><a href="#/temas">Temas</a> · ' + esc(t.categoria) + "</p>" +
      "<h2>" + esc(t.titulo) + "</h2>" +
      '<p class="etiquetas">' + badgeRubros(t.rubros) + badgeTema(t) + (temaVence(t) ? '<span class="estado tema-revisar">Toca revisar</span>' : "") + "</p>" +
      '<div class="alcance">' +
        '<p><strong>' + esc(EVIDENCIA_LOCAL[t.evidencia_local] || "") + ".</strong> " + esc(t.zona) + "</p>" +
        '<p class="resumen">' + esc((ESTADOS_TEMA[t.estado] || ESTADOS_TEMA.vigente).ayuda) + " Revisado el " + esc(fechaCorta(t.fecha_revision)) + "; volver a revisar en " + esc(mesTexto(t.revisar_en)) + ".</p>" +
      "</div>" +
      (usoLimitado ? '<div class="caja limite">Solo para estudiar y preparar preguntas. Ante un caso real: veterinario, ingeniero agrónomo o SENASA. La app no da diagnósticos, productos ni dosis.</div>' : "") +
      '<div class="sintesis"><p class="sintesis-rotulo">Síntesis de la app (interpretación)</p><p>' + esc(t.resumen) + "</p></div>" +
      "<h3>Qué dicen las fuentes</h3>" +
      '<ul class="puntos">' + puntos + "</ul>" +
      ilu +
      (t.confirmar && t.confirmar.length ? '<h3>Antes de usarlo, confirmá</h3><ul class="confirmar">' + t.confirmar.map(function (c) { return "<li>" + esc(c) + "</li>"; }).join("") + "</ul>" : "") +
      '<div class="caja limite"><strong>Límites:</strong> ' + esc(t.limites) + "</div>" +
      (t.pendientes && t.pendientes.length ? "<h3>Pendiente de investigar</h3><ul>" + t.pendientes.map(function (c) { return "<li>" + esc(c) + "</li>"; }).join("") + "</ul>" : "") +
      ((lista || herr) ? '<div class="botonera">' +
        (lista ? '<a class="boton secundario" href="#/lista/' + encodeURIComponent(lista.id) + '">Lista: ' + esc(lista.titulo) + "</a>" : "") +
        (herr ? '<a class="boton secundario" href="#/herramienta/' + encodeURIComponent(herr.id) + '">' + esc(herr.titulo) + "</a>" : "") +
      "</div>" : "") +
      '<h3>Mis notas sobre este tema</h3>' +
      (notas.length ? listaObservaciones(notas) : '<p class="vacio">Todavía no hay notas tuyas sobre este tema.</p>') +
      '<div class="botonera"><a class="boton" href="#/observacion-nueva?tipo=estudio&tema=' + encodeURIComponent(t.id) + '">Agregar nota</a>' +
      '<a class="boton secundario" href="#/observacion-nueva?tipo=campo&tema=' + encodeURIComponent(t.id) + '">Observación de campo</a></div>'
    );
  }

  // ---------------------------------------------------------------- Ilustraciones propias (SVG, sin conexión)
  function ilustracion(id) {
    var info = contenido.ilustraciones[id] || {};
    var svg = id === "I-PAISAJE" ? svgPaisaje() : id === "I-EC" ? svgEstadoCorporal() : "";
    if (!svg) return "";
    return '<figure class="ilustracion">' + svg +
      "<figcaption><strong>" + esc(info.titulo || "Ilustración") + ".</strong> " + esc(info.nota || "Ilustración propia; no es evidencia.") +
      (info.fuentes && info.fuentes.length ? " Basada en: " + info.fuentes.map(function (f) { return '<a href="#/fuente/' + encodeURIComponent(f) + '">' + esc(f) + "</a>"; }).join(", ") + "." : "") +
      "</figcaption></figure>";
  }
  function svgPaisaje() {
    return '<svg viewBox="0 0 360 250" role="img" aria-labelledby="svg-p-t" class="svg-dibujo">' +
      '<title id="svg-p-t">Corte esquemático del relieve: loma, media loma y bajo con agua acumulada</title>' +
      '<rect x="0" y="0" width="360" height="250" fill="var(--superficie)"/>' +
      '<path d="M0 70 C 60 64, 90 68, 125 85 C 165 105, 200 112, 235 128 C 262 141, 290 146, 360 146 L360 190 L0 190 Z" fill="var(--tierra-claro)" stroke="var(--tierra)" stroke-width="2"/>' +
      '<path d="M250 137 C 280 145, 320 145, 360 145 L360 151 C 320 151, 280 151, 250 142 Z" fill="var(--agua)"/>' +
      '<g fill="var(--oliva)"><path d="M30 68 l3 -12 l3 12 Z M55 67 l3 -13 l3 13 Z M85 68 l3 -11 l3 11 Z"/>' +
      '<path d="M160 102 l3 -9 l3 9 Z M185 108 l3 -8 l3 8 Z"/><path d="M300 144 l2 -6 l2 6 Z M330 144 l2 -6 l2 6 Z"/></g>' +
      '<g font-size="16" font-weight="700" fill="var(--texto)"><text x="14" y="24">Loma</text><text x="130" y="62">Media loma</text><text x="280" y="102">Bajo</text></g>' +
      '<g font-size="12.5" fill="var(--texto-suave)"><text x="14" y="42">se anega menos</text><text x="130" y="78">intermedia</text><text x="280" y="120">puede quedar</text><text x="280" y="135">con agua</text></g>' +
      '<g font-size="13" fill="var(--texto)"><text x="10" y="214">Cada posición tiene su suelo y su comunidad</text>' +
      '<text x="10" y="232">vegetal; humedad y sal serían los controles.</text></g></svg>';
  }
  function svgEstadoCorporal() {
    function x(v) { return 30 + (v - 1) * 75; }
    var ticks = "";
    for (var v = 1; v <= 5; v += 0.5) {
      ticks += '<line x1="' + x(v) + '" y1="80" x2="' + x(v) + '" y2="' + (v % 1 ? 88 : 94) + '" stroke="var(--texto)" stroke-width="2"/>';
      if (v % 1 === 0) ticks += '<text x="' + x(v) + '" y="112" text-anchor="middle" font-size="15" font-weight="700" fill="var(--texto)">' + v + "</text>";
    }
    function linea(y, txts) { return txts.map(function (t, i) { return '<text x="44" y="' + (y + i * 18) + '">' + t + "</text>"; }).join(""); }
    return '<svg viewBox="0 0 360 330" role="img" aria-labelledby="svg-ec-t" class="svg-dibujo">' +
      '<title id="svg-ec-t">Escala de estado corporal de 1 a 5 con los objetivos de referencia</title>' +
      '<rect x="0" y="0" width="360" height="330" fill="var(--superficie)"/>' +
      '<text x="14" y="24" font-size="14" font-weight="700" fill="var(--texto)">Escala de estado corporal (1 a 5)</text>' +
      '<rect x="' + x(1) + '" y="62" width="' + (x(2.5) - x(1)) + '" height="18" fill="var(--alerta-fondo)" stroke="var(--alerta)"/>' +
      '<rect x="' + x(2.5) + '" y="62" width="' + (x(5) - x(2.5)) + '" height="18" fill="var(--oliva-claro)" stroke="var(--oliva)"/>' +
      '<rect x="' + x(3.5) + '" y="44" width="' + (x(4) - x(3.5)) + '" height="12" fill="var(--tierra)"/>' +
      '<line x1="' + x(3) + '" y1="56" x2="' + x(3) + '" y2="98" stroke="var(--oliva-osc)" stroke-width="3"/>' +
      '<line x1="' + x(3.5) + '" y1="56" x2="' + x(3.5) + '" y2="98" stroke="var(--trigo)" stroke-width="3" stroke-dasharray="5 3"/>' +
      '<line x1="' + x(1) + '" y1="80" x2="' + x(5) + '" y2="80" stroke="var(--texto)" stroke-width="2"/>' + ticks +
      '<g font-size="14" fill="var(--texto)">' +
        '<rect x="14" y="134" width="20" height="14" fill="var(--alerta-fondo)" stroke="var(--alerta)"/>' +
        linea(146, ["Menos de 2,5 al servicio: la guía sugiere", "evaluar destete temporario o precoz", "con el asesor."]) +
        '<line x1="14" y1="214" x2="34" y2="214" stroke="var(--oliva-osc)" stroke-width="3"/>' +
        linea(219, ["3: óptimo. Al parto, vacas adultas: 3 o más."]) +
        '<line x1="14" y1="250" x2="34" y2="250" stroke="var(--trigo)" stroke-width="3" stroke-dasharray="5 3"/>' +
        linea(255, ["3,5: al parto, vaquillonas y vacas", "de segundo servicio."]) +
        '<rect x="14" y="297" width="20" height="12" fill="var(--tierra)"/>' +
        linea(308, ["Toros al entrar al servicio: 3,5 a 4."]) +
      "</g></svg>";
  }

  // ---------------------------------------------------------------- Listas de verificación
  function vistaLista(id) {
    var l = porId(contenido.listas, id);
    if (!l) { vista("<h2>No encontrada</h2>"); return; }
    var t = porId(contenido.temas, l.tema);
    var marcados = marcadosListas[id] || (marcadosListas[id] = {});
    vista(
      '<p class="miga"><a href="#/temas">Temas</a>' + (t ? ' · <a href="#/tema/' + encodeURIComponent(t.id) + '">' + esc(t.titulo) + "</a>" : "") + "</p>" +
      "<h2>" + esc(l.titulo) + "</h2>" +
      '<p class="resumen">Lista para no olvidarse de nada. Lo que marcás no se guarda: se borra al salir de la pantalla. Cada punto dice de dónde sale.</p>' +
      '<ul class="checklist">' + l.items.map(function (it, i) {
        return '<li><label class="check"><input type="checkbox" data-i="' + i + '"' + (marcados[i] ? " checked" : "") + "><span>" + esc(it.texto) + "</span></label>" +
          '<div class="fuentes-punto">' + badgeClase(it.clase) + it.fuentes.map(chipFuente).join("") + "</div></li>";
      }).join("") + "</ul>" +
      '<p id="progreso" class="resumen"></p>' +
      '<div class="botonera"><button type="button" class="boton secundario" id="reiniciar">Desmarcar todo</button></div>'
    );
    function progreso() {
      var n = Object.keys(marcados).filter(function (k) { return marcados[k]; }).length;
      $("#progreso").textContent = n + " de " + l.items.length + " revisados.";
    }
    document.querySelectorAll(".checklist input").forEach(function (c) {
      c.addEventListener("change", function () { marcados[c.getAttribute("data-i")] = c.checked; progreso(); });
    });
    $("#reiniciar").addEventListener("click", function () { marcadosListas[id] = {}; vistaLista(id); });
    progreso();
  }

  // ---------------------------------------------------------------- Herramientas (no guardan nada)
  function num(id) {
    var el = $("#" + id);
    if (!el) return NaN;
    // Acepta "1.234,5" (formato argentino), "1234,5" y "1234.5".
    var s = String(el.value || "").trim().replace(/\s|\$/g, "");
    if (!s) return NaN;
    if (s.indexOf(",") !== -1) s = s.replace(/\./g, "").replace(",", ".");
    else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
    return /^-?\d+(\.\d+)?$/.test(s) ? parseFloat(s) : NaN;
  }
  function fmt(n, dec) {
    if (!isFinite(n)) return "—";
    return n.toLocaleString("es-AR", { minimumFractionDigits: dec || 0, maximumFractionDigits: dec || 0 });
  }
  function campoNum(id, etiqueta, ayuda) {
    return '<div class="campo"><label for="' + id + '">' + esc(etiqueta) + "</label>" + (ayuda ? '<p class="ayuda">' + esc(ayuda) + "</p>" : "") +
      '<input id="' + id + '" type="text" inputmode="decimal" autocomplete="off"></div>';
  }
  function vistaHerramienta(id) {
    var h = porId(contenido.herramientas, id);
    if (!h) { vista("<h2>No encontrada</h2>"); return; }
    var t = porId(contenido.temas, h.tema);
    var cuerpo = "";
    if (id === "H-VENTA") {
      cuerpo = campoNum("v_cab", "Cabezas") + campoNum("v_peso", "Peso promedio en el campo (kg por cabeza)") +
        campoNum("v_desb", "Desbaste pactado (%)", "El que se acuerda en la operación. La guía de referencia cita 3–5 % con carga al amanecer y 5–8 % por la tarde.") +
        campoNum("v_precio", "Precio ($ por kg)", "Cargalo el día de la operación y anotá de dónde sale.") +
        '<div class="campo"><label for="v_fuente">Fuente y fecha del precio</label><input id="v_fuente" type="text" placeholder="Ej.: MAG Cañuelas, 31/10/2026"></div>' +
        campoNum("v_com", "Comisión (%)") + campoNum("v_flete", "Flete ($ total)") + campoNum("v_otros", "Otros gastos ($ total)");
    } else if (id === "H-MARGEN") {
      cuerpo = "<h3>Ingresos del período</h3>" + campoNum("m_ventas", "Ventas ($)") + campoNum("m_oting", "Otros ingresos ($)") +
        "<h3>Costos directos</h3>" + campoNum("m_com", "Comercialización: comisiones y fletes ($)") + campoNum("m_san", "Sanidad ($)") +
        campoNum("m_ali", "Alimentación y forrajes ($)") + campoNum("m_per", "Personal ($)") + campoNum("m_rep", "Reposición (toros, vientres) ($)") +
        campoNum("m_lab", "Labores y contratistas ($)") + campoNum("m_alq", "Alquiler, si arrendás ($)") + campoNum("m_otr", "Otros costos directos ($)") +
        "<h3>Superficie</h3>" + campoNum("m_ha", "Hectáreas de la actividad");
    } else if (id === "H-POTREROS") {
      cuerpo = campoNum("p_desc", "Días de descanso que querés dar") + campoNum("p_ocup", "Días de ocupación de cada potrero");
    }
    vista(
      '<p class="miga"><a href="#/temas">Temas</a>' + (t ? ' · <a href="#/tema/' + encodeURIComponent(t.id) + '">' + esc(t.titulo) + "</a>" : "") + "</p>" +
      "<h2>" + esc(h.titulo) + "</h2>" +
      '<div class="caja">' + esc(h.nota) + " Nada de lo que cargás se guarda ni se envía.</div>" +
      '<form id="form-h" novalidate>' + cuerpo + "</form>" +
      '<div id="resultado" class="resultado" aria-live="polite"></div>' +
      '<p class="resumen">Fuentes: ' + h.fuentes.map(chipFuente).join(" ") + "</p>"
    );
    function calcular() {
      var r = "";
      if (id === "H-VENTA") {
        var cab = num("v_cab"), peso = num("v_peso"), d = num("v_desb") || 0, pr = num("v_precio"), com = num("v_com") || 0, fl = num("v_flete") || 0, ot = num("v_otros") || 0;
        var kgCampo = cab * peso, kgNeto = kgCampo * (1 - d / 100), bruto = kgNeto * pr, comision = bruto * com / 100, neto = bruto - comision - fl - ot;
        var perdida = kgCampo * pr - bruto;
        r = filaRes("Kilos en el campo", fmt(kgCampo) + " kg") + filaRes("Kilos después del desbaste", fmt(kgNeto) + " kg") +
          filaRes("Importe bruto", "$ " + fmt(bruto)) + filaRes("Lo que resta el desbaste", "$ " + fmt(perdida)) +
          filaRes("Comisión", "$ " + fmt(comision)) + filaRes("Neto", "$ " + fmt(neto), true) + filaRes("Neto por cabeza", "$ " + fmt(neto / cab)) +
          ($("#v_fuente").value.trim() ? filaRes("Precio según", esc($("#v_fuente").value.trim())) : filaRes("Precio según", "sin fuente anotada"));
      } else if (id === "H-MARGEN") {
        var ing = (num("m_ventas") || 0) + (num("m_oting") || 0);
        var costos = ["m_com", "m_san", "m_ali", "m_per", "m_rep", "m_lab", "m_alq", "m_otr"].reduce(function (s, k) { return s + (num(k) || 0); }, 0);
        var mb = ing - costos, ha = num("m_ha");
        r = filaRes("Ingresos", "$ " + fmt(ing)) + filaRes("Costos directos", "$ " + fmt(costos)) + filaRes("Margen bruto", "$ " + fmt(mb), true) +
          filaRes("Margen bruto por hectárea", ha > 0 ? "$ " + fmt(mb / ha) : "—") + filaRes("Costos sobre ingresos", ing > 0 ? fmt(costos / ing * 100, 1) + " %" : "—");
      } else if (id === "H-POTREROS") {
        var de = num("p_desc"), oc = num("p_ocup");
        var n = de / oc + 1;
        r = filaRes("Potreros (fórmula)", isFinite(n) ? fmt(n, 1) : "—", true) + filaRes("Redondeado hacia arriba", isFinite(n) ? fmt(Math.ceil(n)) : "—");
      }
      $("#resultado").innerHTML = "<dl>" + r + "</dl>";
    }
    function filaRes(t, v, fuerte) { return '<div class="fila-res' + (fuerte ? " fuerte" : "") + '"><dt>' + esc(t) + "</dt><dd>" + v + "</dd></div>"; }
    $("#form-h").addEventListener("input", calcular);
    calcular();
  }

  // ---------------------------------------------------------------- Buscar
  var ultimaBusqueda = "", filtroTipoBusqueda = "todo", soloLocal = false;
  function coincide(r, palabras) {
    if (!r._busqueda) return false;
    for (var i = 0; i < palabras.length; i++) if (r._busqueda.indexOf(palabras[i]) === -1) return false;
    return true;
  }
  function vistaBuscar(params) {
    if (params && params.q != null) ultimaBusqueda = params.q;
    var chips = [["todo", "Todo"], ["temas", "Temas"], ["fuentes", "Fuentes"], ["notas", "Mis notas"]].map(function (c) {
      return '<button type="button" class="chip" data-tb="' + c[0] + '" aria-pressed="' + (filtroTipoBusqueda === c[0]) + '">' + esc(c[1]) + "</button>";
    }).join("");
    var sugerencias = ["DT-e", "brucelosis", "desbaste", "arrendamiento", "agua", "Dolores", "agropiro", "inundación"].map(function (s) {
      return '<button type="button" class="chip chip-sug" data-sug="' + esc(s) + '">' + esc(s) + "</button>";
    }).join("");
    vista(
      "<h2>Buscar</h2>" +
      '<label class="solo-lectores" for="q">Buscar en temas, fuentes y notas</label>' +
      '<input id="q" class="buscador" type="search" autocomplete="off" placeholder="Tema, zona, cultivo, especie, norma o ID" value="' + esc(ultimaBusqueda) + '">' +
      '<div class="filtros">' + chips + "</div>" +
      selectorRubro(pintarResultados) +
      '<label class="check check-linea"><input type="checkbox" id="solo-local"' + (soloLocal ? " checked" : "") + "><span>Solo con evidencia de la zona</span></label>" +
      '<div id="resultados"></div>' +
      '<div class="sugerencias"><p class="resumen">Probá con:</p>' + sugerencias + "</div>"
    );
    var q = $("#q"), tm = null;
    q.addEventListener("input", function () { clearTimeout(tm); tm = setTimeout(function () { ultimaBusqueda = q.value; pintarResultados(); }, 120); });
    document.querySelectorAll("[data-tb]").forEach(function (b) {
      b.addEventListener("click", function () {
        filtroTipoBusqueda = b.getAttribute("data-tb");
        document.querySelectorAll("[data-tb]").forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); });
        pintarResultados();
      });
    });
    document.querySelectorAll("[data-sug]").forEach(function (b) {
      b.addEventListener("click", function () { q.value = ultimaBusqueda = b.getAttribute("data-sug"); pintarResultados(); });
    });
    $("#solo-local").addEventListener("change", function (e) { soloLocal = e.target.checked; pintarResultados(); });
    pintarResultados();
  }
  function pintarResultados() {
    var cont = $("#resultados");
    if (!cont) return;
    var palabras = normalizar(ultimaBusqueda).split(/\s+/).filter(Boolean);
    if (!palabras.length) {
      cont.innerHTML = '<p class="vacio">Escribí una o más palabras. Hay ' + contenido.temas.length + " temas, " + datos.fuentes.length + " fuentes y " + datos.observaciones.length + " notas tuyas.</p>";
      return;
    }
    var ver = filtroTipoBusqueda;
    var t = ver === "todo" || ver === "temas" ? contenido.temas.filter(function (r) {
      return temaEnRubro(r, rubroActivo) && (!soloLocal || r.evidencia_local !== "sin") && coincide(r, palabras);
    }) : [];
    var f = ver === "todo" || ver === "fuentes" ? datos.fuentes.filter(function (r) {
      return fuenteEnRubro(r, rubroActivo) && (!soloLocal || r.aplicabilidad === "local") && coincide(r, palabras);
    }) : [];
    var a = ver === "todo" || ver === "fuentes" ? datos.afirmaciones.filter(function (r) { return coincide(r, palabras); }) : [];
    var o = ver === "todo" || ver === "notas" ? datos.observaciones.filter(function (r) { return obsEnRubro(r, rubroActivo) && coincide(r, palabras); }) : [];
    if (!t.length && !f.length && !a.length && !o.length) {
      cont.innerHTML = '<p class="vacio">Sin resultados en lo guardado. Que no esté acá no significa que no exista: falta buscarlo y registrarlo.' + (soloLocal ? " Probá quitar el filtro de evidencia local." : "") + "</p>";
      return;
    }
    var html = "";
    if (t.length) html += '<p class="grupo-titulo">Temas (' + t.length + ")</p><ul class=\"lista\">" + t.map(tarjetaTema).join("") + "</ul>";
    if (f.length) html += '<p class="grupo-titulo">Fuentes (' + f.length + ")</p>" + listaFuentes(f);
    if (a.length) html += '<p class="grupo-titulo">Afirmaciones (' + a.length + ")</p>" + listaAfirmaciones(a);
    if (o.length) html += '<p class="grupo-titulo">Mis notas (' + o.length + ")</p>" + listaObservaciones(o);
    cont.innerHTML = html;
  }

  // ---------------------------------------------------------------- Más
  function vistaMas() {
    vista(
      "<h2>Más</h2>" +
      '<ul class="lista">' +
        '<li><a class="item" href="#/fuentes"><span class="item-titulo">Fuentes</span><span class="item-extra">' + datos.fuentes.length + " fichas con su estado de verificación, licencia y límites</span></a></li>" +
        '<li><a class="item" href="#/respaldo"><span class="item-titulo">Respaldo</span><span class="item-extra">Exportar o importar tus datos</span></a></li>' +
        contenido.herramientas.map(function (h) { return '<li><a class="item" href="#/herramienta/' + encodeURIComponent(h.id) + '"><span class="item-titulo">' + esc(h.titulo) + '</span><span class="item-extra">Herramienta</span></a></li>'; }).join("") +
        contenido.listas.map(function (l) { return '<li><a class="item" href="#/lista/' + encodeURIComponent(l.id) + '"><span class="item-titulo">' + esc(l.titulo) + '</span><span class="item-extra">Lista de verificación</span></a></li>'; }).join("") +
        '<li><a class="item" href="#/acerca"><span class="item-titulo">Cómo funciona</span><span class="item-extra">Qué usa internet, qué se guarda y dónde</span></a></li>' +
      "</ul>"
    );
  }
  function vistaAcerca() {
    vista(
      "<h2>Cómo funciona</h2>" +
      "<h3>Sin internet funciona</h3><ul>" +
        "<li>Abrir la app desde el ícono, después de haberla abierto una vez con conexión.</li>" +
        "<li>Consultar temas, fuentes, listas y calculadoras.</li>" +
        "<li>Guardar notas y observaciones con fotos.</li>" +
        "<li>Exportar e importar respaldos.</li></ul>" +
      "<h3>Necesita internet</h3><ul>" +
        "<li>Abrir los enlaces a los documentos originales.</li>" +
        "<li>Recibir versiones nuevas de la app y de los datos.</li>" +
        "<li>Confirmar que una norma sigue vigente.</li></ul>" +
      "<h3>Qué se guarda y dónde</h3>" +
      "<p>Tus notas, observaciones, fotos y fuentes propias se guardan solo en este dispositivo, dentro del navegador. La app no tiene cuentas, servidor ni rastreadores, y no envía fotos, ubicación ni notas a ningún lado.</p>" +
      "<p>iOS puede borrar los datos de una web si el teléfono se queda sin espacio, si borrás los datos de Safari o si eliminás el ícono. No hay garantía de que se conserven para siempre: exportá un respaldo después de cada salida a campo y guardalo fuera del teléfono.</p>" +
      "<h3>Cómo leer las fichas</h3><ul>" +
        Object.keys(CLASES).map(function (c) { return "<li>" + badgeClase(c) + " " + esc(CLASES[c].largo) + "</li>"; }).join("") +
        "<li>" + badgeFuente("verificada") + " se abrió y leyó el documento.</li>" +
        "<li>" + badgeFuente("metadatos") + " solo se vio el catálogo o un resumen.</li>" +
        "<li>" + badgeFuente("pendiente") + " no se pudo abrir.</li></ul>" +
      "<p>Las ilustraciones son esquemas propios, rotulados como tales: no son evidencia. La app no incluye fotos de terceros porque no se pudo confirmar su licencia.</p>" +
      '<p class="resumen">Versión de la app ' + APP_VERSION + " · datos iniciales v" + esc(contenido.version || "?") + ".</p>"
    );
  }

  // ---------------------------------------------------------------- Fuentes
  var filtroConjunto = "todos", filtroEstado = "todos";
  function listaFuentes(lista) {
    return '<ul class="lista">' + lista.map(function (f) {
      return '<li><a class="item" href="#/fuente/' + encodeURIComponent(f.id) + '">' +
        '<span class="item-id">' + esc(f.id) + (f.alias ? " · " + esc(f.alias) : "") + "</span>" +
        '<span class="item-titulo">' + esc(f.titulo) + "</span>" +
        '<span class="item-extra">' + badgeFuente(f.estado, true) + (f.clase ? badgeClase(f.clase) : "") + (f.aplicabilidad && f.aplicabilidad !== "sin-clasificar" ? '<span class="evidencia">' + esc(APLICABILIDAD[f.aplicabilidad]) + "</span>" : "") + "</span>" +
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
      '<p class="miga"><a href="#/mas">Más</a></p><h2>Fuentes</h2>' +
      '<div class="botonera"><a class="boton" href="#/fuente-nueva">Nueva fuente</a></div>' +
      selectorRubro(pintarFuentes) +
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
    if (!$("#lista-fuentes")) return;
    var base = datos.fuentes.filter(function (f) { return (filtroConjunto === "todos" || f.conjunto === filtroConjunto) && fuenteEnRubro(f, rubroActivo); });
    var lista = base.filter(function (f) { return filtroEstado === "todos" || f.estado === filtroEstado; }).sort(ordenFuentes);
    var c = { verificada: 0, metadatos: 0, pendiente: 0, "sin-clasificar": 0 };
    base.forEach(function (f) { c[f.estado] = (c[f.estado] || 0) + 1; });
    var txt = base.length + " fuentes: " + c.verificada + " verificadas · " + c.metadatos + " solo metadatos · " + c.pendiente + " pendientes";
    if (c["sin-clasificar"]) txt += " · " + c["sin-clasificar"] + " sin clasificar";
    if (rubroActivo !== "todos") txt += ". Incluye las transversales (normas, economía, clima).";
    if (filtroConjunto === "todos") txt += " Los conjuntos se solapan (una candidata N puede tener su ficha F); el conteo oficial del inventario sigue siendo 26.";
    $("#conteo").textContent = txt;
    $("#lista-fuentes").innerHTML = lista.length ? listaFuentes(lista) : '<p class="vacio">No hay fuentes con esos filtros.</p>';
  }

  function filaDato(titulo, valor, conEnlaces) {
    if (valor == null || valor === "" || (Array.isArray(valor) && !valor.length)) return "";
    return "<dt>" + esc(titulo) + "</dt><dd>" + (conEnlaces ? textoConEnlaces(valor) : esc(valor)) + "</dd>";
  }
  function tablaLecturas(f) {
    if (!f.lecturas || !f.lecturas.length) return "";
    var filas = f.lecturas.map(function (l) {
      var noAbierto = /^no abierto/i.test(l.alcance || "");
      return "<tr><th>" + (urlSegura(l.url) ? enlaceExterno(l.url, l.documento) : esc(l.documento)) + "</th>" +
        "<td><strong" + (noAbierto ? ' class="error"' : "") + ">" + esc(l.alcance) + "</strong><br>" + esc(l.respalda) + "</td></tr>";
    }).join("");
    return "<h3>Qué se leyó en cada documento</h3>" +
      '<div class="tabla-scroll"><table class="tabla-original tabla-lecturas"><thead><tr><th>Documento</th><td><strong>Alcance de la lectura · qué respalda</strong></td></tr></thead><tbody>' + filas + "</tbody></table></div>";
  }

  function vistaFuente(id) {
    var f = porId(datos.fuentes, id);
    if (!f) { vista('<h2>No encontrada</h2><p>No hay ninguna fuente con el ID ' + esc(id) + '.</p><a href="#/fuentes">Volver</a>'); return; }
    var usoLimitado = (f.areas || []).some(function (a) { return a === "SAN" || a === "FIT"; });
    var afs = datos.afirmaciones.filter(function (a) { return (a.fuente_ids || []).indexOf(f.id) !== -1; });
    var obs = datos.observaciones.filter(function (o) { return normalizar(o.fuentes_relacionadas).indexOf(normalizar(f.id)) !== -1; });
    var temas = contenido.temas.filter(function (t) { return (t.puntos || []).some(function (p) { return p.fuentes.indexOf(f.id) !== -1; }); });
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
    var puntos = (f.puntos || []).length ? '<h3>Qué afirma</h3><ul class="puntos">' + f.puntos.map(function (x) { return '<li class="punto">' + (f.clase ? badgeClase(f.clase) : "") + "<p>" + esc(x) + "</p></li>"; }).join("") + "</ul>" : "";
    vista(
      '<p class="miga"><a href="#/fuentes">Fuentes</a> · ' + esc(f.id) + (f.alias ? " · " + esc(f.alias) : "") + " · v" + esc(f.version || 1) + "</p>" +
      "<h2>" + esc(f.titulo) + "</h2>" +
      '<p class="etiquetas">' + badgeFuente(f.estado) + (f.clase ? badgeClase(f.clase) : "") + "</p>" +
      '<p class="resumen">' + esc((ESTADOS_FUENTE[f.estado] || ESTADOS_FUENTE["sin-clasificar"]).ayuda) + "</p>" +
      (f.estado_nota ? '<div class="caja limite"><strong>Alcance de la verificación:</strong> ' + esc(f.estado_nota) + "</div>" : "") +
      tablaLecturas(f) +
      (usoLimitado ? '<div class="caja limite">Uso limitado: solo para estudiar y preparar preguntas. Ante un caso real, veterinario, ingeniero agrónomo o SENASA. No da diagnósticos, productos ni dosis.</div>' : "") +
      (f.marca_uso ? '<div class="caja"><strong>Marca de uso:</strong> ' + esc(f.marca_uso) + "</div>" : "") +
      '<div class="botonera">' +
        (urlSegura(f.enlace) ? '<a class="boton" href="' + esc(f.enlace) + '" target="_blank" rel="noopener noreferrer">Abrir el documento</a>' : "") +
        '<a class="boton secundario" href="#/fuente-editar/' + encodeURIComponent(f.id) + '">Editar</a>' +
        '<a class="boton secundario" href="#/afirmacion-nueva?fuente=' + encodeURIComponent(f.id) + '">Agregar afirmación</a>' +
      "</div>" +
      puntos +
      '<div class="ficha"><dl>' +
        filaDato("Autoría o institución", f.autoria) +
        filaDato("Tipo y fecha", [f.tipo, f.fecha_publicacion].filter(Boolean).join(" · ")) +
        filaDato("Enlace", f.enlace) +
        (extra ? "<dt>Otros enlaces</dt><dd><ul>" + extra + "</ul></dd>" : "") +
        filaDato("Fecha de consulta", f.fecha_consulta) +
        filaDato("Región, periodo y sistema", f.region) +
        filaDato("Aplicabilidad local", (APLICABILIDAD[f.aplicabilidad] || f.aplicabilidad) + (f.aplicabilidad_texto && f.aplicabilidad_texto !== f.region ? " · " + f.aplicabilidad_texto : "")) +
        filaDato("Jurisdicción", f.jurisdiccion) +
        filaDato("Áreas", (f.areas || []).map(function (a) { return AREAS[a] || a; }).join(", ")) +
        filaDato("Qué se revisó", f.que_se_reviso) +
        (f.puntos ? "" : filaDato("Qué respalda", f.respalda)) +
        filaDato("Qué aporta o utilidad", f.aporta) +
        filaDato("Límites y qué confirmar", f.limites) +
        filaDato("No permite concluir", f.no_permite_concluir) +
        filaDato("Licencia", f.licencia) +
        filaDato("Copia sin conexión", COPIA_OFFLINE[f.copia_offline] || f.copia_offline) +
        filaDato("Revisar", f.revisar) +
        filaDato("Relación (texto de la ficha)", f.relacion_texto) +
      "</dl></div>" +
      (temas.length ? '<h3>Temas que la citan</h3><ul class="lista">' + temas.map(tarjetaTema).join("") + "</ul>" : "") +
      (rels ? "<h3>Relaciones</h3><ul>" + rels + "</ul>" : "") +
      "<h3>Afirmaciones que cita (" + afs.length + ")</h3>" + (afs.length ? listaAfirmaciones(afs) : '<p class="vacio">Ninguna todavía.</p>') +
      (obs.length ? "<h3>Mis notas relacionadas</h3>" + listaObservaciones(obs) : "") +
      (original ? '<details><summary>Ficha original importada (no se modifica)</summary><div class="tabla-scroll"><table class="tabla-original">' + original + "</table></div></details>" : "") +
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
    ["areas", "Áreas (códigos separados por coma)", { ayuda: Object.keys(AREAS).map(function (k) { return k + " = " + AREAS[k]; }).join(" · ") }],
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
    Object.keys(ESTADOS_FUENTE).forEach(function (k) { if (k !== "sin-clasificar" || v.estado === k) estados[k] = ESTADOS_FUENTE[k].largo; });
    var clases = { "": "Sin indicar" };
    Object.keys(CLASES).forEach(function (k) { clases[k] = CLASES[k].largo; });
    var campos = CAMPOS_FUENTE.map(function (c) {
      var val = c[0] === "areas" ? (v.areas || []).join(", ") : v[c[0]];
      return campoTexto("f_" + c[0], c[1], val || "", c[2]);
    }).join("");
    vista(
      "<h2>" + (f ? "Editar " + esc(f.id) : "Nueva fuente") + "</h2>" +
      (f && f.origen_registro === "base-importada" ? '<div class="caja">Es un registro importado. Tu edición se suma al historial y sube la versión; las actualizaciones futuras de la app no pisan tus cambios.</div>' : "") +
      '<div class="caja">Una respuesta de IA no es una fuente. Cargá solo documentos que existen y que podés citar.</div>' +
      '<form id="form-fuente" novalidate>' +
        campoSelect("f_estado", "Estado de verificación", v.estado, estados, { obligatorio: true, ayuda: "Verificada: abriste el documento. Solo metadatos: viste el catálogo o una nota. Pendiente: no lo pudiste abrir." }) +
        campoSelect("f_clase", "Qué tipo de conocimiento es", v.clase || "", clases, { ayuda: "Norma, investigación, recomendación técnica, comunicación institucional o interpretación." }) +
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
      var clase = $("#f_clase").value;
      if (clase) nuevo.clase = clase; else delete nuevo.clase;
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
        var cambiados = ["estado", "clase", "aplicabilidad", "copia_offline"].concat(CAMPOS_FUENTE.map(function (c) { return c[0]; })).filter(function (k) {
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
        nuevo.historial = [{ fecha: fecha, accion: "Creada", detalle: "Estado inicial: " + ESTADOS_FUENTE[nuevo.estado].largo, por: por || "sin iniciales" }];
      }
      guardar("fuentes", nuevo).then(cargarTodo).then(function () { location.hash = "#/fuente/" + encodeURIComponent(nuevo.id); })
        .catch(function (err) { $("#f_error").textContent = "No se pudo guardar: " + err.message; });
    });
  }

  // ---------------------------------------------------------------- Afirmaciones
  function listaAfirmaciones(lista) {
    return '<ul class="lista">' + lista.map(function (a) {
      return '<li><a class="item" href="#/afirmacion/' + encodeURIComponent(a.id) + '">' +
        '<span class="item-id">' + esc(a.id) + " · " + esc(a.tipo) + "</span>" +
        '<span class="item-titulo">' + esc(a.texto) + "</span>" +
        '<span class="item-extra">' + esc(a.cita_exacta) + "</span></a></li>";
    }).join("") + "</ul>";
  }
  function vistaAfirmacion(id) {
    var a = porId(datos.afirmaciones, id);
    if (!a) { vista("<h2>No encontrada</h2>"); return; }
    var fuentes = (a.fuente_ids || []).map(function (fid) {
      var f = porId(datos.fuentes, fid);
      return "<li>" + (f ? '<a href="#/fuente/' + encodeURIComponent(fid) + '">' + esc(fid) + "</a> — " + esc(f.titulo) + " " + badgeFuente(f.estado, true) : esc(fid) + " (no está en la biblioteca)") + "</li>";
    }).join("");
    var hist = (a.historial || []).slice().reverse().map(function (h) { return "<li><strong>" + esc(h.fecha) + "</strong> · " + esc(h.accion) + " · " + esc(h.por) + "<br>" + esc(h.detalle) + "</li>"; }).join("");
    vista(
      '<p class="miga">' + esc(a.id) + " · " + esc(a.tipo) + "</p>" +
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
      '<p class="resumen">Fuente: ' + esc(f.id) + " — " + esc(f.titulo) + " " + badgeFuente(f.estado, true) + "</p>" +
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
        respaldo: "Fuente " + f.id + ": " + ESTADOS_FUENTE[f.estado].largo,
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

  // ---------------------------------------------------------------- Mis notas: observaciones de campo y notas de estudio
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
  var CAMPOS_ESTUDIO = [
    ["fecha", "Fecha", { tipo: "date", obligatorio: true }],
    ["titulo", "Título", { obligatorio: true, ayuda: "Ej.: Dudas para la clase de cría" }],
    ["observe", "Nota", { area: true, obligatorio: true, ayuda: "Lo que querés recordar, preguntar o comparar. Es tuyo: no se muestra como evidencia." }],
    ["fuentes_relacionadas", "Fuentes relacionadas (IDs)", { ayuda: "Ej.: F-20261031-05" }]
  ];
  function esEstudio(o) { return o.tipo === "estudio"; }

  function listaObservaciones(lista) {
    return '<ul class="lista">' + lista.map(function (o) {
      var t = o.tema_id ? porId(contenido.temas, o.tema_id) : null;
      return '<li><a class="item item-nota" href="#/observacion/' + encodeURIComponent(o.id) + '">' +
        '<span class="item-id"><span class="rotulo-nota">' + (esEstudio(o) ? "Nota de estudio" : "Observación de campo") + "</span> " + esc(fechaCorta(o.fecha)) + (o.lugar ? " · " + esc(o.lugar) : "") + "</span>" +
        '<span class="item-titulo">' + esc(o.titulo || String(o.observe || "").slice(0, 140)) + "</span>" +
        '<span class="item-extra">' + badgeObs(o.estado) + (t ? '<span class="evidencia">' + esc(t.titulo) + "</span>" : "") + ((o.foto_ids || []).length ? '<span class="evidencia">' + o.foto_ids.length + " foto" + (o.foto_ids.length > 1 ? "s" : "") + "</span>" : "") + "</span></a></li>";
    }).join("") + "</ul>";
  }
  function vistaCampo() {
    var lista = datos.observaciones.slice().sort(function (a, b) { return b.id.localeCompare(a.id, "es", { numeric: true }); });
    vista(
      "<h2>Mis notas</h2>" +
      '<div class="caja caja-nota">Lo que guardás acá es tuyo y queda solo en este dispositivo. Se muestra siempre separado del conocimiento documentado y nunca como evidencia publicada.</div>' +
      '<div class="botonera"><a class="boton" href="#/observacion-nueva?tipo=campo">Observación de campo</a><a class="boton secundario" href="#/observacion-nueva?tipo=estudio">Nota de estudio</a></div>' +
      (lista.length ? listaObservaciones(lista) : '<p class="vacio">Todavía no hay notas. Funciona sin conexión.</p>')
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
    var t = o.tema_id ? porId(contenido.temas, o.tema_id) : null;
    var hist = (o.historial || []).slice().reverse().map(function (h) { return "<li><strong>" + esc(h.fecha) + "</strong> · " + esc(h.accion) + " · " + esc(h.por) + "<br>" + esc(h.detalle) + "</li>"; }).join("");
    var opcionesEstado = {};
    Object.keys(ESTADOS_OBS).forEach(function (k) { opcionesEstado[k] = ESTADOS_OBS[k].txt; });
    var campos = esEstudio(o) ? CAMPOS_ESTUDIO : CAMPOS_OBS.concat(CAMPOS_OBS_OPC);
    vista(
      '<p class="miga"><a href="#/campo">Mis notas</a> · ' + esc(o.id) + " · v" + esc(o.version || 1) + "</p>" +
      '<p class="rotulo-nota rotulo-grande">' + (esEstudio(o) ? "Nota de estudio (personal)" : "Observación de campo (personal)") + "</p>" +
      "<h2>" + esc(o.titulo || "Observación del " + fechaCorta(o.fecha)) + "</h2>" +
      "<p>" + badgeObs(o.estado) + "</p>" +
      '<p class="resumen">' + esc((ESTADOS_OBS[o.estado] || ESTADOS_OBS.pendiente).ayuda) + "</p>" +
      (t ? '<p>Tema: <a href="#/tema/' + encodeURIComponent(t.id) + '">' + esc(t.titulo) + "</a></p>" : "") +
      '<div class="botonera"><a class="boton secundario" href="#/observacion-editar/' + encodeURIComponent(o.id) + '">Corregir o agregar fotos</a></div>' +
      '<div id="fotos-obs" class="fotos"></div>' +
      '<div class="ficha ficha-nota"><dl>' +
        campos.map(function (c) { return filaDato(c[1], o[c[0]]); }).join("") +
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
      '<p class="resumen">Las notas no se borran: una descartada sirve para no repetir el error.</p>'
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
  function letraFoto(n) {
    var s = "";
    n += 1;
    while (n > 0) { var r = (n - 1) % 26; s = String.fromCharCode(97 + r) + s; n = Math.floor((n - 1) / 26); }
    return s;
  }

  function vistaFormObservacion(id, params) {
    var o = id ? porId(datos.observaciones, id) : null;
    if (id && !o) { vista("<h2>No encontrada</h2>"); return; }
    var tipo = o ? (o.tipo || "campo") : (params && params.tipo === "estudio" ? "estudio" : "campo");
    var v = o || { fecha: hoyISO(), tema_id: (params && params.tema) || "" };
    var obligatorios = tipo === "estudio" ? CAMPOS_ESTUDIO : CAMPOS_OBS;
    var temasOpc = { "": "Sin tema" };
    contenido.temas.forEach(function (t) { temasOpc[t.id] = t.titulo; });
    vista(
      '<p class="miga"><a href="#/campo">Mis notas</a></p>' +
      "<h2>" + (o ? "Corregir " + esc(o.id) : (tipo === "estudio" ? "Nueva nota de estudio" : "Nueva observación de campo")) + "</h2>" +
      (tipo === "campo" ? '<p class="resumen">Separá el hecho de tu interpretación. No anotes medicamentos, dosis ni productos recomendados; si se usó un producto, anotalo como hecho (qué y quién lo indicó).</p>' : '<p class="resumen">Una nota de estudio es tuya: se guarda separada de las fichas y no se muestra como evidencia.</p>') +
      '<form id="form-obs" novalidate>' +
        obligatorios.map(function (c) { return campoTexto("o_" + c[0], c[1], v[c[0]] || "", c[2]); }).join("") +
        campoSelect("o_tema", "Tema relacionado", v.tema_id || "", temasOpc, { ayuda: "Así la nota aparece dentro del tema." }) +
        '<div class="campo"><label for="o_fotos">Fotos</label><p class="ayuda">Podés sacar una foto o elegirla de la galería. Se guarda una copia reducida en la app; la ubicación GPS de la foto se elimina. Evitá personas, patentes y caravanas legibles.</p>' +
        '<input id="o_fotos" type="file" accept="image/*" multiple></div>' +
        '<div id="o_fotos_previa" class="fotos"></div>' +
        (tipo === "campo" ? '<details><summary>Más campos (opcionales)</summary><div>' + CAMPOS_OBS_OPC.map(function (c) { return campoTexto("o_" + c[0], c[1], v[c[0]] || "", c[2]); }).join("") + "</div></details>" : "") +
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
      var todosCampos = tipo === "estudio" ? CAMPOS_ESTUDIO : CAMPOS_OBS.concat(CAMPOS_OBS_OPC);
      todosCampos.forEach(function (c) { var el = $("#o_" + c[0]); if (el) nuevo[c[0]] = el.value.trim(); });
      nuevo.tipo = tipo;
      nuevo.tema_id = $("#o_tema").value;
      nuevo.responsable = $("#o_responsable").value.trim();
      var faltan = obligatorios.filter(function (c) { return c[2].obligatorio && !nuevo[c[0]]; }).map(function (c) { return c[1]; });
      if (!nuevo.responsable) faltan.push("Responsable");
      var motivo = o ? $("#o_motivo_corr").value.trim() : "";
      if (o && !motivo) faltan.push("Qué corregiste y por qué");
      if (faltan.length) { $("#o_error").textContent = "Falta completar: " + faltan.join(", ") + "." + (tipo === "campo" ? " Si no sabés, escribí ND (no disponible) o PEND + fecha." : ""); return; }
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
    var propias = datos.fuentes.filter(function (f) { return f.origen_registro === "usuario"; }).length;
    var editadas = datos.fuentes.filter(function (f) { return f.origen_registro === "base-importada" && (f.version || 1) > 1; }).length;
    var html =
      '<div class="grilla grilla-2">' +
        '<div class="tarjeta tarjeta-nota"><span class="tarjeta-titulo">Lo tuyo</span><span class="tarjeta-num">' + datos.observaciones.length + " notas · " + nFotos + " fotos · " + propias + " fuentes propias · " + editadas + " fichas editadas</span></div>" +
        '<div class="tarjeta"><span class="tarjeta-titulo">Último respaldo</span><span class="tarjeta-num">' + (ult ? esc(fechaCorta(ult.fecha)) + " " + esc(ult.fecha.slice(11, 16)) : "<strong>Nunca</strong>") + "</span></div>" +
      "</div><ul>" +
      "<li>En total: " + datos.fuentes.length + " fuentes, " + datos.afirmaciones.length + " afirmaciones y " + contenido.temas.length + " temas.</li>" +
      (sem ? "<li>Datos iniciales versión " + esc(sem.version || 1) + ", cargados el " + esc(fechaCorta(sem.fecha)) + "." +
        (sem.nuevas ? " Se agregaron " + esc(sem.nuevas) + " registros." : "") +
        (sem.actualizadas && sem.actualizadas.length ? " Actualizados porque no los habías editado: " + esc(sem.actualizadas.join(", ")) + "." : "") +
        (sem.conservadas && sem.conservadas.length ? " Conservados con tus ediciones: " + esc(sem.conservadas.join(", ")) + "." : "") +
        "</li>" : "") +
      "<li>Versión de la app: " + APP_VERSION + ".</li></ul>";
    c.innerHTML = html;
    if (navigator.storage && navigator.storage.estimate) {
      navigator.storage.estimate().then(function (e) {
        var li = document.createElement("li");
        li.textContent = "Espacio usado: " + (e.usage / 1048576).toFixed(1) + " MB de " + (e.quota / 1048576).toFixed(0) + " MB disponibles para la app.";
        var ul = c.querySelector("ul"); if (ul) ul.appendChild(li);
      });
    }
    if (navigator.storage && navigator.storage.persisted) {
      navigator.storage.persisted().then(function (p) {
        var el = $("#r_persistente");
        if (el) el.textContent = p ? "Almacenamiento persistente: concedido. Igual puede perderse si borrás la app o los datos de Safari: seguí haciendo respaldos." : "Almacenamiento persistente: no concedido. Los datos pueden borrarse si el teléfono se queda sin espacio: hacé respaldos.";
      });
    }
  }
  function vistaRespaldo() {
    vista(
      '<p class="miga"><a href="#/mas">Más</a></p><h2>Respaldo</h2>' +
      '<div class="caja limite">Tus datos viven solo en este dispositivo. iOS no garantiza conservarlos para siempre: se pueden perder si borrás el ícono, borrás los datos de Safari o el teléfono se queda sin espacio. <strong>Exportá un respaldo después de cada salida a campo</strong> y antes de actualizar o cambiar de teléfono.</div>' +
      '<div id="r_info"></div>' +
      '<p id="r_persistente" class="resumen"></p>' +
      "<h3>1. Exportar</h3>" +
      '<div class="botonera">' +
        '<button type="button" class="boton" id="r_compartir">Exportar respaldo</button>' +
        '<button type="button" class="boton secundario" id="r_descargar">Descargar archivo</button>' +
      "</div>" +
      '<p class="resumen">En el iPhone, "Exportar" abre Compartir: elegí <strong>Guardar en Archivos</strong>. "Descargar" guarda el archivo directo (en la PC, en Descargas). El archivo incluye tus notas, fotos, fuentes y afirmaciones con sus IDs, historial y procedencia. Los temas no hace falta respaldarlos: vienen con la app.</p>' +
      "<h3>2. Importar en otro dispositivo</h3>" +
      '<p class="resumen">Elegí un archivo de respaldo. Agrega lo que falta y no reemplaza nada; si un ID ya existe con otro contenido, te avisa y no lo toca.</p>' +
      '<label class="boton secundario boton-archivo" for="r_archivo">Elegir archivo de respaldo</label><input id="r_archivo" class="oculto-archivo" type="file" accept="application/json,.json">' +
      '<p id="r_estado" role="status"></p>' +
      "<h3>Almacenamiento</h3>" +
      '<div class="botonera"><button type="button" class="boton secundario" id="r_persistir">Pedir almacenamiento persistente</button></div>' +
      '<p class="resumen">En el iPhone conviene usar la app desde el ícono de la pantalla de inicio: así es más probable que el sistema conceda el almacenamiento persistente.</p>'
    );
    pintarEstadoRespaldo();
    prepararRespaldo();
    $("#r_compartir").addEventListener("click", function () { exportar("compartir"); });
    $("#r_descargar").addEventListener("click", function () { exportar("descargar"); });
    $("#r_archivo").addEventListener("change", function (e) {
      var archivo = e.target.files[0];
      if (!archivo) return;
      importar(archivo).then(function () { e.target.value = ""; });
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
  window.__biblioteca = { version: APP_VERSION, datos: datos, contenido: contenido }; // para pruebas
  iniciar();
})();
