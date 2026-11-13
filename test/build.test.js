// Test de integración: corre el build real y verifica el contenido de dist/.
// Es la red de seguridad del generador: si un refactor rompe una página,
// falla acá y no en producción.

import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const RAIZ = path.join(import.meta.dirname, "..");
const DIST = path.join(RAIZ, "dist");

const leer = (rel) => fs.readFileSync(path.join(DIST, rel), "utf8");
const paginas = () =>
  fs.readdirSync(DIST, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith(".html"))
    .map((e) => path.relative(DIST, path.join(e.parentPath, e.name)).split(path.sep).join("/"));

before(() => {
  execFileSync(process.execPath, ["build.js"], { cwd: RAIZ, stdio: "pipe" });
}, { timeout: 60000 });

test("build: genera el sitio completo", () => {
  const esperadas = [
    "index.html",
    "404.html",
    "contacto.html",
    "instalaciones.html",
    "noticias/index.html",
    "torneos/index.html",
    "torneos/libres/26-27/index.html",
    "torneos/veteranos/26-27/index.html",
  ];
  for (const p of esperadas) assert.ok(fs.existsSync(path.join(DIST, p)), `falta ${p}`);
});

test("build: una página de noticia por noticia, con su slug", () => {
  const paginasNoticias = paginas().filter((p) => p.startsWith("noticias/") && p !== "noticias/index.html");
  const esperadas = [
    "noticias/inscripciones-abiertas-torneo-de-futbol-7-nocturno-2026-27-2.html",
    "noticias/presentacion-xiii-edicion-de-futbol-7-libre-y-iv-edicion-de-futbol-veteranos-1.html",
  ];
  for (const p of esperadas) assert.ok(paginasNoticias.includes(p), `falta ${p}`);
});

test("build: no deja marcadores sin reemplazar en ninguna página", () => {
  for (const p of paginas()) {
    const html = leer(p);
    assert.doesNotMatch(html, /<!--[A-Z_]+-->/, `quedó un marcador sin reemplazar en ${p}`);
  }
});

test("build: no deja placeholders de assets sin resolver", () => {
  for (const p of paginas()) assert.doesNotMatch(leer(p), /ASSETS_ROOT|\{\{/, `placeholder sin resolver en ${p}`);
});

test("build: .nojekyll para que GitHub Pages no toque los assets", () => {
  assert.ok(fs.existsSync(path.join(DIST, ".nojekyll")));
});

test("build: copia los módulos compartidos que el navegador importa", () => {
  for (const m of ["data.js", "render.js", "rutas.js", "texto.js", "torneo-modelo.js"]) {
    assert.ok(fs.existsSync(path.join(DIST, "assets", "js", "lib", m)), `falta assets/js/lib/${m}`);
  }
});

test("build: copia data/ para que el navegador pueda hacer fetch", () => {
  assert.ok(fs.existsSync(path.join(DIST, "data", "torneos", "libres-26-27.json")));
  assert.ok(fs.existsSync(path.join(DIST, "data", "sitio.json")));
});

test("build: los módulos compartidos son los mismos en lib/ y en dist/", () => {
  for (const m of ["data.js", "render.js", "rutas.js", "texto.js", "torneo-modelo.js"]) {
    const origen = fs.readFileSync(path.join(RAIZ, "lib", m), "utf8");
    const copia = fs.readFileSync(path.join(DIST, "assets", "js", "lib", m), "utf8");
    assert.equal(copia, origen, `dist/assets/js/lib/${m} difiere de lib/${m}`);
  }
});

test("build: los módulos compartidos no importan nada de Node", () => {
  for (const m of ["data.js", "render.js", "rutas.js", "texto.js", "torneo-modelo.js"]) {
    const codigo = fs.readFileSync(path.join(RAIZ, "lib", m), "utf8");
    assert.doesNotMatch(codigo, /from\s+["']node:/, `lib/${m} importa un módulo de Node`);
    assert.doesNotMatch(codigo, /\brequire\(/, `lib/${m} usa require()`);
  }
});

test("build: las rutas relativas son correctas según la profundidad de cada página", () => {
  assert.match(leer("index.html"), /href="assets\/css\/styles\.css"/);
  assert.match(leer("noticias/index.html"), /href="\.\.\/assets\/css\/styles\.css"/);
  const edicion = leer("torneos/libres/26-27/index.html");
  assert.match(edicion, /href="\.\.\/\.\.\/\.\.\/assets\/css\/styles\.css"/);
  assert.match(edicion, /data-torneo-src="\.\.\/\.\.\/\.\.\/data\/torneos\/libres-26-27\.json"/);
});

test("build: los scripts se cargan como módulos ES", () => {
  assert.match(leer("index.html"), /<script type="module" src="assets\/js\/main\.js">/);
});

test("build: cada página tiene un solo h1 y su título", () => {
  for (const p of paginas()) {
    const html = leer(p);
    assert.equal((html.match(/<h1[\s>]/g) || []).length, 1, `${p} debería tener un solo h1`);
    assert.match(html, /<title>[^<]+<\/title>/, `${p} sin title`);
  }
});

test("build: la home muestra las ediciones vigentes", () => {
  const html = leer("index.html");
  assert.match(html, /Libres · Edición <b class="ed-num">26\/27<\/b>/);
  assert.match(html, /Veteranos · Edición <b class="ed-num">26\/27<\/b>/);
  assert.match(html, /Próximos partidos/);
  assert.doesNotMatch(html, /<a[^>]+href="assets\/img/); // los escudos no son enlaces
});

test("build: la home refleja si hay o no partidos cargados", () => {
  const html = leer("index.html");
  if (/class="tarjeta-partido"/.test(html)) {
    // Con partidos: escudos resueltos y fechas en español.
    assert.match(html, /<img class="equipo-escudo" src="[^"]+"/);
    assert.match(html, /de \p{L}+ de \d{4}/u);
  } else {
    // Sin partidos (arranque de temporada): avisos de vacío.
    assert.match(html, /Todavía no hay partidos programados/);
    assert.match(html, /Todavía no hay resultados cargados/);
  }
});

test("build: el hero de la home lleva la cinta y el sello, con los datos reales", () => {
  const html = leer("index.html");
  const hero = html.match(/<section class="hero hero-afiche">([\s\S]*?)<\/section>/)?.[1] ?? "";
  // Los dos decorativos del afiche, ocultos para el lector de pantalla.
  assert.match(hero, /<div class="hero-cinta" aria-hidden="true">/);
  assert.match(hero, /<div class="hero-sello" aria-hidden="true">/);
  // La cinta repite el texto para que el bucle no se note: dos spans iguales.
  const tramos = hero.match(/<div class="hero-cinta-pista">([\s\S]*?)<\/div>/)?.[1] ?? "";
  const spans = tramos.match(/<span>[\s\S]*?<\/span>/g) ?? [];
  assert.equal(spans.length, 2, "la cinta necesita dos copias para el bucle");
  assert.equal(spans[0], spans[1], "las dos copias tienen que ser idénticas");
  // Y los datos vienen de sitio.json, no escritos a mano.
  assert.match(tramos, /Calle H\. IRYGOYEN 1490/);
  assert.match(tramos, /Villaguay, Entre Ríos · 26\/27/);
  assert.match(hero, /<b>F7<\/b><span>Nocturno · 26\/27<\/span>/);
});

test("build: el índice de torneos tiene un botón por edición", () => {
  const html = leer("torneos/index.html");
  // Una edición = un botón con la categoría y la edición adentro.
  assert.match(html, /class="bt-nombre">Libres</);
  assert.match(html, /class="bt-nombre">Veteranos</);
  assert.match(html, /href="libres\/26-27\/index\.html" data-reveal/);
  assert.match(html, /href="veteranos\/26-27\/index\.html" data-reveal/);
  assert.match(html, /class="bt-num">26\/27</);
  assert.match(html, /badge vigente">vigente</);
  // La lista vieja (paneles con <h2> y <ul>) ya no está.
  assert.doesNotMatch(html, /class="categoria"/);
});

test("build: el selector marca la edición activa y la identifica como actual", () => {
  const html = leer("torneos/libres/26-27/index.html");
  assert.match(html, /Edición <b class="ed-num ed-num--sm">26\/27<\/b> · vigente/);

  const selector = html.match(/<div class="selector-ediciones">([\s\S]*?)<\/div>/)?.[1] ?? "";
  assert.equal((selector.match(/class="tab on"/g) || []).length, 1, "solo una edición activa");
  assert.match(selector, /aria-current="page"/);

  // Las ediciones hermanas se enlazan con .. (../<edicion>/index.html).
  const hermanas = paginas().filter((p) => /torneos\/libres\/(?!26-27)/.test(p));
  assert.ok(/href="\.\.\/\d{2}-\d{2}\/index\.html"/.test(selector) || hermanas.length === 0,
    "con varias ediciones, las demás deben enlazarse como ..");
});

test("build: la lista de noticias enlaza al detalle", () => {
  const html = leer("noticias/index.html");
  // El listado no corta por año: la fecha va en cada tarjeta.
  assert.doesNotMatch(html, /archivo-anio/);
  assert.match(html, /href="presentacion-xiii-edicion-de-futbol-7-libre-y-iv-edicion-de-futbol-veteranos-1\.html"/);
  // Nota con foto propia: la banda apaisada de siempre, en diferido.
  assert.match(html, /class="nota-img" src="\.\.\/assets\/img\/noticia-1\.jpg" alt="" loading="lazy"/);
  assert.doesNotMatch(html, /placeholder/);
});

test("build: las noticias nuevas (id mayor) aparecen primero", () => {
  const html = leer("noticias/index.html");
  const nueva = html.indexOf("inscripciones-abiertas-torneo-de-futbol-7-nocturno-2026-27-2.html");
  const vieja = html.indexOf("presentacion-xiii-edicion-de-futbol-7-libre-y-iv-edicion-de-futbol-veteranos-1.html");
  assert.ok(nueva !== -1 && vieja !== -1, "faltan enlaces a las noticias");
  assert.ok(nueva < vieja, "la noticia con id mayor debe aparecer primero");
});

test("build: la home muestra las 2 noticias con id más alto", () => {
  const html = leer("index.html");
  const ids = [...html.matchAll(/href="noticias\/[^"]+-(\d+)\.html"/g)]
    .map((m) => Number(m[1]));
  const esperados = JSON.parse(fs.readFileSync(path.join(RAIZ, "data/noticias.json"), "utf8"))
    .map((n) => Number(n.id))
    .sort((a, b) => b - a)
    .slice(0, 2);
  assert.deepEqual(ids, esperados);
});

test("build: el detalle de la noticia arma los párrafos y la imagen", () => {
  const html = leer("noticias/presentacion-xiii-edicion-de-futbol-7-libre-y-iv-edicion-de-futbol-veteranos-1.html");
  assert.match(html, /<h1[^>]*>Presentación: XIII Edición de Fútbol 7 Libre y IV Edición de Fútbol Veteranos<\/h1>/);
  assert.ok((html.match(/<p>/g) || []).length >= 3, "esperaba al menos 3 párrafos");
  assert.match(html, /class="nota-img[^"]*" src="\.\.\/assets\/img\/noticia-1\.jpg"/);
});

test("build: la home y el detalle escapan los datos que vienen del JSON", () => {
  const html = leer("noticias/presentacion-xiii-edicion-de-futbol-7-libre-y-iv-edicion-de-futbol-veteranos-1.html");
  assert.doesNotMatch(html, /<script>alert/);
});

test("build: contacto no tiene formulario (no hay backend)", () => {
  const html = leer("contacto.html");
  assert.doesNotMatch(html, /<form/i);
  assert.doesNotMatch(html, /action=/i);
});

test("build: el header y el footer están en todas las páginas", () => {
  for (const p of ["index.html", "contacto.html", "noticias/index.html", "torneos/libres/26-27/index.html"]) {
    const html = leer(p);
    assert.match(html, /class="site-header"/, `sin header en ${p}`);
    assert.match(html, /class="site-footer"/, `sin footer en ${p}`);
    assert.match(html, /assets\/img\/escudo-club\.png/, `sin escudo en ${p}`);
  }
});
