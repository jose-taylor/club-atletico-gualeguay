import { test } from "node:test";
import assert from "node:assert/strict";
import { escapeHtml, slugify, formatFecha, formatFechaDia, fechaISO } from "../lib/texto.js";

test("escapeHtml: escapa caracteres HTML", () => {
  assert.equal(escapeHtml('<b class="x">A & B</b>'), "&lt;b class=&quot;x&quot;&gt;A &amp; B&lt;/b&gt;");
  assert.equal(escapeHtml("'comillas'"), "&#39;comillas&#39;");
  assert.equal(escapeHtml(42), "42");
});

test("slugify: normaliza tildes, mayúsculas, signos y espacios", () => {
  assert.equal(slugify("Club Atlético Gualeguay 26/27"), "club-atletico-gualeguay-26-27");
  assert.equal(slugify("  Nota de Prensa!  "), "nota-de-prensa");
  assert.equal(slugify("Río Uruguay"), "rio-uruguay");
  assert.equal(slugify("---"), "");
});

test("fechaISO: acepta ISO y formato argentino, descarta placeholders", () => {
  assert.equal(fechaISO("2026-11-24"), "2026-11-24");
  assert.equal(fechaISO("25-11-2026"), "2026-11-25");
  assert.equal(fechaISO("--"), "");
  assert.equal(fechaISO(""), "");
  assert.equal(fechaISO(null), "");
  assert.equal(fechaISO("2026-13-01"), "");
});

test("formatFecha: ISO a formato español", () => {
  assert.equal(formatFecha("2026-10-03"), "3 de octubre de 2026");
  assert.equal(formatFecha("2026-01-01"), "1 de enero de 2026");
  assert.equal(formatFecha("2026-12-31"), "31 de diciembre de 2026");
  assert.equal(formatFecha("25-11-2026"), "25 de noviembre de 2026");
  assert.equal(formatFecha("--"), "Fecha a definir");
});

test("formatFechaDia: agrega el día de la semana", () => {
  assert.equal(formatFechaDia("2026-10-03"), "Sábado 3 de octubre de 2026");
  assert.equal(formatFechaDia("2026-01-01"), "Jueves 1 de enero de 2026");
  assert.equal(formatFechaDia("2026-11-11"), "Miércoles 11 de noviembre de 2026");
  assert.equal(formatFechaDia("25-11-2026"), "Miércoles 25 de noviembre de 2026");
  assert.equal(formatFechaDia("--"), "Fecha a definir");
  assert.equal(formatFechaDia(""), "Fecha a definir");
});
