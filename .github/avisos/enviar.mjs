// Corre varias veces al día en GitHub Actions: busca lo vencido y lo que vence en los próximos días
// y manda el aviso a cada teléfono registrado.
// El repositorio es público y sus registros también: nunca imprimir nombres ni datos aquí.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const DIAS_DE_AVISO = 3; // la misma regla que pinta en rojo la tabla de Personas
const MAX_LINEAS = 8;

export const hoyEnRD = (fecha = new Date()) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santo_Domingo' }).format(fecha);

const diasEntre = (desde, hasta) => {
    const dia = (s) => {
        const [y, m, d] = s.split('-').map(Number);
        return Date.UTC(y, m - 1, d);
    };
    return Math.round((dia(hasta) - dia(desde)) / 86400000);
};

// Lo vencido (sin límite de antigüedad), lo de hoy y lo de los próximos días; lo más atrasado primero.
export const proximos = (personas, hoy, dias = DIAS_DE_AVISO) =>
    (personas || [])
        .filter(p => /^\d{4}-\d{2}-\d{2}$/.test(p.nextDate || ''))
        .map(p => ({ nombre: (p.name || '').trim() || 'Sin nombre', dias: diasEntre(hoy, p.nextDate) }))
        .filter(p => p.dias <= dias)
        .sort((a, b) => a.dias - b.dias || a.nombre.localeCompare(b.nombre));

const cuando = (d) => {
    if (d < -1) return `VENCIDA hace ${-d} días`;
    if (d === -1) return 'VENCIDA ayer';
    if (d === 0) return 'vence HOY';
    return d === 1 ? 'mañana' : `en ${d} días`;
};

const titular = (lista) => {
    const vencidas = lista.filter(p => p.dias < 0).length;
    const hoy = lista.filter(p => p.dias === 0).length;
    if (vencidas > 0) return `SUPER URGENTE: ${vencidas} ${vencidas === 1 ? 'vencida' : 'vencidas'}`;
    if (hoy > 0) return `URGENTE: ${hoy} ${hoy === 1 ? 'vence' : 'vencen'} hoy`;
    return lista.length === 1 ? '1 próxima a vencer' : `${lista.length} próximas a vencer`;
};

export const armarAviso = (lista, hoy) => {
    const lineas = lista.slice(0, MAX_LINEAS).map(p => `${p.nombre}: ${cuando(p.dias)}`);
    if (lista.length > MAX_LINEAS) lineas.push(`y ${lista.length - MAX_LINEAS} más`);
    return {
        titulo: titular(lista),
        cuerpo: lineas.join('\n'),
        tag: 'vencimientos', // el aviso nuevo reemplaza al anterior y vuelve a sonar
        url: 'index.html'
    };
};

export const leerNube = async (url) => {
    const resp = await fetch(`${url}?action=load&callback=cb`);
    if (!resp.ok) throw new Error(`La nube respondió ${resp.status}`);
    const texto = await resp.text();
    const inicio = texto.indexOf('(');
    const fin = texto.lastIndexOf(')');
    if (inicio < 0 || fin < inicio) throw new Error('Respuesta de la nube no reconocida');
    return JSON.parse(texto.slice(inicio + 1, fin));
};

const principal = async () => {
    const { default: webpush } = await import('web-push');
    const privada = process.env.VAPID_PRIVADA;
    if (!privada) throw new Error('Falta el secreto VAPID_PRIVADA');

    const appJs = readFileSync('app.js', 'utf8');
    const pwaJs = readFileSync('pwa.js', 'utf8');
    const urlNube = appJs.match(/const WEB_APP_URL = "([^"]+)"/)?.[1];
    const publica = pwaJs.match(/const VAPID_PUBLICA = '([^']+)'/)?.[1];
    if (!urlNube || !publica) throw new Error('No se encontró la configuración en app.js o pwa.js');

    const datos = await leerNube(urlNube);
    const hoy = hoyEnRD();
    const lista = proximos(datos.people, hoy);
    const telefonos = datos.pushSubs || [];
    console.log(`Para avisar: ${lista.length}. Teléfonos registrados: ${telefonos.length}.`);
    if (lista.length === 0 || telefonos.length === 0) return;

    webpush.setVapidDetails('https://adriantejada1-21-7562.github.io/sistema-tareas/', publica, privada);
    const aviso = JSON.stringify(armarAviso(lista, hoy));
    const resultados = await Promise.allSettled(telefonos.map(t =>
        webpush.sendNotification({ endpoint: t.id, keys: t.keys }, aviso, { TTL: 14400, urgency: 'high' })));

    const fallos = resultados.filter(r => r.status === 'rejected');
    // 404/410 = ese teléfono ya no existe (reinstalación); no es un error del envío.
    const caducados = fallos.filter(r => [404, 410].includes(r.reason?.statusCode)).length;
    console.log(`Enviados: ${resultados.length - fallos.length}. Caducados: ${caducados}. Fallidos: ${fallos.length - caducados}.`);
    if (fallos.length > caducados) {
        console.log(`Códigos de error: ${fallos.map(r => r.reason?.statusCode ?? 'red').join(', ')}`);
        process.exitCode = 1; // GitHub avisa por correo de que el envío falló
    }
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    principal().catch((err) => {
        console.error(err.message);
        process.exit(1);
    });
}
