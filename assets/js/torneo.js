// Controlador de la página de un torneo.
// Lee la configuración del DOM (data-torneo-src), carga el JSON y delega el
// render a vistas-torneo.js. No sabe cómo se ve nada: solo cuándo se muestra.

import { profundidadDeRutaRelativa } from "./lib/rutas.js";
import { rondasAgrupadas } from "./lib/data.js";
import { estadoHTML } from "./lib/render.js";
import { vistaCuadro, vistaFixture, vistaEquipos, vistaGoleadores } from "./vistas-torneo.js";

const panel = document.getElementById("vista-torneo");
const origen = panel?.dataset.torneoSrc;
if (panel && origen) iniciar(panel, origen);

async function iniciar(panel, url) {
  // La profundidad se deduce de la ruta relativa del JSON (../ por carpeta),
  // no de location.pathname: así el sitio sirve igual en la raíz (localhost,
  // dominio propio) o bajo una subcarpeta como GitHub Pages.
  const profundidad = profundidadDeRutaRelativa(url);
  const tabs = [...document.querySelectorAll('.tabs [role="tab"]')];
  const otrasUrls = (panel.dataset.otrasEdiciones || "").trim().split(/\s+/).filter(Boolean);
  const estado = { torneo: null, otras: [], vista: "cuadro", ronda: null };

  const pintar = () => {
    // La primera vez que se pinta el Cuadro se muestra la última ronda cargada.
    if (estado.ronda === null) {
      estado.ronda = Math.max(rondasAgrupadas(estado.torneo).length - 1, 0);
    }
    panel.innerHTML = renderVista();
    panel.setAttribute("aria-labelledby", `tab-${estado.vista}`);
    // Entrada suave del contenido re-renderizado (CSS #vista-torneo.vista-anim):
    // al reiniciar la clase el navegador reanima, en cada cambio de vista.
    panel.classList.remove("vista-anim");
    void panel.offsetWidth; // fuerza el reflow para reiniciar la animación
    panel.classList.add("vista-anim");
    conectarBotonesRonda();
  };

  function renderVista() {
    const { torneo, otras, vista, ronda } = estado;
    if (vista === "fixture") return vistaFixture(torneo, profundidad, otras);
    if (vista === "equipos") return vistaEquipos(torneo, profundidad);
    if (vista === "goleadores") return vistaGoleadores(torneo);
    return vistaCuadro(torneo, ronda, profundidad);
  }

  // Los botones de ronda se recrean en cada pintado, así que hay que religarlos.
  function conectarBotonesRonda() {
    panel.querySelectorAll("[data-ronda]").forEach((btn) => {
      btn.addEventListener("click", () => {
        estado.ronda += Number(btn.dataset.ronda);
        pintar();
      });
    });
  }

  for (const tab of tabs) {
    tab.addEventListener("click", () => {
      for (const t of tabs) {
        const activo = t === tab;
        t.classList.toggle("on", activo);
        t.setAttribute("aria-selected", String(activo));
      }
      estado.vista = tab.dataset.vista;
      pintar();
    });
  }

  // Si falla una edición hermana el fixture sigue funcionando con la propia.
  const cargar = async (origen) => {
    const respuesta = await fetch(origen, { cache: "no-cache" });
    if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
    return respuesta.json();
  };

  try {
    const [propio, ...hermanas] = await Promise.all([
      cargar(url),
      ...otrasUrls.map((origen) => cargar(origen).catch((error) => {
        console.warn("torneo: no se pudo cargar la edición hermana", origen, error);
        return null;
      })),
    ]);
    estado.torneo = propio;
    estado.otras = hermanas.filter(Boolean);
    pintar();
  } catch (error) {
    panel.innerHTML = estadoHTML("No se pudo cargar el torneo. Reintentá más tarde.", "error");
    console.error("torneo: no se pudo cargar", url, error);
  }
}
