'use strict';

const DeskModel = (() => {
  const company = 'Компания А';
  const platforms = { 'Лента': 'lenta.example', 'Витрина': 'shop.example', 'Круг': 'krug.example' };
  const kinds = ['Аккаунт', 'Объявление', 'Страница'];
  const statuses = { intake: 'Входящий', new: 'На проверке', ready: 'Черновик готов', hold: 'Нужны данные', clear: 'Закрыт' };
  const checkLabels = {
    channel: 'Сверил адрес с официальными каналами',
    evidence: 'Проверил, что на снимке виден нужный ресурс',
    context: 'Описал наблюдаемые признаки подмены'
  };
  const maxImageSize = 1024 * 1024;

  function parseUrl(value) {
    let address;
    try {
      address = new URL(String(value ?? '').trim());
    } catch {
      throw new Error('Введите полный учебный адрес с https://.');
    }
    if (address.protocol !== 'https:' || address.username || address.password || address.port ||
        !/^[a-z0-9][a-z0-9.-]*\.(example|test|invalid)$/i.test(address.hostname)) {
      throw new Error('Используйте учебный HTTPS-адрес на домене .example, .test или .invalid.');
    }
    return address;
  }

  function canonical(url) {
    const address = parseUrl(url);
    return address.hostname + address.pathname.replace(/\/+$/, '');
  }

  function channelMatch(url, channels) {
    if (!url) return null;
    const key = canonical(url);
    return channels.find(channel => [channel.url, channel.previousUrl]
      .some(address => address && canonical(address) === key)) ?? null;
  }

  function tidy(value, min, max, message) {
    const result = String(value ?? '').trim();
    if (result.length < min || result.length > max) throw new Error(message);
    return result;
  }

  function validDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(value);
    return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value + 'T');
  }

  function checkImage(type, size) {
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(type)) {
      throw new Error('Выберите учебный снимок в PNG, JPEG или WebP.');
    }
    if (size < 1 || size > maxImageSize) throw new Error('Размер снимка должен быть до 1 МБ.');
  }

  function checkDuplicate(address, all) {
    if (address && all.some(item => item.url && canonical(item.url) === canonical(address))) {
      throw new Error('Этот адрес уже есть в журнале. Откройте существующий случай.');
    }
  }

  function register(input, all, id) {
    const title = tidy(input.title, 4, 80, 'Опишите случай в названии, от 4 до 80 символов.');
    const details = tidy(input.details, 12, 800, 'Добавьте наблюдаемые признаки, от 12 до 800 символов.');
    const address = parseUrl(tidy(input.url, 1, 400, 'Укажите адрес длиной до 400 символов.'));
    if (!Object.hasOwn(platforms, input.platform) || address.hostname !== platforms[input.platform]) {
      throw new Error('Проверьте, что домен соответствует выбранной площадке.');
    }
    if (!kinds.includes(input.kind)) throw new Error('Выберите тип ресурса.');
    if (!validDate(input.date)) throw new Error('Укажите корректную дату обнаружения.');
    checkDuplicate(address.href, all);
    return {
      id, title, details, url: address.href, platform: input.platform, date: input.date,
      kind: input.kind, evidence: input.evidence ?? null, status: 'new', review: null
    };
  }

  function capture(input, all, id) {
    const text = tidy(input.text, 0, 800, 'Сократите сообщение до 800 символов.');
    if (!text && !input.evidence) throw new Error('Добавьте ссылку, текст или снимок.');
    if (!validDate(input.date)) throw new Error('Укажите корректную дату обнаружения.');
    const links = new Map();
    for (const token of text.match(/https?:\/\/[^\s<>"«»]+/gi) ?? []) {
      const address = parseUrl(token.replace(/[.,!?;:)\]}]+$/, ''));
      const platform = Object.keys(platforms).find(name => platforms[name] === address.hostname);
      if (!platform) throw new Error('Вставьте ссылку одной из учебных площадок: Лента, Витрина или Круг.');
      links.set(canonical(address.href), { url: address.href, platform });
    }
    const link = links.size === 1 ? links.values().next().value : null;
    checkDuplicate(link?.url, all);
    return {
      id, title: link ? 'Сообщение с площадки «' + link.platform + '»' : (text ? 'Входящее сообщение' : 'Входящий снимок'),
      details: '', url: link?.url ?? '', platform: link?.platform ?? '', date: input.date,
      kind: '', receivedText: text, evidence: input.evidence ?? null, status: 'intake', review: null
    };
  }

  function completeIntake(item, input, all) {
    if (item.status !== 'intake') throw new Error('Этот случай уже передан на проверку.');
    const others = all.filter(entry => entry.id !== item.id);
    return {
      ...register({ ...input, evidence: item.evidence }, others, item.id),
      receivedText: item.receivedText
    };
  }

  function review(item, input, channels) {
    const { status } = input;
    if (item.status === 'intake') throw new Error('Заполните сведения о ресурсе перед проверкой.');
    if (!['ready', 'hold', 'clear'].includes(status)) throw new Error('Выберите итог проверки.');
    if (status === 'ready' && channelMatch(item.url, channels)) {
      throw new Error('Адрес совпадает с официальным каналом. Закройте случай после проверки.');
    }
    const checks = Object.fromEntries(Object.keys(checkLabels).map(key => [key, input.checks?.[key] === true]));
    if (status === 'ready' && !item.evidence) throw new Error('Приложите учебный снимок ресурса.');
    if (status === 'ready' && !Object.values(checks).every(Boolean)) {
      throw new Error('Пройдите все пункты проверки перед подготовкой черновика.');
    }
    const note = tidy(input.note, 12, 600, 'Добавьте пояснение к решению, от 12 до 600 символов.');
    return { ...item, status, review: { checks, note } };
  }

  function makeDraft(item, channels) {
    if (item.status !== 'ready' || !item.review) throw new Error('Сначала завершите ручную проверку.');
    review(item, { ...item.review, status: 'ready' }, channels);
    const official = channels.filter(channel => channel.platform === item.platform).map(channel => channel.url);
    return [
      'УЧЕБНЫЙ ЧЕРНОВИК / ' + item.id,
      'Площадка: ' + item.platform,
      'Организация: «' + company + '»',
      'Тема: проверка сообщения о возможной подмене бренда',
      '',
      'Просим проверить учебный ресурс на использование названия или оформления организации.',
      'Адрес ресурса: ' + item.url,
      'Тип ресурса: ' + item.kind,
      'Дата обнаружения: ' + item.date,
      'Официальный канал для сравнения: ' + (official.join(', ') || 'не указан'),
      '',
      'Наблюдение: ' + item.details,
      'Результат ручной проверки: ' + item.review.note,
      'Приложение: ' + item.evidence.name,
      '',
      'Случай и материалы вымышлены. Черновик предназначен для учебного показа.',
      ''
    ].join('\n');
  }

  return { company, platforms, kinds, statuses, checkLabels, channelMatch, register, capture, completeIntake, review, makeDraft, checkImage };
})();

if (typeof module !== 'undefined') module.exports = DeskModel;
