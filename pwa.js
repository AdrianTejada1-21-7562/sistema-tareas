// Registro de la app instalable, botón "Instalar" y botón "Activar avisos".
(() => {
    // Llave pública de los avisos (la privada solo está en los secretos de GitHub).
    const VAPID_PUBLICA = 'BBGpqOEEaC0CZ3iLD95kU5aLjxbWpXB_CMSuPovUNusScQQQHGA0g9zQClEwu98Q-pJ79iD0h6uDdKi4kyc_A50';

    const aBytes = (b64) => {
        const texto = atob((b64 + '='.repeat((4 - b64.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
        return Uint8Array.from(texto, (c) => c.charCodeAt(0));
    };

    // Deja el teléfono anotado junto a los datos, para que el revisor diario sepa a quién avisar.
    const registrarTelefono = (sub) => {
        const { endpoint, keys } = sub.toJSON();
        if (state.pushSubs.some((t) => t.id === endpoint)) return;
        state.pushSubs.push({ id: endpoint, keys, creado: new Date().toISOString() });
        saveData();
    };

    const prepararAvisos = async () => {
        const boton = document.getElementById('avisosBtn');
        if (!boton || !('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return;
        const reg = await navigator.serviceWorker.ready;
        const actual = await reg.pushManager.getSubscription();
        if (actual && Notification.permission === 'granted') {
            registrarTelefono(actual);
            return;
        }
        boton.hidden = false;
        boton.addEventListener('click', async () => {
            try {
                const permiso = await Notification.requestPermission();
                if (permiso !== 'granted') {
                    alert('Los avisos están bloqueados. Actívalos en los ajustes de notificaciones de este sitio.');
                    return;
                }
                const sub = await reg.pushManager.getSubscription() || await reg.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: aBytes(VAPID_PUBLICA)
                });
                registrarTelefono(sub);
                boton.hidden = true;
                reg.showNotification('Avisos activados', {
                    body: 'Te avisaremos varias veces al día de lo vencido y lo próximo a vencer.',
                    icon: 'icons/icon-192.png'
                });
            } catch (err) {
                console.error('Avisos:', err);
                alert('No se pudieron activar los avisos. Revisa tu conexión e inténtalo de nuevo.');
            }
        });
    };
    prepararAvisos().catch((err) => console.error('Avisos:', err));

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
