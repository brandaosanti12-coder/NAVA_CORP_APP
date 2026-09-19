/* =========================================================
   NAVA CORP · Modo claro / oscuro
   Se incluye con:  <script src="js/tema.js"></script>
   El botón se crea solo (esquina inferior izquierda).
   La preferencia se guarda en el navegador del usuario.
   ========================================================= */
(function () {
  var KEY = 'nava_tema';

  function leer() {
    try { return localStorage.getItem(KEY); } catch (e) { return null; }
  }
  function guardar(t) {
    try { localStorage.setItem(KEY, t); } catch (e) {}
  }

  function pintarBoton(tema) {
    var b = document.getElementById('btn-tema');
    if (!b) return;
    var claro = tema === 'light';
    b.textContent = claro ? '\u263D' : '\u2600';
    b.setAttribute('title', claro ? 'Cambiar a modo oscuro' : 'Cambiar a modo claro');
    b.setAttribute('aria-label', b.getAttribute('title'));
  }

  function aplicar(tema) {
    document.documentElement.setAttribute('data-theme', tema);
    pintarBoton(tema);
  }

  /* Se aplica de inmediato para que no haya parpadeo al cargar */
  aplicar(leer() === 'light' ? 'light' : 'dark');

  window.cambiarTema = function () {
    var actual = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
    var nuevo = actual === 'light' ? 'dark' : 'light';
    guardar(nuevo);
    aplicar(nuevo);
  };

  document.addEventListener('DOMContentLoaded', function () {
    if (!document.getElementById('btn-tema')) {
      var b = document.createElement('button');
      b.id = 'btn-tema';
      b.type = 'button';
      b.className = 'btn-tema';
      b.addEventListener('click', window.cambiarTema);
      document.body.appendChild(b);
    }
    pintarBoton(document.documentElement.getAttribute('data-theme'));
  });
})();
