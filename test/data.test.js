import { test } from "node:test";
import assert from "node:assert/strict";
import * as data from "../lib/data.js";

const SITIO = { edicionVigente: { libres: "26/27", veteranos: "26/27" } };
const TORNEOS = [
  { id: "libres-26-27", nombre: "Libres", categoria: "libres", edicion: "26/27", estado: "vigente" },
  { id: "libres-25-26", nombre: "Libres", categoria: "libres", edicion: "25/26", estado: "archivo" },
  { id: "veteranos-26-27", nombre: "Veteranos", categoria: "veteranos", edicion: "26/27", estado: "vigente" },
];

// --- índices ---
test("mapaEquipos: indexa el equipo completo por id", () => {
  const mapa = data.mapaEquipos([{ id: "a", nombre: "A", escudo: "x.png" }]);
  assert.equal(mapa.a.nombre, "A");
  assert.equal(mapa.a.escudo, "x.png");
});

test("mapaNombres: solo id -> nombre", () => {
  assert.deepEqual(data.mapaNombres([{ id: "a", nombre: "A", escudo: "x.png" }]), { a: "A" });
});

// --- agrupación de rondas ---
test("rondasAgrupadas: une las zonas que comparten número de ronda", () => {
  const t = { rondas: [
    { numero: 1, zona: "iniciales", partidos: [{ id: "p1" }] },
    { numero: 2, zona: "ganadores", partidos: [{ id: "p2" }] },
    { numero: 2, zona: "perdedores", partidos: [{ id: "p3" }] },
    { numero: 3, zona: "ganadores", partidos: [{ id: "p4" }] },
  ] };
  const r = data.rondasAgrupadas(t);
  assert.deepEqual(r.map((x) => x.numero), [1, 2, 3]);
  assert.deepEqual(r[1].zonas.map((z) => z.zona), ["ganadores", "perdedores"]);
  assert.deepEqual(r[1].zonas[0].partidos, [{ id: "p2" }]);
});

test("rondasAgrupadas: ordena las zonas en el orden canónico", () => {
  const r = data.rondasAgrupadas({ rondas: [
    { numero: 2, zona: "perdedores", partidos: [{ id: "b" }] },
    { numero: 2, zona: "ganadores", partidos: [{ id: "a" }] },
    { numero: 2, zona: "iniciales", partidos: [{ id: "c" }] },
  ] });
  assert.deepEqual(r[0].zonas.map((z) => z.zona), ["iniciales", "ganadores", "perdedores"]);
});

test("rondasAgrupadas: descarta las zonas sin partidos", () => {
  const r = data.rondasAgrupadas({ rondas: [
    { numero: 1, zona: "iniciales", partidos: [{ id: "a" }] },
    { numero: 1, zona: "ganadores", partidos: [] },
    { numero: 1, zona: "inventada", partidos: [{ id: "z" }] },
  ] });
  assert.deepEqual(r[0].zonas.map((z) => z.zona), ["iniciales"]);
});

test("rondasAgrupadas: torneo sin rondas devuelve lista vacía", () => {
  assert.deepEqual(data.rondasAgrupadas({}), []);
});

// --- aplanado y filtros de partidos ---
const T = { rondas: [
  { numero: 1, zona: "iniciales", partidos: [
    { id: "r1-p1", estado: "jugado", fecha: "2026-10-01" },
    { id: "r1-p2", estado: "por jugar", fecha: "2026-11-01" },
  ] },
  { numero: 2, zona: "ganadores", partidos: [
    { id: "r2-p1", estado: "jugado", fecha: "2026-10-20" },
    { id: "r2-p2", estado: "por jugar", fecha: "2026-10-05" },
  ] },
] };

test("partidosDeTorneo: aplana todas las rondas", () => {
  assert.deepEqual(data.partidosDeTorneo(T).map((p) => p.id), ["r1-p1", "r1-p2", "r2-p1", "r2-p2"]);
});

test("ultimaRondaPartidos: devuelve los partidos de la ronda de número más alto", () => {
  assert.deepEqual(data.ultimaRondaPartidos(T).map((p) => p.id), ["r2-p1", "r2-p2"]);
});

test("ultimaRondaPartidos: torneo sin rondas devuelve lista vacía", () => {
  assert.deepEqual(data.ultimaRondaPartidos({}), []);
});

test("proximosPartidos: los pendientes con fecha, ordenados por id", () => {
  assert.deepEqual(data.proximosPartidos(T).map((p) => p.id), ["r1-p2", "r2-p2"]);
  assert.deepEqual(data.proximosPartidos(T, 1).map((p) => p.id), ["r1-p2"]);
});

test("proximosPartidos: acepta estado programado y ordena por id natural", () => {
  const t = { rondas: [{ numero: 1, zona: "iniciales", partidos: [
    { id: "z", estado: "programado", fecha: "2026-11-16", hora: "19:00" },
    { id: "a", estado: "programado", fecha: "2026-11-16", hora: "21:00" },
    { id: "c", estado: "jugado", fecha: "2026-11-14" },
  ] }] };
  assert.deepEqual(data.proximosPartidos(t).map((p) => p.id), ["a", "z"]);
});

test("proximosPartidos: muestra 5 por defecto", () => {
  const partidos = Array.from({ length: 7 }, (_, i) => ({
    id: `p-${i + 1}`, estado: "programado", fecha: `2026-11-0${i + 1}`,
  }));
  assert.equal(data.proximosPartidos({ rondas: [{ partidos }] }).length, 5);
});

test("recientesPartidos: los jugados, con los ids más altos primero", () => {
  assert.deepEqual(data.recientesPartidos(T).map((p) => p.id), ["r2-p1", "r1-p1"]);
  assert.deepEqual(data.recientesPartidos(T, 1).map((p) => p.id), ["r2-p1"]);
});

test("recientesPartidos: ordena por id natural descendente", () => {
  const t = { rondas: [{ partidos: [
    { id: "p-2", estado: "jugado", fecha: "2026-10-01" },
    { id: "p-10", estado: "jugado", fecha: "2026-09-01" },
    { id: "p-1", estado: "jugado", fecha: "2026-10-20" },
  ] }] };
  assert.deepEqual(data.recientesPartidos(t).map((p) => p.id), ["p-10", "p-2", "p-1"]);
});

test("goleadoresOrdenados: ordena por goles descendente", () => {
  const g = data.goleadoresOrdenados({ goleadores: [
    { jugador: "A", equipoId: "e1", goles: 2 },
    { jugador: "B", equipoId: "e2", goles: 7 },
  ] });
  assert.deepEqual(g.map((x) => x.jugador), ["B", "A"]);
});

// --- consultas sobre el conjunto de torneos ---
test("torneoVigente: busca la edición vigente de una categoría", () => {
  assert.equal(data.torneoVigente(SITIO, TORNEOS, "libres").id, "libres-26-27");
  assert.equal(data.torneoVigente(SITIO, TORNEOS, "veteranos").id, "veteranos-26-27");
});

test("torneoVigente: sin entrada en edicionVigente devuelve null", () => {
  assert.equal(data.torneoVigente({ edicionVigente: {} }, TORNEOS, "libres"), null);
  assert.equal(data.torneoVigente({ edicionVigente: { lib: "26/27" } }, TORNEOS, "libres"), null);
});

test("edicionesDe: filtra por categoría, ediciones nuevas primero", () => {
  const libres = data.edicionesDe(TORNEOS, "libres");
  assert.deepEqual(libres.map((t) => t.edicion), ["26/27", "25/26"]);
});

test("categorias: agrupa por categoría en orden alfabético", () => {
  const cats = data.categorias(TORNEOS);
  assert.deepEqual(Object.keys(cats), ["libres", "veteranos"]);
  assert.equal(cats.libres.length, 2);
});

test("nombreCategoria: la etiqueta sale del JSON, no de una tabla en el código", () => {
  assert.equal(data.nombreCategoria("libres", TORNEOS), "Libres");
  // Una categoría nueva se etiqueta sola, sin tocar el código.
  assert.equal(data.nombreCategoria("amigos", [...TORNEOS, { categoria: "amigos", nombre: "Amigos" }]), "Amigos");
  assert.equal(data.nombreCategoria("desconocida"), "Desconocida");
});
