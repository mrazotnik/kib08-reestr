const test = require('node:test');
const assert = require('node:assert/strict');
const model = require('../desk-model.js');
const { demos, channels } = require('../demo.js');

const checks = { channel: true, evidence: true, context: true };
const note = 'Ссылка сверена со списком, на учебном снимке видно название организации.';
const byId = Object.fromEntries(demos.map(item => [item.id, item]));

test('все 10 учебных случаев дают черновик после ручной проверки', () => {
  assert.equal(demos.length, 10);
  for (const demo of demos) {
    const item = model.review(demo, { checks, note, status: 'ready' }, channels);
    assert.equal(item.status, 'ready', demo.id);
    const draft = model.makeDraft(item, channels);
    for (const field of [demo.url, demo.date, demo.platform, note, demo.details]) {
      assert.ok(draft.includes(field), demo.id + ': ' + field);
    }
  }
});

test('совпадение с официальным каналом блокирует обращение', () => {
  const item = { ...demos[0], url: channels[0].url + '/?ref=example' };
  assert.equal(model.channelMatch(item.url, channels), channels[0]);
  assert.throws(() => model.review(item, { checks, note, status: 'ready' }, channels), /официальн/i);
  assert.equal(model.review(item, { checks, note, status: 'clear' }, channels).status, 'clear');
});

test('без отметок, пояснения или снимка готовность не сохраняется', () => {
  assert.throws(() => model.review(demos[0], { checks: {}, note, status: 'ready' }, channels), /пункты проверки/i);
  assert.throws(() => model.review({ ...demos[0], evidence: null }, { checks, note, status: 'ready' }, channels), /снимок/i);
  assert.throws(() => model.review(demos[0], { checks, note: '', status: 'ready' }, channels), /пояснен/i);
  assert.throws(() => model.makeDraft(demos[0], channels), /проверк/i);
});

test('регистрация принимает учебный адрес и отклоняет реальные, пустые и повторные', () => {
  const data = { ...demos[0], url: 'https://lenta.example/new-case' };
  const item = model.register(data, demos, 'К-011');
  assert.equal(item.status, 'new');
  assert.equal(item.id, 'К-011');
  assert.throws(() => model.register({ ...data, url: 'https://example.org/test' }, demos, 'К-012'), /учебн/i);
  assert.throws(() => model.register({ ...data, url: '' }, demos, 'К-012'), /адрес/i);
  assert.throws(() => model.register({ ...data, url: demos[0].url + '?marker=1' }, demos, 'К-012'), /уже/i);
});

test('регистрация проверяет дату и соответствие площадке', () => {
  const data = { ...demos[0], url: 'https://lenta.example/new-case' };
  assert.throws(() => model.register({ ...data, date: '2026-11-31' }, [], 'К-999'), /дат/i);
  assert.throws(() => model.register({ ...data, platform: 'Витрина' }, [], 'К-999'), /площадк/i);
});

test('разрешены только изображения учебных форматов и ограниченного размера', () => {
  assert.throws(() => model.checkImage('image/svg+xml', 60), /PNG/);
  assert.throws(() => model.checkImage('image/png', 1048577), /МБ/);
  assert.doesNotThrow(() => model.checkImage('image/png', 1048576));
});

test('повторная ручная проверка снимает готовность и блокирует экспорт', () => {
  const done = model.review(demos[0], { checks, note, status: 'ready' }, channels);
  const hold = model.review(done, { checks, note, status: 'hold' }, channels);
  assert.equal(hold.status, 'hold');
  assert.throws(() => model.makeDraft(hold, channels), /проверк/i);
});

test('результат выгрузки прямо обозначает учебный режим', () => {
  const item = model.review(byId['К-001'], { checks, note, status: 'ready' }, channels);
  assert.match(model.makeDraft(item, channels), /УЧЕБНЫЙ ЧЕРНОВИК/);
  assert.ok(model.makeDraft(item, channels).includes('Организация: «Компания А»'));
});

test('ранее сохраненный официальный адрес компании по-прежнему распознается', () => {
  for (const channel of channels) {
    const item = { ...demos[0], url: channel.previousUrl };
    assert.equal(model.channelMatch(item.url, channels), channel);
    assert.throws(() => model.review(item, { checks, note, status: 'ready' }, channels), /официальн/i);
  }
});

test('быстрый прием сохраняет только текст или только снимок как входящий случай', () => {
  const date = '2026-11-22';
  const text = model.capture({ text: 'Переслали сообщение о возможной подмене.', date }, [], 'К-011');
  assert.equal(text.status, 'intake');
  assert.equal(text.url, '');
  assert.match(text.receivedText, /Переслали/);
  const shot = model.capture({ date, evidence: { name: 'снимок.jpg' } }, [], 'К-012');
  assert.equal(shot.status, 'intake');
  assert.equal(shot.evidence.name, 'снимок.jpg');
  assert.throws(() => model.capture({ text: ' ', date }, [], 'К-013'), /ссылку, текст или снимок/i);
});

test('ссылка из входящего сообщения подставляет адрес и площадку', () => {
  const item = model.capture({ text: 'Клиент прислал https://lenta.example/p/new-article.', date: '2026-11-22' }, [], 'К-011');
  assert.equal(item.url, 'https://lenta.example/p/new-article');
  assert.equal(item.platform, 'Лента');
  assert.throws(() => model.capture({ text: item.url + '?utm=test', date: item.date }, [item], 'К-012'), /уже есть/i);
});

test('с двумя адресами карточка предлагает указать конкретный ресурс', () => {
  const text = 'Сравните https://lenta.example/p/alpha и https://lenta.example/p/beta';
  const item = model.capture({ text, date: '2026-11-22' }, [], 'К-011');
  assert.equal(item.url, '');
  assert.equal(item.receivedText, text);
});

test('неучебные ссылки во входящем тексте отклоняются', () => {
  assert.throws(() => model.capture({ text: 'Вот https://example.org/not-local', date: '2026-11-22' }, [], 'К-011'), /учебн/i);
});

test('входящий случай дополняется без потери материала и без дубля самого себя', () => {
  const item = model.capture({ text: 'Пришел снимок. https://lenta.example/p/incoming', date: '2026-11-22',
    evidence: { name: 'снимок.jpg' } }, [], 'К-011');
  assert.throws(() => model.review(item, { checks, note, status: 'ready' }, channels), /сведения/i);
  const finished = model.completeIntake(item, {
    ...item, title: 'Имя магазина в профиле', kind: 'Аккаунт', details: 'Имя магазина совпадает, адрес отличается.'
  }, [item]);
  assert.equal(finished.id, item.id);
  assert.equal(finished.status, 'new');
  assert.equal(finished.receivedText, item.receivedText);
  assert.equal(finished.evidence, item.evidence);
  assert.throws(() => model.register({ ...demos[0], url: item.url }, [item], 'К-013'), /уже есть/i);
  assert.doesNotThrow(() => model.register(demos[0], [{ ...item, url: '' }], 'К-013'));
});

test('название входящего случая не выводит адрес из середины сообщения', () => {
  const input = { text: 'Поступило: https://krug.example/p/unknown', date: '2026-11-21' };
  const captured = model.capture(input, [], 'К-011');
  assert.equal(captured.title, 'Сообщение с площадки «Круг»');
  assert.equal(captured.status, 'intake');
});
