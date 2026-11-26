import { fechaISO } from "./texto.js";

// Consultas y agrupaciones sobre los datos de data/.
// Módulo puro (sin disco, sin DOM): lo usan el build, el navegador y las pruebas.
//
// Principio: nada de esto conoce categorías concretas. Para agregar una categoría
// nueva basta con crear su JSON; la etiqueta sale del campo "nombre" del torneo.

// Etiquetas de las zonas dentro de una ronda: [título visible, clase CSS].
export const ETIQUETA_ZONA = {
  iniciales: ["Cruces iniciales", "iniciales"],
  ganadores: ["Zona Ganadores", "ganadores"],
  perdedores: ["Zona Perdedores", "perdedores"],
};

// Orden canónico de las zonas dentro de una ronda.
export const ORDEN_ZONAS = Object.keys(ETIQUETA_ZONA);

// Índices por id para no recorrer arrays en cada render.
export function mapaEquipos(equipos) {
  const m = {};
  for (const e of equipos) m[e.id] = e;
  return m;
}

export function mapaNombres(equipos) {
  const m = {};
  for (const e of equipos) m[e.id] = e.nombre;
  return m;
}

// El JSON trae una entrada por zona; el Cuadro y el Fixture necesitan las rondas
// unidas por número, con las zonas en el orden canónico y solo las que tienen
// partidos. Devuelve: [{ numero, zonas: [{ zona, partidos }] }]
export function rondasAgrupadas(torneo) {
  const porNumero = new Map();
  for (const ronda of torneo.rondas || []) {
    const numero = ronda.numero ?? ronda.orden ?? (ronda.nombre ? parseInt(String(ronda.nombre).match(/\d+/)?.[0]) : NaN);
    const num = Number.isFinite(numero) ? numero : 1;
    if (!porNumero.has(num)) porNumero.set(num, new Map());
    porNumero.get(num).set(ronda.zona, ronda.partidos || []);
  }
  return [...porNumero.entries()]
    .sort(([a], [b]) => a - b)
    .map(([numero, zonas]) => ({
      numero,
      zonas: ORDEN_ZONAS
        .filter((z) => (zonas.get(z) || []).length)
        .map((z) => ({ zona: z, partidos: zonas.get(z) })),
    }));
}

// Aplana todas las rondas en una sola lista de partidos.
export function partidosDeTorneo(torneo) {
  return (torneo.rondas || []).flatMap((r) => r.partidos || []);
}

export function ultimaRondaPartidos(torneo) {
  const rondas = torneo.rondas || [];
  if (!rondas.length) return [];
  const max = Math.max(...rondas.map((r) => r.numero));
  return rondas.filter((r) => r.numero === max).flatMap((r) => r.partidos || []);
}

// Un partido está pendiente si todavía no se jugó. El JSON real usa
// "programado"; los datos viejos y la documentación usan "por jugar". Se
// aceptan ambos para que la home no quede vacía por una diferencia de palabra.
export function esPendiente(partido) {
  return partido.estado === "programado" || partido.estado === "por jugar";
}

// Compara ids de partido de forma natural: "p-2" va antes que "p-10".
// Los partidos sin id quedan al final.
export function compararPorId(a, b) {
  if (a.id == null && b.id == null) return 0;
  if (a.id == null) return 1;
  if (b.id == null) return -1;
  return String(a.id).localeCompare(String(b.id), "es", { numeric: true });
}

// Minutos desde medianoche. Las horas de la madrugada se pasan al día
// siguiente cuando el mismo día tiene partidos de tarde/noche: así "00:20"
// va después de "23:30" en vez de antes.
function minutosDe(hora, hayTarde) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hora || ""));
  if (!m) return Number.POSITIVE_INFINITY;
  const minutos = Number(m[1]) * 60 + Number(m[2]);
  return hayTarde && Number(m[1]) < 12 ? minutos + 24 * 60 : minutos;
}

// Orden de un día en Fixture y Cuadro: manda la hora, el id solo desempata.
// Los partidos de la edición que se está viendo van primero si hora e id
// coinciden (los ids se repiten entre ediciones).
export function ordenarPorHorario(items) {
  const hayTarde = items.some(({ partido }) => {
    const m = /^(\d{1,2}):/.exec(String(partido.hora || ""));
    return m && Number(m[1]) >= 18;
  });
  return [...items].sort((x, y) => {
    const dx = minutosDe(x.partido.hora, hayTarde);
    const dy = minutosDe(y.partido.hora, hayTarde);
    if (dx !== dy) return dx - dy;
    const porId = compararPorId(x.partido, y.partido);
    if (porId !== 0) return porId;
    return Number(!!x.esOtra) - Number(!!y.esOtra);
  });
}

// Agrupa entradas [{ partido, ... }] por fecha normalizada y devuelve
// [[fecha, items], ...]. Los partidos sin fecha válida van al final, con la
// clave "" para que la vista los muestre como "Fecha a definir".
export function agruparPorDia(items) {
  const porDia = new Map();
  for (const item of items) {
    const clave = fechaISO(item.partido.fecha);
    if (!porDia.has(clave)) porDia.set(clave, []);
    porDia.get(clave).push(item);
  }
  return [...porDia.entries()].sort(([a], [b]) => {
    if (!a) return 1;
    if (!b) return -1;
    return a.localeCompare(b);
  });
}

export function proximosPartidos(torneo, max = 5) {
  const pendientes = partidosDeTorneo(torneo)
    .filter((p) => esPendiente(p) && fechaISO(p.fecha));
  if (!pendientes.length) return [];

  // Después de una reprogramación los ids ya no siguen el calendario: el
  // día más próximo puede tener ids más altos. Se eligen primero los partidos
  // de la fecha más cercana y, si no alcanzan a `max`, se completan con los
  // días siguientes. Dentro de cada día se mantiene el orden por id, que es
  // el orden de horarios de la programación.
  const porFecha = new Map();
  for (const partido of pendientes) {
    const clave = fechaISO(partido.fecha);
    if (!porFecha.has(clave)) porFecha.set(clave, []);
    porFecha.get(clave).push(partido);
  }
  return [...porFecha.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .flatMap(([, partidos]) => [...partidos].sort(compararPorId))
    .slice(0, max);
}

export function esJugado(partido) {
  return partido.estado === "jugado";
}

// Entradas del Fixture: partidos por jugar con su zona, ronda y torneo de
// origen. Sirve para el calendario de una edición y para el compartido.
export function entradasFixture(torneo) {
  return rondasAgrupadas(torneo).flatMap((ronda) =>
    ronda.zonas.flatMap(({ zona, partidos }) =>
      partidos
        .filter((partido) => !esJugado(partido))
        .map((partido) => ({ partido, zona, ronda: ronda.numero, torneo }))));
}

// Los días en que juegan dos ediciones son un solo calendario: se agregan los
// partidos de las ediciones hermanas solo si caen en una fecha que ya tiene
// partidos de la edición que se está viendo. Los sin fecha no se cruzan.
export function entradasFixtureCompartidas(torneo, otras = []) {
  const propios = entradasFixture(torneo).map((entrada) => ({ ...entrada, esOtra: false }));
  const fechas = new Set(
    propios.map(({ partido }) => fechaISO(partido.fecha)).filter(Boolean));
  const agregados = otras
    .filter((otro) => otro && otro.id !== torneo.id)
    .flatMap((otro) => entradasFixture(otro).map((entrada) => ({ ...entrada, esOtra: true })))
    .filter(({ partido }) => fechas.has(fechaISO(partido.fecha)));
  return [...propios, ...agregados];
}

export function recientesPartidos(torneo, max = 5) {
  return partidosDeTorneo(torneo)
    .filter(esJugado)
    .sort((a, b) => compararPorId(b, a))
    .slice(0, max);
}

export function goleadoresOrdenados(torneo) {
  return [...(torneo.goleadores || [])].sort((a, b) => b.goles - a.goles);
}

// --- Consultas sobre el conjunto de torneos ---

export function torneoVigente(sitio, torneos, categoria) {
  const edicion = (sitio.edicionVigente || {})[categoria];
  if (!edicion) return null;
  return torneos.find((t) => t.categoria === categoria && t.edicion === edicion) || null;
}

export function edicionesDe(torneos, categoria) {
  return torneos
    .filter((t) => t.categoria === categoria)
    .sort((a, b) => b.edicion.localeCompare(a.edicion));
}

// Torneos agrupados por categoría, en orden alfabético y con ediciones nuevas primero.
export function categorias(torneos) {
  const mapa = {};
  for (const t of torneos) (mapa[t.categoria] ||= []).push(t);
  return Object.fromEntries(
    Object.entries(mapa)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([cat, lista]) => [cat, lista.sort((a, b) => b.edicion.localeCompare(a.edicion))])
  );
}

// Etiqueta visible de una categoría: sale del propio JSON, no de una tabla en el código.
export function nombreCategoria(categoria, torneos = []) {
  const t = torneos.find((x) => x.categoria === categoria);
  return t ? t.nombre : categoria.charAt(0).toUpperCase() + categoria.slice(1);
}
