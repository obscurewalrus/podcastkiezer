// Registreer de service worker zodra de pagina geladen is. Faalt
// stilletjes als de browser het niet ondersteunt of als er iets misgaat
// — de site blijft sowieso werken zonder.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.warn("Service worker registratie mislukt:", err);
    });
  });
}
