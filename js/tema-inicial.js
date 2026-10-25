/*
 * Ringua · Tema inicial
 * Script clásico (no módulo) que se ejecuta en el <head> antes de pintar la
 * página. Lee el tema guardado y lo aplica enseguida para evitar el destello
 * de color claro al abrir la app en modo oscuro.
 */
(function () {
  var tema = 'sistema';
  try {
    var ajustes = JSON.parse(localStorage.getItem('ringua:ajustes'));
    if (ajustes && ajustes.tema) {
      tema = ajustes.tema;
    }
  } catch (error) {
    // Sin acceso a localStorage: se usa el tema del sistema
  }

  var sistemaOscuro = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  var oscuro = tema === 'oscuro' || (tema === 'sistema' && sistemaOscuro);
  document.documentElement.setAttribute('data-bs-theme', oscuro ? 'dark' : 'light');
})();
