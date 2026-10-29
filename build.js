#!/usr/bin/env node
// Generador del sitio. Es un orquestador: lee data/, aplica las plantillas de
// templates/ y escribe dist/. No sabe cómo se ve un partido ni cómo se calcula
// el estado de un equipo: eso vive en lib/ y lo comparte con el navegador.
//
// Para agregar una página nueva: una función generarX() que llame a
// escribirPagina() y una línea más en main().

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

import { leerJSON, leerTexto, escribirArchivo, existe } from "./lib/utils.js";
import { escapeHtml, slugify, formatFecha, partesFecha } from "./lib/texto.js";
import { assemble, parsearPlantilla } from "./lib/layout.js";
import { assetsRoot, slugEdicion, rutaPaginaEdicion, urlEdicionHermana, rutaAsset } from "./lib/rutas.js";
import { tarjetaPartido, badge } from "./lib/render.js";
import * as data from "./lib/data.js";

const RAIZ = import.meta.dirname;
const DIST = path.join(RAIZ, "dist");
const DIR_DATA = path.join(RAIZ, "data");
const DIR_TORNEOS = path.join(DIR_DATA, "torneos");
const DIR_TEMPLATES = path.join(RAIZ, "templates");
const DIR_ASSETS = path.join(RAIZ, "assets");

// Módulos de lib/ que son puros (sin node:fs). Se copian a dist/assets/js/lib/
// para que el navegador importe exactamente el mismo código que usa el build.
// Para agregar un módulo compartido: agregarlo acá y a MODULOS_PUROS de lib/.
const MODULOS_COMPARTIDOS = ["data.js", "render.js", "rutas.js", "texto.js", "torneo-modelo.js"];

// --- Datos (se leen una vez por build) ---

const cache = {};
const sitio = () => (cache.sitio ??= leerJSON(path.join(DIR_DATA, "sitio.json")));

const torneos = () =>
  (cache.torneos ??= fs
    .readdirSync(DIR_TORNEOS)
    .filter((f) => f.endsWith(".json"))
    .map((f) => leerJSON(path.join(DIR_TORNEOS, f)))
    .sort((a, b) =>
      a.categoria === b.categoria
        ? b.edicion.localeCompare(a.edicion)
        : a.categoria.localeCompare(b.categoria)));

const noticias = () =>
  (cache.noticias ??= [...leerJSON(path.join(DIR_DATA, "noticias.json"))]
    .sort((a, b) => b.fecha.localeCompare(a.fecha)));

// Portada por defecto de las noticias que todavía no tienen foto propia: la
// foto del trofeo (ver tools/preparar-trofeo.py). Es preferible a un recuadro
// gris: el torneo es lo que da sentido al sitio y la copa es el premio, así que
// una nota sin foto igual muestra algo del club.
const PORTADA_POR_DEFECTO = "assets/img/trofeo.jpg";

// --- Salida ---

function escribirPagina(rutaRel, titulo, navActiva, contenido) {
  const html = assemble({
    titulo,
    contenido,
    navActiva,
    anio: new Date().getFullYear(),
    assetsRoot: assetsRoot(rutaRel),
    redes: sitio().redes,
  });
  escribirArchivo(path.join(DIST, rutaRel), html);
}

function plantilla(nombre) {
  return parsearPlantilla(leerTexto(path.join(DIR_TEMPLATES, nombre)));
}

// Cantidad de niveles desde la raíz del sitio hasta una página concreta.
function profundidad(rutaPagina) {
  return rutaPagina.split("/").length - 1;
}

// Reemplaza un placeholder. Falla fuerte si no estaba: es mejor romper el build
// que publicar una página con un <!-- NOTICIA --> sin reemplazar.
function rellenar(contenido, reemplazos) {
  let out = contenido;
  for (const [marcador, valor] of Object.entries(reemplazos)) {
    if (!out.includes(marcador)) throw new Error(`Falta el marcador ${marcador} en la plantilla`);
    out = out.split(marcador).join(valor);
  }
  return out;
}

function prepararDist() {
  fs.rmSync(DIST, { recursive: true, force: true });
  fs.mkdirSync(DIST, { recursive: true });

  fs.cpSync(DIR_ASSETS, path.join(DIST, "assets"), { recursive: true });
  fs.cpSync(DIR_DATA, path.join(DIST, "data"), { recursive: true });

  const destinoLib = path.join(DIST, "assets", "js", "lib");
  for (const modulo of MODULOS_COMPARTIDOS) {
    const origen = path.join(RAIZ, "lib", modulo);
    if (!existe(origen)) throw new Error(`Falta el módulo compartido lib/${modulo}`);
    escribirArchivo(path.join(destinoLib, modulo), leerTexto(origen));
  }

  escribirArchivo(path.join(DIST, ".nojekyll"), "");
}

// --- Páginas ---

// Páginas escritas a mano en templates/ (HTML fijo). Instalaciones muestra la
// dirección de data/sitio.json (igual que contacto): el dato vive en un solo
// lugar y no se hardcodea.
function generarManuscritas() {
  for (const nombre of ["instalaciones.html", "404.html"]) {
    const { titulo, navActiva, contenido } = plantilla(nombre);
    const html = nombre === "instalaciones.html"
      ? rellenar(contenido, {
          "<!-- KICKER -->": escapeHtml(sitio().ciudad),
          "<!-- DIRECCION -->": escapeHtml(sitio().contacto.direccion),
        })
      : contenido;
    escribirPagina(nombre, titulo, navActiva, html);
  }
}

// La página de contacto se arma desde data/sitio.json (igual que las redes):
// así los datos viven en un solo lugar y no se hardcodean en la plantilla.
function generarContacto() {
  const c = sitio().contacto;
  const { titulo, navActiva, contenido } = plantilla("contacto.html");
  escribirPagina("contacto.html", titulo, navActiva, rellenar(contenido, {
    "<!-- KICKER -->": "Lunes a viernes",
    "<!-- CONTACTO -->": `<ul class="contact-list" data-reveal>
      <li>Email: ${escapeHtml(c.email)}</li>
      <li>Teléfono: ${escapeHtml(c.telefono)}</li>
      <li>Dirección: ${escapeHtml(c.direccion)}</li>
    </ul>`,
  }));
}

// Una página por archivo de data/torneos/. Es un shell: el navegador carga su
// JSON y arma el cuadro, el fixture, los equipos y los goleadores.
function generarEdiciones() {
  const lista = torneos();
  for (const torneo of lista) {
    const rutaRel = rutaPaginaEdicion(torneo);
    const titulo = `${torneo.nombre} · Edición ${torneo.edicion}`;
    const contenido = rellenar(plantilla("torneo-edicion.html").contenido, {
      "<!-- TITULO_EDICION -->": `${escapeHtml(torneo.nombre)} · Edición <b class="ed-num">${escapeHtml(torneo.edicion)}</b>`,
      "<!-- INDICE_EDICIONES -->": selectorEdiciones(torneo, lista),
      "<!-- DATA_URL -->": `${assetsRoot(rutaRel)}data/torneos/${torneo.id}.json`,
    });
    escribirPagina(rutaRel, `${titulo} | Club Atlético Gualeguay`, "torneos", contenido);
  }
  return lista.length;
}

function selectorEdiciones(activo, lista) {
  return data.edicionesDe(lista, activo.categoria)
    .map((t) => {
      const on = t.id === activo.id;
      const href = on ? "index.html" : urlEdicionHermana(t);
      const vigente = t.estado === "vigente" ? " · vigente" : "";
      return `<a class="tab${on ? " on" : ""}" href="${href}"${on ? ' aria-current="page"' : ""}>` +
        `Edición <b class="ed-num ed-num--sm">${escapeHtml(t.edicion)}</b>${vigente}</a>`;
    })
    .join("");
}

// Índice de torneos. Itera las categorías que existan en los datos: agregar una
// categoría nueva es crear su JSON, no tocar este archivo.
function generarTorneosIndex() {
  const grupos = data.categorias(torneos());
  const botones = Object.entries(grupos)
    .flatMap(([categoria, lista]) => lista.map((t) => botonEdicion(categoria, lista, t)));
  const contenido = rellenar(plantilla("torneos-index.html").contenido, {
    "<!-- KICKER -->": kickerTemporada(),
    "<!-- CATEGORIAS -->": botones.length
      ? `<div class="torneos">${botones.join("\n")}</div>`
      : '<p class="nota-meta">Todavía no hay torneos cargados.</p>',
  });
  const { titulo, navActiva } = plantilla("torneos-index.html");
  escribirPagina("torneos/index.html", titulo, navActiva, contenido);
}

// Una edición del índice de torneos: un botón grande con la categoría y la
// edición. La pieza entera es un solo enlace (mismo criterio que la tarjeta de
// nota): el nombre de la categoría es el texto que anuncia el destino y la
// flecha va decorativa, para no repetir el enlace en el árbol de accesibilidad.
// Una categoría puede tener varias ediciones: cada una es su propio botón.
function botonEdicion(categoria, lista, t) {
  return `<a class="boton-torneo" href="${categoria}/${slugEdicion(t.edicion)}/index.html" data-reveal>
    <span class="bt-texto">
      <span class="bt-nombre">${escapeHtml(data.nombreCategoria(categoria, lista))}</span>
      <span class="bt-edicion">Edición <b class="bt-num">${escapeHtml(t.edicion)}</b></span>
    </span>
    ${t.estado === "vigente" ? badge("vigente", "vigente") : ""}
    <span class="bt-flecha" aria-hidden="true">&rarr;</span>
  </a>`;
}

// Noticias: el listado agrupado por año + una página por noticia.
function generarNoticias() {
  const rutaRel = "noticias/index.html";
  const { titulo, navActiva, contenido } = plantilla("noticias-index.html");
  escribirPagina(rutaRel, titulo, navActiva, rellenar(contenido, {
    "<!-- KICKER -->": kickerTemporada(),
    "<!-- LISTA_NOTICIAS -->": listaNoticias(profundidad(rutaRel)),
  }));

  const detalle = plantilla("noticia.html");
  for (const n of noticias()) {
    const slug = `${slugify(n.titulo)}-${n.id}`;
    escribirPagina(`noticias/${slug}.html`, `${n.titulo} | Club Atlético Gualeguay`, "noticias",
      rellenar(detalle.contenido, {
        "<!-- NOTICIA_TITULO -->": escapeHtml(n.titulo),
        "<!-- NOTICIA_META -->": `${fechaCartel(n.fecha)} ${badge(n.categoria)}`,
        "<!-- NOTICIA_IMAGEN -->": imagenNota(n, 1, { alt: n.titulo, lazy: false }),
        "<!-- NOTICIA_CONTENIDO -->": cuerpoNoticia(n),
      }));
  }
  return noticias().length;
}

// La imagen del detalle de la nota. Si la nota no tiene foto propia, va la
// portada por defecto (el trofeo) y el alt queda vacío: no es una foto de la
// noticia, es un relleno decorativo, así que no tiene nada que anunciarle a un
// lector de pantalla. Con foto real, el alt es el título. Las tarjetas usan
// tarjetaNota (más abajo), que arma la imagen distinto.
function imagenNota(n, profundidad, { alt = "", lazy = true } = {}) {
  const propia = Boolean(n.imagen);
  const src = rutaAsset(propia ? n.imagen : PORTADA_POR_DEFECTO, profundidad);
  const clase = propia ? "nota-img" : "nota-img nota-img--sin-foto";
  return `<img class="${clase}" src="${src}" alt="${propia ? escapeHtml(alt) : ""}"` +
    (lazy ? ` loading="lazy"` : "") + ">";
}

// Fecha "de cartel" de una noticia: el día en grande (tipo cartel, --font-numeros)
// y el mes y el año chicos apilados al lado. Reemplaza al string suelto "3 de
// octubre de 2026" en las tarjetas y en el detalle, para que la fecha sea una
// pieza, no una línea de texto.
function fechaCartel(iso) {
  const { dia, mes, anio } = partesFecha(iso);
  return `<span class="fecha-cartel"><b class="fc-dia">${dia}</b>` +
    `<span class="fc-resto"><span class="fc-mes">${escapeHtml(mes)}</span>` +
    `<span class="fc-anio">${anio}</span></span></span>`;
}

function esVertical(img) {
  try {
    const p = path.join(RAIZ, img);
    const buf = fs.readFileSync(p);
    // JPEG
    if (buf[0] === 0xFF && buf[1] === 0xD8) {
      let i = 2;
      while (i < buf.length) {
        if (buf[i] !== 0xFF) break;
        const type = buf[i + 1];
        i += 2;
        if (type === 0xD8 || type === 0xD9) continue;
        const len = (buf[i] << 8) | buf[i + 1];
        if (type >= 0xC0 && type <= 0xC3 && i + 7 < buf.length) {
          const h = (buf[i + 5] << 8) | buf[i + 6];
          const w = (buf[i + 7] << 8) | buf[i + 8];
          return h > w;
        }
        i += len;
      }
    }
    // PNG
    if (buf[0] === 0x89 && buf[1] === 0x50) {
      if (buf.length >= 24) {
        const w = (buf[16] << 24) | (buf[17] << 16) | (buf[18] << 8) | buf[19];
        const h = (buf[20] << 24) | (buf[21] << 16) | (buf[22] << 8) | buf[23];
        return h > w;
      }
    }
  } catch {}
  return false;
}

function tarjetaNota(n, profundidad, { prefijoHref = "", conBadge = false } = {}) {
  const href = `${prefijoHref}${slugify(n.titulo)}-${n.id}.html`;
  const meta = conBadge ? `${fechaCartel(n.fecha)} ${badge(n.categoria)}` : fechaCartel(n.fecha);
  const cuerpo = `<div class="tarjeta-nota-body">
        <h3><a href="${href}">${escapeHtml(n.titulo)}</a></h3>
        <p class="nota-meta">${meta}</p>
        <p>${escapeHtml(n.resumen)}</p>
      </div>`;
  const vertical = n.imagen ? esVertical(n.imagen) : false;
  const clase = n.imagen ? `tarjeta-nota${vertical ? " tarjeta-nota--vertical" : ""}` : "tarjeta-nota tarjeta-nota--sin-foto";
  const adentro = n.imagen
    ? `<div class="nota-media">
        <img class="nota-img" src="${rutaAsset(n.imagen, profundidad)}" alt="" loading="lazy">
      </div>
      ${cuerpo}`
    : `<div class="nota-placa">
        <img class="nota-placa-img" src="${rutaAsset(PORTADA_POR_DEFECTO, profundidad)}" alt="" loading="lazy">
        ${cuerpo}
      </div>`;
  return `<article class="${clase}" data-reveal>
      ${adentro}
    </article>`;
}

// Los párrafos de la nota están separados por líneas en blanco.
function cuerpoNoticia(n) {
  return escapeHtml(n.contenido)
    .split(/\n\s*\n/)
    .map((p) => `<p>${p}</p>`)
    .join("\n");
}

function listaNoticias(profundidadPagina) {
  if (!noticias().length) return '<p class="nota-meta">Todavía no hay noticias publicadas.</p>';
  return noticias()
    .map((n) => tarjetaNota(n, profundidadPagina, { conBadge: true }))
    .join("");
}

// Home: héroe + resumen del torneo vigente + últimas noticias.
function generarHome() {
  const { titulo, navActiva, contenido } = plantilla("index.html");
  escribirPagina("index.html", titulo, navActiva, rellenar(contenido, {
    "<!-- CONTENIDO_HOME -->": [hero(), homeVideo()].join("\n"),
  }));
}

// Las dos secciones de abajo (torneo y noticias) comparten un único video de
// fondo: un solo elemento <video> que cubre las dos. Meter un video por
// sección sería el mismo archivo descargado una vez pero decodificado dos
// veces, y al hacer scroll se verían las dos copias playing en paralelo. Con
// uno solo, además, el clip se recorre entero a medida que se baja.
function homeVideo() {
  return `
    <div class="seccion-video">
      ${fondoVideo("cancha-largo", "assets/img/video-cancha-vertical.jpg")}
      ${bloqueTorneo()}
      ${bloqueNoticias()}
    </div>`;
}

// El hero de la home, el afiche del club (aprobado): texto a la izquierda con el
// escudo, la foto vertical a la derecha y, entre ambos, un bisel inclinado
// seguido por la costura amarilla de 10 px — la firma del cartel. En el celu
// cambia de idea (aprobado): sin foto, y la banda diagonal amarilla cruza el
// hero entero como sello. Los dos anchos suman la cinta de datos y la flecha al
// pie que señala que abajo hay más (la flecha nació en el celu y ahora va
// también en compu, corrida sobre la cinta; ver layout.css). El sello de F7 va
// solo en compu: en el celu no entra sin apretar el escudo contra el título, y
// el dato ya está en el texto y en la cinta. El resto de las páginas conserva
// su hero centrado, ahora con fondo liso propio (ver .fondo-liso en layout.css).
// El protocolo es un <section class="hero
// hero-afiche">: el CSS de layout.css le da la forma de afiche en compu y la
// pila (banda diagonal) en el celu.
function hero() {
  const s = sitio();
  // El nombre en dos líneas, como la marca del header: "CLUB ATLÉTICO" /
  // "GUALEGUAY". Se parte por el último espacio real del dato.
  const palabras = s.nombre.trim().split(/\s+/);
  const ultima = palabras.pop();
  const primera = palabras.join(" ");
  // La cinta del pie y el sello F7 (aprobados: opciones 1 y 5 del mockup del
  // hueco). Los datos salen de sitio.json —dirección y edición reales— y la
  // regla del formato (doble eliminación) va escrita en palabras. Mayúsculas y
  // espaciado los pone el CSS.
  const edicion = s.edicionVigente.libres;
  const cinta = [
    "ganadores y perdedores",
    "doble eliminación",
    "fútbol 7 nocturno",
    "cancha bajo luz",
    s.contacto.direccion,
    `${s.ciudad} · ${edicion}`,
  ].join(" ★ ");
  return `
    <section class="hero hero-afiche">
      <div class="hero-cuerpo">
        <img class="hero-escudo" src="${rutaAsset("assets/img/escudo-club.png", 0)}" alt="" width="110" height="110">
        <h1>${escapeHtml(primera)}<br>${escapeHtml(ultima)}</h1>
        <p>${escapeHtml(s.ciudad)} — torneos de Fútbol 7.</p>
        <a class="btn" href="torneos/index.html">Ver torneos</a>
      </div>
      <div class="hero-velo" aria-hidden="true"></div>
      <div class="hero-costura" aria-hidden="true"></div>
      <div class="hero-foto" aria-hidden="true">
        <img src="${rutaAsset("assets/img/arcos.jpg", 0)}" alt="" width="1400" height="1866">
      </div>
      <div class="hero-scroll" aria-hidden="true"></div>
      <!-- La cinta repite el mismo texto dos veces: el translateX(-50%) del
           bucle vuelve al inicio exacto y no se nota la costura. -->
      <div class="hero-cinta" aria-hidden="true"><div class="hero-cinta-pista">
        <span>${escapeHtml(cinta)} ★</span>
        <span>${escapeHtml(cinta)} ★</span>
      </div></div>
      <div class="hero-sello" aria-hidden="true"><b>F7</b><span>Nocturno · ${escapeHtml(edicion)}</span></div>
    </section>`;
}

// Opciones de render de las tarjetas de la home: sin badges de estado, con la
// fecha en español y sin los pases libres (no aportan a un resumen).
function opcionesTorneoHome(torneo, profundidad = 0) {
  return {
    nombres: data.mapaNombres(torneo.equipos),
    equipos: data.mapaEquipos(torneo.equipos),
    torneo: null,
    conEstado: false,
    profundidad,
    formatearFecha: formatFecha,
    omitirSiPaseLibre: true,
  };
}

function tarjetas(partidos, torneo, profundidad) {
  const opts = opcionesTorneoHome(torneo, profundidad);
  return partidos.map((p) => tarjetaPartido(p, opts)).join("");
}

// Fondo con video de una sección. El clip lleva la misma opacidad y el mismo
// oscurecido que las fotos de fondo (ver .video-fondo en css/layout.css), y
// el poster es un fotograma real del video: mientras carga, o si el
// navegador no lo reproduce, se ve igual que una foto.
//
// Los dos clips de la cancha van unidos en un solo archivo
// (assets/video/cancha-largo.mp4), filmado en vertical: en compu el
// object-fit corta la franja central a lo ancho y en el celu el clip ocupa
// el alto entero de la sección. Se reproduce en todos los tamaños; el .mp4
// es H.264 sin audio de ~2,2 MB y va con el índice al principio (faststart)
// para que arranque sin esperar el archivo entero.
//
// El video no lleva autoplay en el HTML a propósito: así el archivo no se
// descarga hasta que fondo-video.js ve la sección en pantalla, y con menos
// movimiento no se descarga nunca. Sin JS queda el poster, que es un
// fotograma del propio clip: se ve la imagen, solo que quieta.
function fondoVideo(nombre, poster, profundidad = 0) {
  return `
        <div class="video-fondo" aria-hidden="true">
          <video muted loop playsinline preload="none" tabindex="-1" poster="${rutaAsset(poster, profundidad)}">
            <source src="${rutaAsset(`assets/video/${nombre}.mp4`, profundidad)}" type="video/mp4">
          </video>
        </div>`;
}

function bloqueTorneo() {
  const lista = torneos();
  const vigentes = Object.keys(sitio().edicionVigente || {})
    .map((categoria) => data.torneoVigente(sitio(), lista, categoria))
    .filter(Boolean);

  if (!vigentes.length) {
    return '<section class="page"><p>Todavía no se cargó el torneo vigente.</p></section>';
  }

  return `
      <section class="page home-grid">
        ${vigentes.map((torneo) => tarjetaVigente(torneo, lista)).join("\n")}
      </section>`;
}

// Una edición vigente en la home: el nombre de la categoría y la edición son el
// enlace a esa edición (su ::after se estira sobre la tarjeta entera, ver
// layout.css), con el badge de vigente y las dos listas: próximos partidos y
// resultados recientes.
function tarjetaVigente(torneo, lista) {
  const url = rutaPaginaEdicion(torneo).replace(/index\.html$/, "");
  const nombre = escapeHtml(data.nombreCategoria(torneo.categoria, lista));
  const seccion = (titulo, partidos, vacio) =>
    `<h3>${titulo}</h3>\n          ${partidos || `<p class="nota-meta">${vacio}</p>`}`;

  return `
        <article data-reveal>
          <h2 class="home-torneo-titulo">
            <a href="${url}">${nombre} · Edición <b class="ed-num">${escapeHtml(torneo.edicion)}</b></a>
            ${torneo.estado === "vigente" ? badge("vigente", "vigente") : ""}
          </h2>
          ${seccion("Próximos partidos", tarjetas(data.proximosPartidos(torneo), torneo, 0), "Todavía no hay partidos programados.")}
          ${seccion("Resultados recientes", tarjetas(data.recientesPartidos(torneo), torneo, 0), "Todavía no hay resultados cargados.")}
        </article>`;
}

// El kicker de sección: la temporada vigente, en el mismo formato que usa el
// club ("Temporada 26/27").
function kickerTemporada() {
  return `Temporada ${escapeHtml(sitio().edicionVigente.libres)}`;
}

function bloqueNoticias() {
  const items = noticias().slice(0, 3)
    .map((n) => tarjetaNota(n, 0, { prefijoHref: "noticias/" }))
    .join("");

  return `
    <section class="page">
      <h2 class="titulo-cartel"><span class="titulo-kicker" aria-hidden="true">${kickerTemporada()}</span>Últimas noticias</h2>
      <div class="noticias-grid">${items || "<p>Todavía no hay noticias.</p>"}</div>
      <p><a href="noticias/index.html">Ver todas las noticias →</a></p>
    </section>`;
}

function main() {
  const t0 = Date.now();
  console.log("Limpiando dist/ …");
  prepararDist();
  console.log("Generando páginas manuscritas…");
  generarManuscritas();
  console.log("Generando contacto…");
  generarContacto();
  console.log("Generando ediciones de torneo…");
  console.log(`  → ${generarEdiciones()} ediciones`);
  console.log("Generando índice de torneos…");
  generarTorneosIndex();
  console.log("Generando noticias…");
  console.log(`  → ${generarNoticias()} noticias`);
  console.log("Generando home…");
  generarHome();
  console.log(`Build OK ✔ (${Date.now() - t0} ms)`);
}

main();
