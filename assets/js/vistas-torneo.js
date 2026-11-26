// Vistas de la página de un torneo. Cada función devuelve HTML como texto:
// no tocan el DOM, así que se pueden razonar y probar por separado.
// Los datos y las reglas vienen de lib/, que el build también usa.

import {
  rondasAgrupadas, mapaNombres, mapaEquipos, goleadoresOrdenados,
  agruparPorDia, entradasFixtureCompartidas, ordenarPorHorario,
} from "./lib/data.js";
import { tarjetaPartido, tarjetaEquipo, tablaGoleadores, estadoHTML, zonaHTML } from "./lib/render.js";
import { mostrarEstado } from "./lib/torneo-modelo.js";
import { formatFecha, formatFechaDia, escapeHtml } from "./lib/texto.js";

// Base de las tarjetas de partido: el mapa de equipos y la profundidad de la
// página (para resolver las rutas de los escudos).
function baseRender(torneo, profundidad, zona) {
  return {
    nombres: mapaNombres(torneo.equipos),
    equipos: mapaEquipos(torneo.equipos),
    torneo,
    profundidad,
    conEstado: mostrarEstado(zona),
    formatearFecha: formatFecha,
  };
}

// Color y marca de la tarjeta según la edición. La categoría viene del JSON.
function categoriaClase(torneo) {
  return String(torneo?.categoria || "").toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function claseEdicion(torneo) {
  const categoria = categoriaClase(torneo);
  return categoria ? `tarjeta-partido--${categoria}` : "";
}

// Solo las ediciones con marca declarada llevan la letra en círculo.
const MARCA_CATEGORIA = {
  veteranos: { texto: "V", etiqueta: "Veteranos" },
};

function marcaEdicion(torneo) {
  return MARCA_CATEGORIA[categoriaClase(torneo)] || {};
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
    const ordenados = ordenarPorHorario(items);
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

// --- Fixture: partidos por jugar de todas las rondas, agrupados por día ---
// Los partidos ya jugados salen de acá: se ven en Resultados recientes (home)
// y en el Cuadro. Cada día es su propia tarjeta, con los partidos ordenados
// por hora (el id solo desempata). Los partidos sin fecha van al final.
//
// En los días en que juegan ambas ediciones se muestran los partidos de las dos
// en ambos fixtures: el día es el mismo calendario, no dos calendarios aparte.
// `otras` son los torneos hermanos que cargó torneo.js desde el DOM.
export function vistaFixture(torneo, profundidad, otras = []) {
  const rondas = rondasAgrupadas(torneo);
  if (!rondas.length) return estadoHTML("Todavía no hay partidos cargados.");

  const entradas = entradasFixtureCompartidas(torneo, otras);
  if (!entradas.length) return estadoHTML("Todavía no hay partidos por jugar.");

  const bloques = agruparPorDia(entradas).map(([fecha, items]) => {
    const contenido = ordenarPorHorario(items)
      .map(({ partido, zona, torneo: t }) => {
        const marca = marcaEdicion(t);
        return tarjetaPartido(partido, {
          ...baseRender(t, profundidad, zona),
          clase: claseEdicion(t),
          marca: marca.texto || "",
          marcaEtiqueta: marca.etiqueta || "",
        });
      })
      .join("");
    return bloqueDia(fecha, items, contenido);
  }).join("");

  const categoria = categoriaClase(torneo);
  const claseContenedor = `fixture-dias${categoria ? ` fixture-dias--${categoria}` : ""}`;
  return `<h2>Fixture</h2><div class="${claseContenedor}">${bloques}</div>`;
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
