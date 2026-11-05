// Cambia entre las secciones de la app según la dirección (#inicio, #tareas...),
// de modo que el botón Atrás del teléfono y los enlaces directos funcionen.
(() => {
    const vistas = [...document.querySelectorAll('.vista')];
    const enlaces = [...document.querySelectorAll('[data-nav]')];
    const titulo = document.getElementById('vistaTitulo');

    const mostrar = (mover) => {
        const pedida = location.hash.slice(1);
        const actual = vistas.find((v) => v.dataset.vista === pedida) || vistas[0];
        vistas.forEach((v) => { v.hidden = v !== actual; });
        enlaces.forEach((a) => {
            if (a.dataset.nav === actual.dataset.vista) a.setAttribute('aria-current', 'page');
            else a.removeAttribute('aria-current');
        });
        titulo.textContent = actual.dataset.titulo;
        document.title = `${actual.dataset.titulo} · Sistema de Tareas`;
        if (mover) {
            window.scrollTo(0, 0);
            titulo.focus({ preventScroll: true });
        }
    };

    window.addEventListener('hashchange', () => mostrar(true));
    mostrar(false);
})();
