import { test } from "node:test";
import assert from "node:assert/strict";
import * as render from "../lib/render.js";

const EQUIPOS = {
  eq1: { id: "eq1", nombre: "Amistad FC", escudo: "assets/img/equipos/eq-1.png" },
  eq2: { id: "eq2", nombre: "Centenario" },
};
const NOMBRES = { eq1: "Amistad FC", eq2: "Centenario" };
const TORNEO = {
  equipos: [{ id: "eq1" }, { id: "eq2" }],
  rondas: [{ numero: 2, zona: "ganadores", partidos: [
    { equipoA: "eq1", equipoB: "eq2", estado: "jugado", resultado: { golesA: 0, golesB: 1 } },
  ] }],
};

test("iniciales: deriva hasta 3 letras del nombre", () => {
  assert.equal(render.iniciales("Amistad FC"), "AF");
  assert.equal(render.iniciales("Río Uruguay"), "RU");
  assert.equal(render.iniciales("La Picada"), "LP");
  assert.equal(render.iniciales("San"), "S");
});

test("escudoHtml: usa la imagen cuando el equipo la tiene", () => {
  const html = render.escudoHtml(EQUIPOS.eq1, 0);
  assert.match(html, /<img class="equipo-escudo" src="assets\/img\/equipos\/eq-1\.png"/);
  assert.match(html, /alt="Escudo de Amistad FC"/);
  assert.match(html, /loading="lazy"/);
});

test("escudoHtml: cae a iniciales cuando el equipo no tiene escudo", () => {
  const html = render.escudoHtml(EQUIPOS.eq2, 0);
  assert.match(html, /class="equipo-escudo fallback"/);
  assert.match(html, />C</);
  assert.doesNotMatch(html, /<img/);
});

test("escudoHtml: resuelve la ruta con la profundidad de la página", () => {
  assert.match(render.escudoHtml(EQUIPOS.eq1, 3), /src="\.\.\/\.\.\/\.\.\/assets\/img\/equipos\/eq-1\.png"/);
});

test("escudoHtml: sin equipo devuelve cadena vacía", () => {
  assert.equal(render.escudoHtml(null, 3), "");
  assert.equal(render.escudoHtml(undefined), "");
});

test("escudoHtml: escapa el nombre en el alt", () => {
  const html = render.escudoHtml({ id: "x", nombre: 'A" onerror="1', escudo: "a.png" }, 0);
  assert.doesNotMatch(html, /onerror="1"/);
  assert.match(html, /&quot;/);
});

test("badgeEstado: GAN., PER. o ELIM. con su clase", () => {
  assert.equal(render.badgeEstado("ganadores"), '<span class="badge gan" title="Ganadores" aria-label="Ganadores">GAN.</span>');
  assert.equal(render.badgeEstado("perdedores"), '<span class="badge per" title="Perdedores" aria-label="Perdedores">PER.</span>');
  assert.equal(render.badgeEstado("eliminado"), '<span class="badge elim" title="Eliminado" aria-label="Eliminado">ELIM.</span>');
  assert.equal(render.badgeEstado("desconocido"), "");
});

test("badge: texto escapado y clase opcional", () => {
  assert.equal(render.badge("Bye", "bye"), '<span class="badge bye">Bye</span>');
  assert.equal(render.badge("torneo"), '<span class="badge">torneo</span>');
  assert.match(render.badge("<b>", "pen"), /&lt;b&gt;/);
});

test("tarjetaPartido: partido por jugar muestra vs, fecha y hora (sin cancha)", () => {
  const html = render.tarjetaPartido(
    { estado: "por jugar", equipoA: "eq1", equipoB: "eq2", fecha: "2026-10-04", hora: "19:00", cancha: "Cancha 1" },
    { nombres: NOMBRES, equipos: EQUIPOS });
  assert.match(html, /2026-10-04 19:00/);
  // El club tiene una sola cancha: aunque el dato venga, no se repite en la
  // tarjeta (ver lib/render.js).
  assert.doesNotMatch(html, /Cancha/);
  assert.match(html, /<strong>vs<\/strong>/);
  assert.match(html, /Amistad FC/);
});

test("tarjetaPartido: usa el formateador de fecha cuando se le pasa", () => {
  const html = render.tarjetaPartido(
    { estado: "por jugar", equipoA: "eq1", equipoB: "eq2", fecha: "2026-10-04" },
    { nombres: NOMBRES, equipos: EQUIPOS, formatearFecha: () => "4 de octubre de 2026" });
  assert.match(html, /4 de octubre de 2026/);
  assert.doesNotMatch(html, /2026-10-04/);
});

test("tarjetaPartido: sin fecha muestra el aviso y no deja huecos", () => {
  const html = render.tarjetaPartido({ estado: "por jugar", equipoA: "eq1", equipoB: "eq2" },
    { nombres: NOMBRES, equipos: EQUIPOS });
  assert.match(html, /Fecha a definir/);
  assert.doesNotMatch(html, / · <\/div>/);
});

test("tarjetaPartido: partido jugado muestra resultado y escudos", () => {
  const html = render.tarjetaPartido(
    { estado: "jugado", equipoA: "eq1", equipoB: "eq2", resultado: { golesA: 2, golesB: 1 } },
    { nombres: NOMBRES, equipos: EQUIPOS });
  assert.match(html, /2 – 1/);
  assert.match(html, /<img class="equipo-escudo"/);
  assert.equal((html.match(/<img/g) || []).length, 1); // eq2 no tiene escudo
});

test("tarjetaPartido: el aviso de penales va con el equipo que ganó la tanda", () => {
  const base = { estado: "jugado", equipoA: "eq1", equipoB: "eq2", resultado: { golesA: 2, golesB: 2 } };
  const opts = { nombres: NOMBRES, equipos: EQUIPOS };

  // Gana el local, con el formato de penales que usa el JSON actual.
  const ganaA = render.tarjetaPartido(
    { ...base, penales: { golesA: 4, golesB: 3 } }, opts);
  const localA = ganaA.slice(ganaA.indexOf("tp-equipo--local"), ganaA.indexOf("tp-resultado"));
  assert.match(localA, /Ganador por penales/);
  assert.match(ganaA, /2 – 2/);
  assert.doesNotMatch(ganaA, /undefined|\d+-\d+ pen\./);

  // Gana el visitante, con el formato viejo { a, b }.
  const ganaB = render.tarjetaPartido({ ...base, penales: { a: 3, b: 4 } }, opts);
  const antesDelResultado = ganaB.slice(0, ganaB.indexOf("tp-resultado"));
  const despuesDelResultado = ganaB.slice(ganaB.indexOf("tp-resultado"));
  assert.doesNotMatch(antesDelResultado, /Ganador por penales/);
  assert.match(despuesDelResultado, /Ganador por penales/);
  assert.doesNotMatch(ganaB, /undefined/);
});

test("tarjetaPartido: con estado agrega un badge por equipo", () => {
  // El partido lo gana eq2: eq1 queda con 1 chance (perdedores) y eq2 con 2 (ganadores).
  const html = render.tarjetaPartido(
    { equipoA: "eq1", equipoB: "eq2", estado: "por jugar" },
    { nombres: NOMBRES, equipos: EQUIPOS, torneo: TORNEO, conEstado: true });
  assert.match(html, /badge per[^>]*>PER\./);
  assert.match(html, /badge gan[^>]*>GAN\./);
});

test("tarjetaPartido: sin conEstado no muestra badges aunque haya torneo", () => {
  const html = render.tarjetaPartido({ equipoA: "eq1", equipoB: "eq2", estado: "por jugar" },
    { nombres: NOMBRES, equipos: EQUIPOS, torneo: TORNEO, conEstado: false });
  assert.doesNotMatch(html, /badge gan/);
});

test("tarjetaPartido: pase libre muestra el equipo que pasa", () => {
  const html = render.tarjetaPartido({ estado: "pase-libre", equipoA: "eq1", equipoB: null },
    { nombres: NOMBRES, equipos: EQUIPOS });
  assert.match(html, /Pase libre/);
  assert.match(html, /Amistad FC pasa de ronda/);
  assert.match(html, /badge bye">Bye</);
});

test("tarjetaPartido: omitirSiPaseLibre devuelve vacío (así lo usa la home)", () => {
  const html = render.tarjetaPartido({ estado: "pase-libre", equipoA: "eq1", equipoB: null },
    { nombres: NOMBRES, equipos: EQUIPOS, omitirSiPaseLibre: true });
  assert.equal(html, "");
});

test("tarjetaPartido: equipo sin definir muestra 'por definir'", () => {
  const html = render.tarjetaPartido({ estado: "por jugar", equipoA: "eq1", equipoB: null },
    { nombres: NOMBRES, equipos: EQUIPOS });
  assert.match(html, /por definir/);
});

test("tarjetaPartido: escapa los nombres de equipo que vienen del JSON", () => {
  const nombres = { eq1: '<script>alert(1)</script>' };
  const html = render.tarjetaPartido({ estado: "por jugar", equipoA: "eq1", equipoB: "eq2" },
    { nombres, equipos: EQUIPOS });
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
});

test("tarjetaEquipo: fila con escudo, nombre y badge de estado", () => {
  // eq1 perdió una vez en zona ganadores → perdedores; eq2 sigue en ganadores.
  assert.match(render.tarjetaEquipo(EQUIPOS.eq1, 0, TORNEO), /badge per[^>]*>PER\./);
  assert.match(render.tarjetaEquipo(EQUIPOS.eq1, 0, TORNEO), /Amistad FC/);
  assert.match(render.tarjetaEquipo(EQUIPOS.eq1, 0, TORNEO), /<img class="equipo-escudo"/);
  assert.match(render.tarjetaEquipo({ id: "eq2", nombre: "Centenario" }, 0, TORNEO), /badge gan[^>]*>GAN\./);
  assert.doesNotMatch(render.tarjetaEquipo(EQUIPOS.eq1, 0, null), /badge/);
});

test("tablaGoleadores: ordena por goles y resuelve el nombre del equipo", () => {
  const html = render.tablaGoleadores(
    [{ jugador: "A", equipoId: "eq1", goles: 2 }, { jugador: "B", equipoId: "eq2", goles: 7 }],
    NOMBRES);
  assert.match(html, /<th>Jugador<\/th><th>Equipo<\/th><th>Goles<\/th>/);
  assert.ok(html.indexOf("B") < html.indexOf("A"));
  assert.match(html, /<td>Amistad FC<\/td>/);
});

test("estadoHTML: distingue el estado de error", () => {
  assert.match(render.estadoHTML("Cargando"), /class="estado"/);
  assert.match(render.estadoHTML("No se pudo cargar", "error"), /class="estado error"/);
});

test("zonaHTML: título de la zona + tarjetas + aviso si está vacía", () => {
  const conPartidos = render.zonaHTML("ganadores",
    [{ equipoA: "eq1", equipoB: "eq2", estado: "por jugar" }], { nombres: NOMBRES, equipos: EQUIPOS });
  assert.match(conPartidos, /zona-titulo ganadores">Zona Ganadores</);
  assert.match(conPartidos, /tarjeta-partido/);

  const vacia = render.zonaHTML("perdedores", [], { nombres: NOMBRES, equipos: EQUIPOS });
  assert.match(vacia, /Sin partidos en esta zona\./);
});
