'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { demos, channels, seededCases } = require('../demo.js');

const root = path.resolve(__dirname, '..');
const incoming = 'Адрес отличается от официального. На учебном снимке видны признаки, описанные в карточке.';
const home = process.env.TEST_BASE_URL || pathToFileURL(path.join(root, 'index.html')).href;
const storageKey = 'kib08-brand-desk-v1';
const casePhoto = serial => path.join(root, 'assets', 'case-' + serial + '.png');

async function createFullCase(page, data, file) {
  await page.getByRole('button', { name: 'Заполнить всё сразу' }).click();
  const form = page.locator('#new-form');
  await form.locator('[name=title]').fill(data.title);
  await form.locator('[name=platform]').selectOption(data.platform);
  await form.locator('[name=kind]').selectOption(data.kind);
  await form.locator('[name=url]').fill(data.url);
  await form.locator('[name=date]').fill(data.date);
  await form.locator('[name=details]').fill(data.details);
  if (file) await form.locator('[name=evidence]').setInputFiles(file);
  await page.getByRole('button', { name: 'Добавить в журнал', exact: true }).click();
}

async function review(page, status = 'ready', checks = true) {
  const form = page.locator('.review-form');
  if (checks) {
    for (const check of await form.getByRole('checkbox').all()) await check.check();
  }
  await form.getByLabel('Итог').selectOption(status);
  await form.getByLabel('Пояснение').fill(incoming);
  await form.getByRole('button', { name: 'Сохранить решение' }).click();
}

async function readDownload(page) {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Скачать черновик' }).click();
  return fs.readFile(await (await pending).path(), 'utf8');
}

async function closeCase(page) {
  await page.getByRole('button', { name: 'Закрыть карточку', exact: true }).click();
  await page.locator('#case-drawer').waitFor({ state: 'hidden' });
}

async function screenshot(page, name) {
  if (process.env.SCREENSHOT_DIR) {
    await fs.mkdir(process.env.SCREENSHOT_DIR, { recursive: true });
    await page.screenshot({ path: path.join(process.env.SCREENSHOT_DIR, name) });
  }
}

async function newContext(browser, stored) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 980 }, acceptDownloads: true });
  if (stored !== undefined) {
    await context.addInitScript(({ key, value }) => {
      if (localStorage.getItem(key) === null) localStorage.setItem(key, JSON.stringify(value));
    }, { key: storageKey, value: stored });
  }
  return context;
}

async function testWorkspace(page) {
  await page.goto(home);
  await page.locator('.case-row').first().waitFor();
  assert.equal(await page.title(), 'Реестр обращений');
  assert.equal(await page.locator('#workspace-name').textContent(), 'Компания А');
  assert.equal(await page.getByRole('table', { name: 'Журнал случаев' }).count(), 1);
  assert.equal(await page.locator('.case-row').count(), 10);
  assert.deepEqual(await page.locator('.case-open').allTextContents(), seededCases.map(item => item.title));
  assert.equal(await page.getByRole('button', { name: 'Сохранить случай', exact: true }).isDisabled(), true);
  await screenshot(page, 'desktop.png');

  const readyMetric = page.locator('[data-metric=ready]');
  assert.ok(await page.locator('[data-metric=intake] .metric-dot').evaluate(dot => dot.offsetWidth <= 8 && dot.offsetHeight <= 8));
  assert.equal(await readyMetric.locator('.metric-value').textContent(), String(seededCases.filter(item => item.status === 'ready').length));
  await readyMetric.click();
  assert.equal(await page.locator('.case-row').count(), seededCases.filter(item => item.status === 'ready').length);
  assert.equal(await readyMetric.getAttribute('aria-pressed'), 'true');
  await page.locator('#summary [data-status=all]').click();

  await page.locator('#platform-filter').selectOption('Лента');
  assert.equal(await page.locator('.case-row').count(), seededCases.filter(item => item.platform === 'Лента').length);
  await page.locator('#platform-filter').selectOption('all');
  await page.getByRole('button', { name: 'Изменить сортировку по дате' }).click();
  assert.equal(await page.locator('.case-row').first().getAttribute('data-case'), 'К-009');
  await page.getByRole('button', { name: 'Изменить сортировку по дате' }).click();
  assert.equal(await page.locator('.case-row').first().getAttribute('data-case'), 'К-001');
  await page.locator('#search').fill('demo-06');
  assert.equal(await page.locator('.case-row').count(), 1);
  await page.locator('#search').fill('');

  await page.locator('.case-row').first().getByRole('button').click();
  assert.equal(await page.locator('#case-drawer').isVisible(), true);
  assert.equal(await page.locator('.drawer-meta').textContent(), 'На проверке');
  const box = await page.locator('#case-drawer').boundingBox();
  assert.ok(box.x > 0 && Math.abs(box.x + box.width - 1440) <= 1, 'карточка открывается у правого края');
  await page.waitForFunction(() => document.querySelector('.evidence-image')?.naturalWidth > 0);
  await screenshot(page, 'desktop-case.png');
  await page.getByRole('button', { name: 'Увеличить учебный снимок' }).click();
  await page.waitForFunction(() => document.querySelector('#expanded-evidence')?.naturalWidth > 0);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#evidence-dialog').isVisible(), false);
  assert.equal(await page.locator('#case-drawer').isVisible(), true);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#case-drawer').isVisible(), false);
  await page.waitForFunction(() => document.querySelector('.case-open') === document.activeElement);
  await page.getByRole('button', { name: 'Официальные каналы', exact: true }).click();
  assert.equal(await page.locator('.channel-row').count(), channels.length);
  assert.equal(await page.locator('#channel-company').textContent(), 'Компания А');
  await page.getByRole('button', { name: 'Обращения', exact: true }).click();
  console.log('Журнал: таблица, поиск, фильтры, сортировка, панель справа и возврат фокуса');
}

async function testFullFlow(page) {
  await page.goto(home);
  await page.locator('#empty-list').waitFor();
  assert.equal(await page.locator('.case-row').count(), 0);
  for (const demo of demos) {
    const serial = demo.id.slice(2);
    await createFullCase(page, demo, casePhoto(serial));
    await page.locator('#case-drawer').waitFor();
    assert.equal(await page.locator('.detail-title').textContent(), demo.title);
    assert.match(await page.locator('.evidence-image').getAttribute('src'), /^data:image\/jpeg;base64,/);
    assert.equal(await page.getByRole('button', { name: 'Скачать черновик' }).count(), 0);
    if (demo.id === 'К-001') {
      await review(page, 'ready', false);
      assert.match(await page.locator('.review-form [role=alert]').textContent(), /пункты проверки/);
    }
    await review(page);
    const draft = await readDownload(page);
    for (const field of ['УЧЕБНЫЙ ЧЕРНОВИК', 'Организация: «Компания А»', demo.url, demo.platform, demo.date, demo.kind, demo.details,
      incoming, 'case-' + serial + '.jpg']) assert.ok(draft.includes(field), demo.id + ' ' + field);
    await closeCase(page);
    console.log(demo.id + ' регистрация, ручная проверка и скачивание TXT');
  }
  await page.reload();
  assert.equal(await page.locator('.case-row .ready').count(), 10);
  await createFullCase(page, { ...demos[0], url: 'https://example.org/not-training' });
  assert.match(await page.locator('#new-error').textContent(), /учебный HTTPS/);
  await page.getByRole('button', { name: 'Отмена' }).click();
  await createFullCase(page, { ...demos[0], url: demos[0].url + '?repeat=1' });
  assert.match(await page.locator('#new-error').textContent(), /уже есть/);
  await page.getByRole('button', { name: 'Отмена' }).click();
  await createFullCase(page, { ...demos[0], title: 'Официальный канал', url: channels[0].url });
  await page.locator('#case-drawer').waitFor();
  assert.match(await page.locator('.comparison strong').textContent(), /совпадает с официальным каналом/);
  assert.equal(await page.locator('.review-form option[value=ready]').evaluate(option => option.disabled), true);
  await review(page, 'clear', false);
  assert.equal(await page.getByRole('button', { name: 'Скачать черновик' }).count(), 0);
  await closeCase(page);
  await page.locator('#summary [data-status=ready]').click();
  assert.equal(await page.locator('.case-row').count(), 10);
  await page.locator('.case-row').first().getByRole('button').click();
  const note = 'Изменено, без сохранения не скачивается.';
  await page.locator('.review-form textarea').fill(note);
  await page.getByRole('button', { name: 'Сведения', exact: true }).click();
  await page.getByRole('button', { name: 'Проверка', exact: true }).click();
  assert.equal(await page.getByLabel('Пояснение').inputValue(), note);
  assert.equal(await page.getByRole('button', { name: 'Скачать черновик' }).isDisabled(), true);
  console.log('Контроль: реальный адрес, дубль, официальный адрес, перезагрузка и несохраненная правка');
}

async function quickSave(page) {
  await page.getByRole('button', { name: 'Сохранить случай', exact: true }).click();
  await page.locator('#case-drawer').waitFor();
}

async function testIntake(page) {
  await page.goto(home);
  assert.equal(await page.locator('.case-row').count(), 1, 'старый журнал читается');
  const text = 'Клиент прислал сообщение о странице с названием магазина.';
  await page.getByLabel('Ссылка или текст сообщения').fill(text);
  await quickSave(page);
  assert.equal(await page.locator('.source-note p').textContent(), text);
  assert.equal(await page.locator('#complete-form input[name=url]').inputValue(), '');
  assert.equal(await page.locator('[data-tab=review]').isDisabled(), true);
  await page.locator('#complete-form [name=title]').fill('Рабочее название из входящего сообщения');
  await closeCase(page);
  await page.getByRole('button', { name: /Входящее сообщение/ }).click();
  assert.equal(await page.locator('#complete-form [name=title]').inputValue(), 'Рабочее название из входящего сообщения');
  await closeCase(page);

  await page.locator('#quick-file').setInputFiles(casePhoto('001'));
  assert.match(await page.locator('#file-caption').textContent(), /case-001.png/);
  await page.getByRole('button', { name: 'Убрать снимок' }).click();
  assert.equal(await page.locator('#save-quick').isDisabled(), true);
  await page.locator('#quick-text').evaluate((input, bytes) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([new Uint8Array(bytes)], 'учебный-скриншот.png', { type: 'image/png' }));
    input.dispatchEvent(new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true }));
  }, [...await fs.readFile(casePhoto('001'))]);
  assert.match(await page.locator('#file-caption').textContent(), /учебный-скриншот.png/);
  await quickSave(page);
  assert.equal(await page.locator('#case-title').textContent(), 'Входящий снимок');
  assert.match(await page.locator('.evidence-image').getAttribute('src'), /^data:image\/jpeg;base64,/);
  await closeCase(page);

  const address = 'https://lenta.example/p/example-intake';
  await page.getByLabel('Ссылка или текст сообщения').fill(address);
  await quickSave(page);
  assert.equal(await page.locator('#complete-form [name=url]').inputValue(), address);
  assert.equal(await page.locator('#complete-form [name=platform]').inputValue(), 'Лента');
  await screenshot(page, 'intake-panel.png');
  const form = page.locator('#complete-form');
  await form.getByLabel('Название').fill('Учебный профиль магазина');
  await form.getByLabel('Тип ресурса').selectOption('Аккаунт');
  await form.getByLabel('Наблюдение').fill(demos[0].details);
  await page.getByRole('button', { name: 'Передать на проверку' }).click();
  assert.equal(await page.locator('.detail-title').textContent(), 'Учебный профиль магазина');
  await review(page);
  assert.match(await page.locator('.review-form [role=alert]').textContent(), /снимок/i);
  await page.getByLabel('Добавить учебный снимок').setInputFiles(casePhoto('001'));
  await page.locator('.evidence-image').waitFor();
  assert.equal(await page.getByLabel('Пояснение').inputValue(), incoming, 'пояснение сохранилось при добавлении снимка');
  await page.getByRole('button', { name: 'Сохранить решение' }).click();
  assert.ok((await readDownload(page)).includes(address));
  await closeCase(page);
  await page.reload();
  assert.equal(await page.locator('.case-row').count(), 4);
  await page.locator('#summary [data-status=intake]').click();
  assert.equal(await page.locator('.case-row').count(), 2);

  await page.locator('#quick-file').setInputFiles({ name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from('поврежденный учебный файл') });
  await page.getByRole('button', { name: 'Сохранить случай', exact: true }).click();
  await page.locator('#quick-error').waitFor();
  assert.match(await page.locator('#quick-error').textContent(), /не открылся/i);
  assert.equal(await page.locator('#case-drawer').isVisible(), false);
  console.log('Прием: текст, снимок, ссылка, дозаполнение, сохранение старых записей и поврежденный файл');
}

async function testMobile(phone) {
  await phone.goto(home);
  await phone.locator('.case-row').first().waitFor();
  assert.equal(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await screenshot(phone, 'mobile.png');
  await phone.locator('.case-row').first().getByRole('button').click();
  assert.equal(await phone.locator('.detail-title').evaluate(title => document.activeElement === title), true);
  await screenshot(phone, 'mobile-case.png');
  await closeCase(phone);
  await phone.waitForFunction(() => document.querySelector('.case-open') === document.activeElement);
  await phone.getByRole('button', { name: 'Заполнить всё сразу' }).click();
  assert.equal(await phone.locator('#new-dialog').isVisible(), true);
  await phone.keyboard.press('Escape');
  assert.equal(await phone.locator('#new-dialog').isVisible(), false);
  await phone.setViewportSize({ width: 320, height: 720 });
  assert.equal(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.equal(await phone.locator('#summary').evaluate(node => node.scrollWidth <= node.clientWidth), true);
  await phone.locator('.case-row').first().getByRole('button').click();
  assert.equal(await phone.locator('#case-drawer').evaluate(node => node.scrollWidth <= node.clientWidth), true);
  await closeCase(phone);
  console.log('Мобильный экран: проверены 390 и 320 px, закрытие панели и возврат к строке');
}

async function run() {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN, headless: true });
  const errors = [];
  const external = [];
  function watch(page) {
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', req => {
      const url = req.url();
      if (/^https?:/.test(url) && (!process.env.TEST_BASE_URL || new URL(url).origin !== new URL(home).origin)) external.push(url);
    });
    return page;
  }
  try {
    for (const [test, stored] of [[testWorkspace, undefined], [testFullFlow, []], [testIntake, [demos[5]]]]) {
      const context = await newContext(browser, stored);
      await test(watch(await context.newPage()));
      await context.close();
    }
    const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true });
    await testMobile(watch(phone));
    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
    console.log('Ошибок JS и запросов к внешним сайтам: 0');
  } finally {
    await browser.close();
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
