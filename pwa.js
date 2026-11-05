// Registro de la app instalable y botón "Instalar".
(() => {
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('sw.js').catch((err) => console.error('Service worker:', err));
        });
    }

    const yaInstalada = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    if (yaInstalada) return;

    const boton = document.getElementById('installAppBtn');
    if (!boton) return;

    let aviso = null;
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        aviso = e;
        boton.hidden = false;
    });
    window.addEventListener('appinstalled', () => { boton.hidden = true; });

    // iPhone no tiene aviso de instalación: hay que indicar el paso en Safari.
    const esIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (esIOS) boton.hidden = false;

    boton.addEventListener('click', async () => {
        if (aviso) {
            aviso.prompt();
            await aviso.userChoice;
            aviso = null;
            boton.hidden = true;
        } else if (esIOS) {
            alert('Para instalarla en iPhone: abre esta página en Safari, toca Compartir y luego "Añadir a pantalla de inicio".');
        }
    });
})();
