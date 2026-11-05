// Render de piezas de torneo a HTML.
// Módulo puro: sin DOM, sin Node. Lo usan el build y el navegador, así que
// "cómo se ve un partido" está definido una sola vez para toda la web.
//
// Contrato: todas las funciones devuelven HTML como texto. Los textos que
// vienen de los datos (nombres de equipo) se escapan en la frontera.

import { rutaAsset } from "./rutas.js";
import { estadoEquipo } from "./torneo-modelo.js";
import { escapeHtml as esc } from "./texto.js";
import { ETIQUETA_ZONA } from "./data.js";

export { ETIQUETA_ZONA };

// Hasta 3 iniciales para el escudo de reemplazo cuando el equipo no tiene imagen.
export function iniciales(nombre) {
  return String(nombre)
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 3)
    .toUpperCase();
}

// Escudo del equipo: la imagen si existe, un círculo de iniciales si no.
// `profundidad` = niveles hasta la raíz del sitio, para resolver rutas relativas.
export function escudoHtml(equipo, profundidad = 0) {
  if (!equipo) return "";
  if (equipo.escudo) {
    const src = rutaAsset(equipo.escudo, profundidad);
    return `<img class="equipo-escudo" src="${src}" alt="Escudo de ${esc(equipo.nombre)}" loading="lazy">`;
  }
  return `<span class="equipo-escudo fallback" aria-hidden="true">${esc(iniciales(equipo.nombre))}</span>`;
}

// Estado del equipo: abreviatura visible (para que entre en la tarjeta), clase
// CSS y nombre completo para lectores de pantalla y tooltip del mouse.
const ETIQUETA_ESTADO = {
  ganadores: { abrev: "GAN.", clase: "gan", nombre: "Ganadores" },
  perdedores: { abrev: "PER.", clase: "per", nombre: "Perdedores" },
  eliminado: { abrev: "ELIM.", clase: "elim", nombre: "Eliminado" },
};

export function badgeEstado(estado) {
  const e = ETIQUETA_ESTADO[estado];
  if (!e) return "";
  return `<span class="badge ${e.clase}" title="${e.nombre}" aria-label="${e.nombre}">${e.abrev}</span>`;
}

export function badge(texto, clase = "") {
  return `<span class="badge${clase ? " " + clase : ""}">${esc(texto)}</span>`;
}

function nombreDe(id, nombres) {
  if (!id) return '<span class="tp-equipo vacio">por definir</span>';
  return esc(nombres[id] || "");
}

function textoResultado(partido) {
  if (partido.estado !== "jugado" || !partido.resultado) return "<strong>vs</strong>";
  const r = partido.resultado;
  // El marcador real va envuelto para que lo tome la tipografía de cartel
  // (--font-numeros); el "vs" de los partidos sin jugar queda en la de siempre.
  let txt = `<span class="tp-marcador">${r.golesA} – ${r.golesB}</span>`;
  if (partido.penales) txt += ` ${badge(`${partido.penales.a}-${partido.penales.b} pen.`, "pen")}`;
  return txt;
}

// Fecha y hora del partido. La cancha no entra: el club tiene una sola, así que
// repetirla en cada tarjeta no agrega nada (ver templates/instalaciones.html).
function lineaMeta(partido, formatearFecha) {
  if (!partido.fecha) return "Fecha a definir";
  const fecha = formatearFecha ? formatearFecha(partido.fecha) : partido.fecha;
  const hora = partido.hora ? ` ${partido.hora}` : "";
  return `${fecha}${hora}`;
}

/**
 * Tarjeta de un partido. Es la misma para el cuadro, el fixture y la home.
 *
 * opts:
 *   nombres            { id: nombre }            mapa de equipos
 *   equipos            { id: equipo }            para los escudos
 *   torneo             objeto del torneo        necesario si `conVidas`
 *   conEstado          boolean                   muestra el badge de estado (GAN./PER./ELIM.)
 *   profundidad        number                    niveles hasta la raíz del sitio
 *   formatearFecha     function                  opcional: "2026-10-03" → texto
 *   omitirSiPaseLibre  boolean                   la home no muestra los pases libres
 */
export function tarjetaPartido(partido, opts = {}) {
  const { nombres = {}, equipos = {}, torneo = null, conEstado = false,
    profundidad = 0, formatearFecha = null, omitirSiPaseLibre = false } = opts;

  if (partido.estado === "pase-libre") {
    if (omitirSiPaseLibre) return "";
    const equipo = equipos[partido.equipoA];
    const quien = equipo ? `${escudoHtml(equipo, profundidad)} ${esc(equipo.nombre)}` : "Equipo";
    return '<div class="tarjeta-partido"><div class="tp-titulo">Pase libre</div>' +
      `<div class="tp-fila"><span class="tp-equipo">${quien} pasa de ronda</span>` +
      badge("Bye", "bye") + "</div></div>";
  }

  const escudo = (id) => (id && equipos[id] ? escudoHtml(equipos[id], profundidad) + " " : "");
  const estado = (id) => (conEstado && id && torneo ? badgeEstado(estadoEquipo(torneo, id)) : "");

  return '<div class="tarjeta-partido"><div class="tp-titulo">' + lineaMeta(partido, formatearFecha) + "</div>" +
    '<div class="tp-fila tp-fila--match"><span class="tp-equipo tp-equipo--local">' + escudo(partido.equipoA) +
    nombreDe(partido.equipoA, nombres) + estado(partido.equipoA) + "</span>" +
    '<span class="tp-resultado">' + textoResultado(partido) + "</span>" +
    '<span class="tp-equipo tp-equipo--visitante">' + escudo(partido.equipoB) +
    nombreDe(partido.equipoB, nombres) + estado(partido.equipoB) + "</span></div></div>";
}

// Fila de la vista Equipos: escudo + nombre + badge de estado.
export function tarjetaEquipo(equipo, profundidad = 0, torneo = null) {
  const badgeEstadoHtml = torneo ? " " + badgeEstado(estadoEquipo(torneo, equipo.id)) : "";
  return '<div class="tarjeta-partido"><div class="tp-fila">' +
    `<span class="tp-equipo">${escudoHtml(equipo, profundidad)} ${esc(equipo.nombre)}</span>` +
    `${badgeEstadoHtml}</div></div>`;
}

// Tabla de goleadores (el nombre del equipo se resuelve contra el mapa).
export function tablaGoleadores(goleadores, nombres) {
  const filas = [...goleadores]
    .sort((a, b) => b.goles - a.goles)
    .map((g) => `<tr><td>${esc(g.jugador)}</td><td>${esc(nombres[g.equipoId] || g.equipoId)}</td>` +
      `<td class="td-goles"><strong class="goles-num">${esc(g.goles)}</strong></td></tr>`)
    .join("");
  return '<table class="tabla"><thead><tr><th>Jugador</th><th>Equipo</th><th>Goles</th></tr></thead>' +
    `<tbody>${filas}</tbody></table>`;
}

// Bloque de estado (cargando / sin datos / error).
export function estadoHTML(mensaje, tipo = "") {
  return `<div class="estado${tipo === "error" ? " error" : ""}"><p>${esc(mensaje)}</p></div>`;
}

// Zona de una ronda: título + tarjetas.
export function zonaHTML(zona, partidos, opts) {
  const [titulo, clase] = ETIQUETA_ZONA[zona];
  const cards = partidos.map((p) => tarjetaPartido(p, opts)).join("");
  return `<div><div class="zona-titulo ${clase}">${titulo}</div>` +
    `${cards || '<p class="tp-titulo">Sin partidos en esta zona.</p>'}</div>`;
}
