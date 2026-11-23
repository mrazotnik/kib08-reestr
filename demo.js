'use strict';

const DeskDemo = (() => {
  const { company } = typeof module !== 'undefined' ? require('./desk-model.js') : DeskModel;
  const channels = [
    { platform: 'Лента', title: company, purpose: 'Новости и связь с покупателями',
      url: 'https://lenta.example/company-a', previousUrl: 'https://lenta.example/moh-bukva' },
    { platform: 'Витрина', title: company + ' · магазин', purpose: 'Карточки товаров магазина',
      url: 'https://shop.example/stores/company-a', previousUrl: 'https://shop.example/stores/moh-bukva' },
    { platform: 'Круг', title: 'Поддержка «' + company + '»', purpose: 'Официальный канал поддержки',
      url: 'https://krug.example/company-a-help', previousUrl: 'https://krug.example/moh-bukva-help' }
  ];

  const entries = [
    ['Профиль с именем магазина', 'Лента', 'Аккаунт', 'lenta.example/p/demo-01', '22', 'На учебном снимке страница использует название магазина. Адрес профиля отличается от адреса официальной страницы.'],
    ['Объявление от имени магазина', 'Витрина', 'Объявление', 'shop.example/listing/demo-02', '22', 'В заголовке объявления указано имя магазина, но его нет среди публикаций официальной витрины.'],
    ['Страница с логотипом магазина', 'Лента', 'Страница', 'lenta.example/p/demo-03', '22', 'На снимке видна учебная копия логотипа. Ссылка ведет на страницу с другим идентификатором.'],
    ['Аккаунт «службы поддержки»', 'Круг', 'Аккаунт', 'krug.example/p/demo-04', '21', 'Профиль представлен как поддержка магазина. Его адрес отсутствует в перечне каналов компании.'],
    ['Реклама с отметкой партнера', 'Лента', 'Объявление', 'lenta.example/ads/demo-05', '21', 'В объявлении заявлено партнерство с магазином. В учебном реестре каналов адрес рекламодателя отсутствует.'],
    ['Копия карточки товара', 'Витрина', 'Объявление', 'shop.example/listing/demo-06', '21', 'В карточке повторено название товара магазина. На снимке указан другой продавец.'],
    ['Профиль с похожим названием', 'Лента', 'Аккаунт', 'lenta.example/p/demo-07', '20', 'Название отличается от названия магазина одним словом. На учебном снимке также видно совпадающее оформление.'],
    ['Сообщество от имени бренда', 'Круг', 'Страница', 'krug.example/group/demo-08', '20', 'В описании сообщества указано название магазина. Адрес отличается от указанного в перечне официальных каналов.'],
    ['Витрина с копией оформления', 'Витрина', 'Страница', 'shop.example/stores/demo-09', '19', 'На снимке повторены цвета и название официальной витрины. Адрес магазина отличается.'],
    ['Публикация под именем бренда', 'Лента', 'Объявление', 'lenta.example/ads/demo-10', '19', 'В подписи к учебной публикации указано название магазина. Официальный профиль использует другой адрес.']
  ];

  const demos = entries.map(([title, platform, kind, address, day, details], index) => {
    const serial = String(index + 1).padStart(3, '0');
    return {
      id: 'К-' + serial, title, platform, kind, url: 'https://' + address, date: '2026-11-' + day,
      details, evidence: { name: 'снимок-' + serial + '.png', sample: true }, status: 'new', review: null
    };
  });

  const seededCases = demos.map(item => {
    if (item.id === 'К-002') return {
      ...item, status: 'ready',
      review: { checks: { channel: true, evidence: true, context: true }, note: 'Название магазина видно на снимке. Адрес продавца отличается от официальной витрины.' }
    };
    if (item.id === 'К-004') return {
      ...item, status: 'hold',
      review: { checks: { channel: true, evidence: true, context: false }, note: 'Уточнить, кого автор сообщения принял за службу поддержки магазина.' }
    };
    if (item.id === 'К-006') return {
      ...item, status: 'clear',
      review: { checks: { channel: true, evidence: true, context: false }, note: 'Продавец указан под своим именем. Совпадает только название товара.' }
    };
    if (item.id === 'К-008') return {
      ...item, status: 'intake', url: '', kind: '', platform: '', details: '',
      receivedText: 'Прислали снимок сообщества с названием магазина. Адрес нужно уточнить.'
    };
    return item;
  });

  return { channels, demos, seededCases };
})();

if (typeof module !== 'undefined') module.exports = DeskDemo;
