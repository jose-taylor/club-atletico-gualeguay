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

export function proximosPartidos(torneo, max = 5) {
  return partidosDeTorneo(torneo)
    .filter((p) => esPendiente(p) && p.fecha)
    .sort(compararPorId)
    .slice(0, max);
}

export function recientesPartidos(torneo, max = 5) {
  return partidosDeTorneo(torneo)
    .filter((p) => p.estado === "jugado")
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
