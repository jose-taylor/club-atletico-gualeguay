// Helpers de texto y fecha. Módulo puro: lo usan el build, el navegador y las pruebas.
// Vive aparte de lib/utils.js (que toca el disco) para poder servirse al navegador.

export function escapeHtml(valor) {
  return String(valor)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// "Club Atlético Gualeguay 26/27" -> "club-atletico-gualeguay-26-27"
export function slugify(texto) {
  return String(texto)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

const DIAS = [
  "Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado",
];

// Las fechas llegan en ISO (2026-11-24) o en formato argentino (24-11-2026).
// "--", "" y cualquier otro valor no se consideran fechas. Se normaliza todo
// a ISO para ordenar y mostrar con una sola regla.
function fechaValida(anio, mes, dia) {
  const f = new Date(Date.UTC(anio, mes - 1, dia));
  return f.getUTCFullYear() === anio && f.getUTCMonth() === mes - 1 && f.getUTCDate() === dia;
}

export function fechaISO(valor) {
  const texto = String(valor ?? "").trim();
  const iso = texto.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    const [, a, m, d] = iso;
    return fechaValida(Number(a), Number(m), Number(d))
      ? `${a}-${m.padStart(2, "0")}-${d.padStart(2, "0")}` : "";
  }
  const argentina = texto.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (argentina) {
    const [, d, m, a] = argentina;
    return fechaValida(Number(a), Number(m), Number(d))
      ? `${a}-${m.padStart(2, "0")}-${d.padStart(2, "0")}` : "";
  }
  return "";
}

// "2026-10-03" -> "3 de octubre de 2026"
export function formatFecha(iso) {
  const fecha = fechaISO(iso);
  if (!fecha) return "Fecha a definir";
  const [a, m, d] = fecha.split("-").map(Number);
  return `${d} de ${MESES[m - 1]} de ${a}`;
}

// "2026-10-03" -> "Sábado 3 de octubre de 2026"
export function formatFechaDia(iso) {
  const fecha = fechaISO(iso);
  if (!fecha) return "Fecha a definir";
  const [a, m, d] = fecha.split("-").map(Number);
  // En UTC para que el día de la semana no dependa de la zona horaria.
  const dia = DIAS[new Date(Date.UTC(a, m - 1, d)).getUTCDay()];
  return `${dia} ${d} de ${MESES[m - 1]} de ${a}`;
}

// Piezas de una fecha ISO, para armar la fecha "de cartel" del listado de
// noticias (día grande + mes y año chicos). El texto corrido sigue usando
// formatFecha; esto separa las partes para poder tratarlas distinto.
export function partesFecha(iso) {
  const [anio, mes, dia] = String(iso).split("-").map(Number);
  return { dia, mes: MESES[mes - 1], anio };
}
