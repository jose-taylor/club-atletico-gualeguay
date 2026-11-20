// Reglas de negocio del torneo (doble eliminación).
// Cada equipo arranca con 2 "chances": una derrota se lleva una chance y la
// segunda elimina. El estado visible se deriva de las chances: con 2 el equipo
// está en ganadores, con 1 en perdedores y con 0 queda eliminado.
// Módulo puro: sin DOM, sin Node, sin formato de salida. Lo usan el build,
// el navegador y las pruebas. Agregar una regla nueva va acá, en un solo lugar.

// Los penales se cargaron en dos formas: { a, b } y { golesA, golesB }.
// Se aceptan las dos para que el ganador del desempate no se pierda (y para
// que no se pinte un "undefined-undefined" en la tarjeta).
export function golesPenales(partido) {
  const p = partido?.penales;
  if (!p) return null;
  const a = p.a ?? p.golesA;
  const b = p.b ?? p.golesB;
  if (a == null || b == null) return null;
  return { a: Number(a), b: Number(b) };
}

// Lado ganador del partido: "A", "B" o null si no se puede definir
// (aún no se jugó, o no hay resultado ni penales en un empate).
export function ladoGanador(partido) {
  if (partido.estado !== "jugado" || !partido.resultado) return null;
  const r = partido.resultado;
  if (r.golesA !== r.golesB) return r.golesA > r.golesB ? "A" : "B";
  const penales = golesPenales(partido);
  if (penales) return penales.a > penales.b ? "A" : "B";
  return null;
}

// ¿Perdió este equipo en este partido? Solo cuenta si hay un ganador definido.
function perdio(partido, equipoId) {
  const lado = ladoGanador(partido);
  if (lado === null) return false;
  if (partido.equipoA === equipoId) return lado === "B";
  if (partido.equipoB === equipoId) return lado === "A";
  return false;
}

// Chances restantes de un equipo (todas arrancan en 2).
// Ronda 1 (zona iniciales) consume una chance al perder; en zona perdedores
// una derrota elimina directo.
export function chancesEquipo(torneo, equipoId) {
  let chances = 2;
  for (const ronda of torneo.rondas || []) {
    for (const partido of ronda.partidos || []) {
      if (partido.estado !== "jugado" || !perdio(partido, equipoId)) continue;
      if (ronda.zona === "perdedores") { chances = 0; continue; }
      chances -= 1;
    }
  }
  return Math.max(chances, 0);
}

// Estado visible del equipo según sus chances: "ganadores", "perdedores" o
// "eliminado". Es lo que muestran los badges (GAN. / PER. / ELIM.).
export function estadoEquipo(torneo, equipoId) {
  const chances = chancesEquipo(torneo, equipoId);
  if (chances >= 2) return "ganadores";
  if (chances === 1) return "perdedores";
  return "eliminado";
}

// En la ronda 1 todavía nadie muestra su estado: recién se define en las zonas.
export function mostrarEstado(zona) {
  return zona !== "iniciales";
}
