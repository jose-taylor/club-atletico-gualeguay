// Vistas de la página de un torneo. Cada función devuelve HTML como texto:
// no tocan el DOM, así que se pueden razonar y probar por separado.
// Los datos y las reglas vienen de lib/, que el build también usa.

import {
  rondasAgrupadas, mapaNombres, mapaEquipos, goleadoresOrdenados,
} from "./lib/data.js";
import { tarjetaPartido, tarjetaEquipo, tablaGoleadores, estadoHTML, zonaHTML } from "./lib/render.js";
import { mostrarEstado } from "./lib/torneo-modelo.js";
import { formatFechaDia, escapeHtml } from "./lib/texto.js";

// Base de las tarjetas de partido: el mapa de equipos y la profundidad de la
// página (para resolver las rutas de los escudos).
function baseRender(torneo, profundidad, zona) {
  return {
    nombres: mapaNombres(torneo.equipos),
    equipos: mapaEquipos(torneo.equipos),
    torneo,
    profundidad,
    conEstado: mostrarEstado(zona),
  };
}

// --- Agrupación por día (la comparten Cuadro y Fixture) ---
// Recibe [{ partido, zona, ronda? }] y devuelve [[fecha, items], ...] con los
// días en orden ascendente; los partidos sin fecha van al final.
function agruparPorDia(items) {
  const porDia = new Map();
  for (const item of items) {
    const clave = item.partido.fecha || "";
    if (!porDia.has(clave)) porDia.set(clave, []);
    porDia.get(clave).push(item);
  }
  return [...porDia.entries()].sort(([a], [b]) => {
    if (!a) return 1;
    if (!b) return -1;
    return a.localeCompare(b);
  });
}

// Dentro de un día manda el id del partido: los ids más bajos van arriba.
// Se comparan de forma natural para que "p-2" quede antes que "p-10".
function ordenarPorId(items) {
  return [...items].sort((x, y) => {
    const a = x.partido.id;
    const b = y.partido.id;
    if (a == null && b == null) return 0;
    if (a == null) return 1;
    if (b == null) return -1;
    const porId = String(a).localeCompare(String(b), "es", { numeric: true });
    if (porId !== 0) return porId;
    // Desempate solo si dos partidos comparten id (no debería pasar).
    return (x.partido.hora || "99:99").localeCompare(y.partido.hora || "99:99");
  });
}

// Bloque visual de un día: encabezado con la fecha y los partidos adentro.
function bloqueDia(fecha, items, contenido) {
  const cuenta = items.length === 1 ? "1 partido" : `${items.length} partidos`;
  return `<section class="fixture-dia">
        <h3 class="fixture-dia-titulo">
          <span>${fecha ? formatFechaDia(fecha) : "Fecha a definir"}</span>
          <span class="fixture-dia-cuenta">${cuenta}</span>
        </h3>
        <div class="fixture-dia-partidos">${contenido}</div>
      </section>`;
}

// --- Cuadro: una ronda por vez, con navegación entre rondas ---
// Dentro de la ronda, los partidos se agrupan por día igual que en el Fixture.
export function vistaCuadro(torneo, indice, profundidad) {
  const rondas = rondasAgrupadas(torneo);
  if (!rondas.length) return estadoHTML("Todavía no hay partidos cargados.");

  const i = Math.min(Math.max(indice, 0), rondas.length - 1);
  const ronda = rondas[i];
  const entradas = ronda.zonas.flatMap(({ zona, partidos }) =>
    partidos.map((partido) => ({ partido, zona })));

  const bloques = agruparPorDia(entradas).map(([fecha, items]) => {
    const ordenados = ordenarPorId(items);
    // Las zonas conservan su orden canónico y muestran solo los partidos
    // de ese día.
    const contenido = ronda.zonas
      .map(({ zona }) => {
        const delDia = ordenados
          .filter((item) => item.zona === zona)
          .map((item) => item.partido);
        return delDia.length ? zonaHTML(zona, delDia, baseRender(torneo, profundidad, zona)) : "";
      })
      .join("");
    return bloqueDia(fecha, items, contenido);
  }).join("");

  // En la primera ronda todos los equipos deberían tener partido: el que no
  // aparece en ninguno tiene fecha libre y se avisa al lado del título.
  const libres = i === 0 ? equiposLibres(torneo, ronda) : [];
  const etiquetaLibre = libres.length
    ? ` <span class="cuadro-libre">(${libres.length === 1 ? "Equipo libre" : "Equipos libres"}: ` +
      `${libres.map((e) => escapeHtml(e.nombre)).join(", ")})</span>`
    : "";

  return `<h2>Cuadro · Ronda <b class="ed-num">${ronda.numero}</b>${etiquetaLibre}</h2>` +
    `<div class="nav-ronda">${navRonda(i, rondas.length, ronda.numero)}</div>` +
    `<div class="fixture-dias">${bloques}</div>`;
}

// Equipos que no aparecen en ningún partido de la ronda.
function equiposLibres(torneo, ronda) {
  const usados = new Set();
  for (const { partidos } of ronda.zonas) {
    for (const p of partidos) {
      if (p.equipoA) usados.add(p.equipoA);
      if (p.equipoB) usados.add(p.equipoB);
    }
  }
  return (torneo.equipos || []).filter((e) => !usados.has(e.id));
}

function navRonda(actual, total, numero) {
  const prev = `<button class="tab" type="button" data-ronda="-1" ${actual === 0 ? "disabled" : ""} aria-label="Ronda anterior">◀</button>`;
  const next = `<button class="tab" type="button" data-ronda="1" ${actual === total - 1 ? "disabled" : ""} aria-label="Ronda siguiente">▶</button>`;
  return prev + `<span class="ronda-actual">Ronda <b class="ed-num ed-num--sm">${numero}</b></span>` + next;
}

// --- Fixture: todas las rondas, agrupadas por día ---
// Se juntan los partidos de todas las rondas y zonas y se separan en bloques
// por fecha. Cada día es su propia tarjeta, con sus partidos ordenados por id
// (los más bajos arriba). Los partidos sin fecha van al final.
export function vistaFixture(torneo, profundidad) {
  const rondas = rondasAgrupadas(torneo);
  if (!rondas.length) return estadoHTML("Todavía no hay partidos cargados.");

  const entradas = [];
  for (const ronda of rondas) {
    for (const { zona, partidos } of ronda.zonas) {
      for (const partido of partidos) entradas.push({ partido, zona, ronda: ronda.numero });
    }
  }

  const bloques = agruparPorDia(entradas).map(([fecha, items]) => {
    const contenido = ordenarPorId(items)
      .map(({ partido, zona }) => tarjetaPartido(partido, baseRender(torneo, profundidad, zona)))
      .join("");
    return bloqueDia(fecha, items, contenido);
  }).join("");

  return '<h2>Fixture</h2><div class="fixture-dias">' + bloques + "</div>";
}

// --- Equipos: escudo, nombre y estado (GAN./PER./ELIM.) ---
// La grilla se abre según la cantidad: 1 columna hasta 10 equipos, 2 de 11 a
// 30 y 3 con más de 30. En teléfono el CSS la mantiene en una columna.
export function vistaEquipos(torneo, profundidad) {
  if (!torneo.equipos.length) return estadoHTML("Todavía no hay equipos cargados.");
  const total = torneo.equipos.length;
  const cols = total > 30 ? 3 : total > 10 ? 2 : 1;
  const lista = torneo.equipos.map((e) => tarjetaEquipo(e, profundidad, torneo)).join("");
  return `<h2>Equipos</h2><div class="equipos-grid cols-${cols}">${lista}</div>`;
}

// --- Goleadores ---
export function vistaGoleadores(torneo) {
  const goleadores = goleadoresOrdenados(torneo);
  if (!goleadores.length) return estadoHTML("Aún no se cargaron goleadores.");
  return "<h2>Goleadores</h2>" + tablaGoleadores(goleadores, mapaNombres(torneo.equipos));
}
