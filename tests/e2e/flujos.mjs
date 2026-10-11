/**
 * Prueba de punta a punta en modo demo (sin Supabase).
 * 1) npm run dev   2) CHROME_PATH="/ruta/a/chrome" npm run test:e2e
 * Usa datos en memoria: reiniciá el servidor antes de cada corrida.
 */
import puppeteer from 'puppeteer-core';
const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const executablePath = process.env.CHROME_PATH;
if (!executablePath) { console.error('Definí CHROME_PATH con la ruta a Chrome o Chromium.'); process.exit(1); }
const browser = await puppeteer.launch({ executablePath, headless: true, args: process.env.CI || process.getuid?.() === 0 ? ['--no-sandbox'] : [] });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844 });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
const as = async (who) => page.setCookie({ name: 'pesito_demo', value: who, domain: 'localhost', path: '/' });
const typeIn = async (sel, v) => { await page.$eval(sel, e => e.scrollIntoView({ block: 'center' })); await page.type(sel, v); };
const ok = (cond, msg) => { console.log((cond ? 'OK  ' : 'FAIL') + ' ' + msg); if (!cond) process.exitCode = 1; };
const text = () => page.evaluate(() => document.body.innerText);
const clickText = async (sel, t) => { const els = await page.$$(sel); for (const el of els) { if ((await el.evaluate(e => e.innerText)).includes(t)) { await el.evaluate(e => e.scrollIntoView({ block: 'center' })); await el.click(); return true; } } return false; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

// 1. Cupón: guardar, marcar usado, reportar
await as('usuario');
await page.goto(BASE + '/cupones/c-rayo', { waitUntil: 'networkidle0' });
ok((await text()).includes('EJEMPLO3K'), 'el cupón muestra el código');
ok((await text()).includes('App de Envío Rayo'), 'muestra la plataforma de registro externa');
await clickText('button', 'Marcar como usado'); await sleep(1500);
await clickText('main button', 'Guardar'); await sleep(1500);
await page.goto(BASE + '/guardados?ver=usados', { waitUntil: 'networkidle0' });
ok((await text()).includes('$3.000 de descuento en tu primer pedido'), 'el cupón aparece en Usados');
await page.goto(BASE + '/cupones/c-ceibo', { waitUntil: 'networkidle0' });
await sleep(800); await clickText('button', 'Reportar un problema'); await page.waitForSelector('input[value="codigo_invalido"]');
await page.$eval('input[value="codigo_invalido"]', (el) => el.scrollIntoView({ block: 'center' }));
await page.click('input[value="codigo_invalido"]'); await sleep(300);
await clickText('button', 'Enviar reporte'); await sleep(3000);
ok((await text()).includes('Vamos a revisar el cupón'), 'el reporte se envía');

// 2. Cumpleaños: guardar día y mes
await page.goto(BASE + '/cumple', { waitUntil: 'networkidle0' });
const t = new Date(); const d = t.getDate(), m = t.getMonth() + 1;
await page.select('select[name="month"]', String(m));
await page.select('select[name="day"]', String(d));
await clickText('button', 'Guardar mi cumpleaños'); await sleep(1500);
await page.goto(BASE + '/cumple', { waitUntil: 'networkidle0' });
const ct = await text();
ok(ct.includes('Hoy es tu día'), 'con el cumple de hoy, saluda');
ok(ct.includes('Disponible solo hoy'), 'el beneficio de solo-el-día figura disponible');

// 3. Sugerir una promo (con validaciones y antispam)
await page.goto(BASE + '/sugerir', { waitUntil: 'networkidle0' });
await clickText('button', 'Enviar sugerencia'); await sleep(1500);
ok((await text()).includes('Contanos en qué comercio es'), 'valida campos obligatorios');
await sleep(3200);
await typeIn('input[name="merchantName"]', 'Verdulería El Ombú');
await typeIn('input[name="wallet"]', 'MODO');
await typeIn('input[name="discountValue"]', '15');
await typeIn('input[name="capAmount"]', '2500');
await typeIn('input[name="sourceUrl"]', 'https://ombu.example.com/promo');
await clickText('button', 'Enviar sugerencia');
await page.waitForNavigation({ waitUntil: 'networkidle0' }).catch(() => {});
ok(page.url().endsWith('/sugerir/enviada'), 'la sugerencia se envía y redirige');
await page.goto(BASE + '/perfil', { waitUntil: 'networkidle0' });
ok((await text()).includes('15% de reintegro en Verdulería El Ombú con MODO'), 'aparece en Mis sugerencias como pendiente');
await page.goto(BASE + '/promos?q=ombu', { waitUntil: 'networkidle0' });
ok((await text()).includes('0 promos'), 'NO se publica automáticamente');

// 4. Admin: revisar, aprobar, publicar
await as('admin');
await page.goto(BASE + '/admin/revision?estado=pendiente&origen=usuario', { waitUntil: 'networkidle0' });
const link = await page.$$eval('a[href^="/admin/revision/s-"]', as => as.map(a => [a.getAttribute('href'), a.innerText]).find(x => x[1].includes('Ombú'))?.[0]);
ok(!!link, 'el admin ve la sugerencia');
await page.goto(BASE + link, { waitUntil: 'networkidle0' });
await clickText('button', 'Empezar revisión'); await sleep(1500);
await page.reload({ waitUntil: 'networkidle0' });
ok((await text()).includes('En revisión'), 'pasa a En revisión');
await clickText('button', 'Aprobar'); await sleep(1500);
await page.reload({ waitUntil: 'networkidle0' });
ok((await text()).includes('Aprobada'), 'queda Aprobada');
await clickText('button', 'Publicar promoción'); await sleep(2000);
ok((await text()).includes('Publicada'), 'se publica');
await page.goto(BASE + '/promos?q=ombu', { waitUntil: 'networkidle0' });
ok((await text()).includes('1 promo'), 'ahora la ve todo el mundo');

// 5. Duplicado: la misma promo publicada no se puede publicar dos veces
await as('usuario');
await page.goto(BASE + '/perfil', { waitUntil: 'networkidle0' });
ok((await text()).includes('Publicada'), 'la persona ve su sugerencia como Publicada');

// 6. Sin cuenta: no puede sugerir ni guardar
await as('anonimo');
await page.goto(BASE + '/sugerir', { waitUntil: 'networkidle0' });
ok((await text()).includes('Ingresá para sugerir'), 'sin cuenta pide ingresar para sugerir');
await page.goto(BASE + '/admin', { waitUntil: 'networkidle0' });
ok(page.url().includes('/ingresar'), 'el panel exige sesión');
await as('usuario');
await page.goto(BASE + '/admin', { waitUntil: 'networkidle0' });
ok((await text()).includes('solo para el equipo'), 'el panel bloquea a no-admins');

ok(errors.length === 0, 'sin errores de JS en el navegador ' + errors.join(' | '));
await browser.close();
