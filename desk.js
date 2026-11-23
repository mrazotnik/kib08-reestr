'use strict';

(() => {
  const model = DeskModel;
  const { channels, seededCases } = DeskDemo;
  const storageKey = 'kib08-brand-desk-v1';
  const byId = id => document.getElementById(id);
  const search = byId('search');
  const platformFilter = byId('platform-filter');
  const drawer = byId('case-drawer');
  const details = byId('details');
  const newDialog = byId('new-dialog');
  const fullForm = byId('new-form');
  const quickForm = byId('quick-form');
  const quickText = byId('quick-text');
  const quickFile = byId('quick-file');
  const quickSave = byId('save-quick');
  const quickError = byId('quick-error');
  const addCase = byId('add-case');
  const removeFile = byId('remove-file');
  const evidenceDialog = byId('evidence-dialog');
  const expandedEvidence = byId('expanded-evidence');
  const formatDate = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const pendingDetails = new Map();
  const pendingReviews = new Map();

  let storageAvailable = true;
  let lastSaved = null;
  let fullFormSession = 0;
  let drawerSession = 0;
  let activeStatus = 'all';
  let dateDescending = true;
  let selectedId = null;
  let caseTab = 'review';
  let incomingFile = null;
  let busy = false;
  let items = loadCases();

  function node(tag, className = '', text = '') {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text) el.textContent = text;
    return el;
  }

  function append(parent, ...children) {
    parent.append(...children);
    return parent;
  }

  function button(className, text, action) {
    const control = node('button', className, text);
    control.type = 'button';
    control.addEventListener('click', action);
    return control;
  }

  function option(select, value, title) {
    select.add(new Option(title, value));
  }

  function field(label, control) {
    return append(node('label', 'field'), label, control);
  }

  function namedInput(name, value, attributes = {}) {
    return Object.assign(node('input'), { name, value }, attributes);
  }

  function message(text, target = byId('message')) {
    target.hidden = !text;
    target.textContent = text;
  }

  function errorNotice() {
    const el = node('p', 'notice error');
    el.setAttribute('role', 'alert');
    el.hidden = true;
    return el;
  }

  function savedMessage(text) {
    return storageAvailable ? text : text + ' Запись доступна до закрытия вкладки.';
  }

  function today() {
    const date = new Date();
    return [date.getFullYear(), date.getMonth() + 1, date.getDate()]
      .map(value => String(value).padStart(2, '0')).join('-');
  }

  function loadCases() {
    try {
      const probe = storageKey + '-probe';
      localStorage.setItem(probe, '1');
      localStorage.removeItem(probe);
      const raw = localStorage.getItem(storageKey);
      lastSaved = raw;
      if (raw === null) return [...seededCases];
      const stored = JSON.parse(raw);
      if (!Array.isArray(stored) || stored.some(item => !item || typeof item.id !== 'string' ||
          typeof item.title !== 'string' || typeof item.url !== 'string' ||
          typeof item.date !== 'string' || Number.isNaN(Date.parse(item.date)) ||
          !Object.hasOwn(model.statuses, item.status) || (!item.url && item.status !== 'intake'))) {
        throw new Error('Неверный формат журнала');
      }
      for (const item of stored) model.channelMatch(item.url, channels);
      return stored;
    } catch {
      storageAvailable = false;
      message('Браузер не открыл сохраненный журнал. Изменения в этой вкладке останутся до ее закрытия.');
      return [...seededCases];
    }
  }

  function persist(next) {
    if (storageAvailable) {
      if (localStorage.getItem(storageKey) !== lastSaved) {
        throw new Error('Журнал изменился в другой вкладке. Скопируйте ввод и обновите страницу.');
      }
      try {
        const raw = JSON.stringify(next);
        localStorage.setItem(storageKey, raw);
        lastSaved = raw;
      } catch {
        throw new Error('Не удалось сохранить изменение. Попробуйте меньший снимок или освободите место в браузере.');
      }
    }
    items = next;
  }

  function updateItem(item) {
    persist(items.map(previous => previous.id === item.id ? item : previous));
  }

  function findItem(id) {
    return items.find(item => item.id === id);
  }

  function nextId() {
    const last = items.reduce((max, item) => Math.max(max, Number(item.id.slice(2)) || 0), 0);
    return 'К-' + String(last + 1).padStart(3, '0');
  }

  function badge(status) {
    return node('span', 'badge ' + status, model.statuses[status]);
  }

  function renderFilters() {
    const filters = [
      ['all', 'Все'], ['intake', 'Входящие'], ['new', 'На проверке'], ['hold', 'Нужны данные'],
      ['ready', 'Черновики'], ['clear', 'Закрытые']
    ];
    const totals = { all: items.length };
    for (const [key] of filters.slice(1)) totals[key] = 0;
    for (const item of items) totals[item.status] += 1;

    const overview = byId('overview-counts');
    for (const [status, label] of [['intake', 'Входящие'], ['new', 'На проверке'], ['ready', 'Готовы к выгрузке']]) {
      let metric = overview.querySelector('[data-metric="' + status + '"]');
      if (!metric) {
        metric = button('metric', '', () => {
          activeStatus = status;
          platformFilter.value = 'all';
          search.value = '';
          renderJournal();
        });
        metric.dataset.metric = status;
        metric.append(append(node('span', 'metric-label'), node('span', 'metric-dot is-' + status), node('span', '', label)),
          node('strong', 'metric-value'));
        overview.append(metric);
      }
      metric.lastElementChild.textContent = String(totals[status]);
      metric.setAttribute('aria-pressed', String(activeStatus === status && platformFilter.value === 'all' && !search.value.trim()));
    }

    const summary = byId('summary');
    for (const [status, title] of filters) {
      let control = summary.querySelector('[data-status="' + status + '"]');
      if (!control) {
        control = button('status-filter', '', () => {
          activeStatus = status;
          renderJournal();
        });
        control.dataset.status = status;
        control.append(node('span', '', title), node('span', 'filter-count'));
        summary.append(control);
      }
      control.setAttribute('aria-pressed', String(activeStatus === status));
      control.lastElementChild.textContent = String(totals[status]);
    }
  }

  function visibleCases() {
    const term = search.value.trim().toLocaleLowerCase('ru');
    const platform = platformFilter.value;
    return items.filter(item => {
      const matchesPlatform = platform === 'all' || item.platform === platform || (platform === 'missing' && !item.platform);
      return matchesPlatform && (activeStatus === 'all' || item.status === activeStatus) &&
        [item.id, item.title, item.platform, item.url, item.kind, item.receivedText]
          .join(' ').toLocaleLowerCase('ru').includes(term);
    }).sort((a, b) => dateDescending ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date));
  }

  function renderJournal() {
    renderFilters();
    const filtered = visibleCases();
    byId('case-count').textContent = String(filtered.length);
    const empty = items.length ? 'По этим условиям случаев нет.' : 'Здесь появятся сохраненные случаи.';
    message(filtered.length ? '' : empty, byId('empty-list'));
    byId('case-list').replaceChildren(...filtered.map(item => {
      const row = node('tr', 'case-row');
      row.dataset.case = item.id;
      const name = button('case-open', '', () => openCase(item.id));
      name.setAttribute('aria-haspopup', 'dialog');
      const icon = node('span', 'case-icon ' + ({ 'Аккаунт': 'profile', 'Объявление': 'notice-mark', 'Страница': 'page-mark' }[item.kind] ?? 'inbox-mark'));
      icon.setAttribute('aria-hidden', 'true');
      name.append(icon, node('strong', '', item.title));
      const cell = append(node('td', 'case-name-cell'), name);
      const arrow = node('span', 'row-arrow');
      arrow.setAttribute('aria-hidden', 'true');
      row.append(cell, append(node('td', 'status-cell'), badge(item.status)),
        node('td', 'table-platform', item.platform || '—'),
        node('td', 'table-date', formatDate.format(new Date(item.date))),
        append(node('td', 'table-chevron'), arrow));
      row.addEventListener('click', event => {
        if (!event.target.closest('button')) openCase(item.id);
      });
      return row;
    }));
    byId('sort-date').closest('th').setAttribute('aria-sort', dateDescending ? 'descending' : 'ascending');
    byId('sort-arrow').textContent = dateDescending ? '↓' : '↑';
  }

  function focusRow(id) {
    const row = [...byId('case-list').rows].find(entry => entry.dataset.case === id);
    (row?.querySelector('.case-open') ?? byId('queue-title')).focus({ preventScroll: true });
  }

  function openCase(id, feedback = '') {
    const item = findItem(id);
    if (!item) return;
    drawerSession += 1;
    selectedId = id;
    caseTab = item.status === 'intake' ? 'data' : 'review';
    renderDrawer(item, feedback);
    if (!drawer.open) drawer.showModal();
    drawer.scrollTop = 0;
    byId('case-title').focus({ preventScroll: true });
  }

  function imageLink(evidence, item) {
    if (evidence.sample) {
      return /^К-(00[1-9]|010)$/.test(item.id) ? './assets/case-' + item.id.slice(2) + '.png' : null;
    }
    return /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(evidence.data ?? '') ? evidence.data : null;
  }

  function evidenceBlock(item) {
    const block = append(node('section', 'detail-panel'), node('h3', '', 'Учебный снимок'));
    const source = item.evidence && imageLink(item.evidence, item);
    if (source) {
      const visual = node('img', 'evidence-image');
      visual.src = source;
      visual.alt = 'Учебный снимок ' + item.id + ' · ' + item.title;
      const zoom = button('evidence-zoom', '', () => {
        expandedEvidence.src = source;
        expandedEvidence.alt = visual.alt;
        evidenceDialog.showModal();
      });
      zoom.append(visual, node('span', '', 'Увеличить'));
      zoom.setAttribute('aria-label', 'Увеличить учебный снимок');
      const link = node('a', 'quiet-link', 'Скачать снимок');
      link.href = source;
      link.download = item.evidence.name;
      block.append(append(node('figure', 'evidence'), zoom,
        append(node('figcaption'), node('span', '', item.evidence.name), link)));
      return block;
    }

    const input = node('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/webp';
    const error = errorNotice();
    const clip = node('span', 'icon clip-icon');
    clip.setAttribute('aria-hidden', 'true');
    const attach = append(node('label', 'button secondary attach-button'), clip, 'Добавить учебный снимок', input);
    block.append(node('p', 'dim', 'Снимок пока не приложен.'), attach, error);
    input.addEventListener('change', async () => {
      const file = input.files[0];
      if (!file) return;
      input.disabled = true;
      message('', error);
      const request = drawerSession;
      try {
        const evidence = await readImage(file);
        const latest = findItem(item.id);
        if (!latest) return;
        const updated = { ...latest, evidence };
        updateItem(updated);
        if (block.isConnected && drawer.open && request === drawerSession) {
          const next = evidenceBlock(updated);
          block.replaceWith(next);
          next.querySelector('.evidence-zoom')?.focus({ preventScroll: true });
          message(savedMessage('Снимок добавлен.'), byId('case-notice'));
        }
      } catch (failure) {
        message(failure.message, error);
        input.value = '';
      } finally {
        input.disabled = false;
      }
    });
    return block;
  }

  function download(item) {
    const blob = new Blob([model.makeDraft(item, channels)], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = node('a');
    link.href = url;
    link.download = 'обращение-' + item.id.slice(2) + '.txt';
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function choice(name, initial, placeholder, choices) {
    const select = node('select');
    select.name = name;
    option(select, '', placeholder);
    for (const value of choices) option(select, value, value);
    select.value = initial;
    return select;
  }

  function completeBlock(item) {
    const form = node('form', 'complete-form');
    form.id = 'complete-form';
    form.noValidate = true;
    const values = pendingDetails.get(item.id) ?? item;
    const title = namedInput('title', values.title, { maxLength: 80 });
    const platform = choice('platform', values.platform, 'Выберите площадку', Object.keys(model.platforms));
    const kind = choice('kind', values.kind, 'Выберите тип', model.kinds);
    const url = namedInput('url', values.url, { type: 'url', maxLength: 400, placeholder: 'https://lenta.example/p/...' });
    const date = namedInput('date', values.date, { type: 'date' });
    const observation = Object.assign(node('textarea'), { name: 'details', rows: 3, maxLength: 800,
      value: values.details, placeholder: 'Что показалось подозрительным?' });
    const error = errorNotice();
    const submit = node('button', 'button primary', 'Передать на проверку');
    submit.type = 'submit';
    form.append(node('h3', '', 'Сведения о ресурсе'), field('Название', title),
      append(node('div', 'field-grid'), field('Площадка', platform), field('Тип ресурса', kind)),
      field('Адрес ресурса', url), field('Дата обнаружения', date), field('Наблюдение', observation),
      error, append(node('div', 'detail-actions'), submit));
    form.addEventListener('input', () => pendingDetails.set(item.id, Object.fromEntries(new FormData(form))));
    form.addEventListener('submit', event => {
      event.preventDefault();
      try {
        const completed = model.completeIntake(findItem(item.id), Object.fromEntries(new FormData(form)), items);
        updateItem(completed);
        pendingDetails.delete(item.id);
        renderJournal();
        caseTab = 'review';
        renderDrawer(completed, savedMessage('Сведения сохранены. Случай передан на проверку.'));
        byId('case-title').focus({ preventScroll: true });
      } catch (failure) {
        message(failure.message, error);
      }
    });
    return form;
  }

  function reviewBlock(item, official) {
    const section = append(node('section', 'detail-panel'), node('h3', '', 'Ручная проверка'));
    const reviewForm = node('form', 'review-form');
    reviewForm.noValidate = true;
    const checklist = node('div', 'checklist');
    const pending = pendingReviews.get(item.id);
    const values = pending ?? item.review;
    const checkInputs = Object.entries(model.checkLabels).map(([key, label]) => {
      const input = node('input');
      input.type = 'checkbox';
      input.checked = values?.checks?.[key] ?? false;
      checklist.append(append(node('label', 'check'), input, node('span', '', label)));
      return [key, input];
    });
    const select = node('select');
    option(select, '', 'Выберите итог');
    option(select, 'ready', 'Подготовить черновик');
    select.options[1].disabled = Boolean(official);
    option(select, 'hold', 'Запросить уточнение');
    option(select, 'clear', 'Закрыть без черновика');
    select.value = pending?.status ?? (item.review ? item.status : '');
    const note = node('textarea');
    note.rows = 3;
    note.maxLength = 600;
    note.placeholder = 'Что подтверждает ваше решение?';
    note.value = values?.note ?? '';
    const error = errorNotice();
    const unsaved = node('p', 'dim');
    unsaved.hidden = true;
    const save = node('button', 'button primary', 'Сохранить решение');
    save.type = 'submit';
    const actions = append(node('div', 'detail-actions'), save);
    let exportButton;
    if (item.status === 'ready') {
      exportButton = button('button secondary', 'Скачать черновик', () => {
        try {
          download(findItem(item.id));
          message('Черновик скачан. Снимок доступен отдельно.', byId('case-notice'));
        } catch (failure) {
          message(failure.message, error);
        }
      });
      actions.append(exportButton);
    }
    if (pending) {
      if (exportButton) exportButton.disabled = true;
      message('Решение еще не сохранено.', unsaved);
    }
    function readDecision() {
      return {
        status: select.value, note: note.value,
        checks: Object.fromEntries(checkInputs.map(([key, input]) => [key, input.checked]))
      };
    }
    reviewForm.append(checklist, field('Итог', select), field('Пояснение', note), error, unsaved, actions);
    reviewForm.addEventListener('input', () => {
      pendingReviews.set(item.id, readDecision());
      message('', error);
      if (exportButton) exportButton.disabled = true;
      message('Решение еще не сохранено.', unsaved);
    });
    reviewForm.addEventListener('submit', event => {
      event.preventDefault();
      try {
        const latest = findItem(item.id);
        const updated = model.review(latest, readDecision(), channels);
        updateItem(updated);
        pendingReviews.delete(item.id);
        renderJournal();
        const status = updated.status === 'ready' ? 'Решение сохранено. Черновик готов к скачиванию.' : 'Решение сохранено.';
        renderDrawer(updated, savedMessage(status));
        (details.querySelector('.detail-actions .secondary') || byId('case-title')).focus({ preventScroll: true });
      } catch (failure) {
        message(failure.message, error);
      }
    });
    return append(section, reviewForm);
  }

  function comparisonRow(label, value, asCode = false) {
    return append(node('div'), node('dt', '', label), asCode ?
      append(node('dd'), node('code', '', value)) : node('dd', '', value));
  }

  function caseData(item) {
    const fields = append(node('dl', 'record-fields'),
      comparisonRow('Адрес ресурса', item.url || 'Не указан', true),
      comparisonRow('Площадка', item.platform || 'Не указана'),
      comparisonRow('Тип ресурса', item.kind || 'Не указан'),
      comparisonRow('Дата обнаружения', formatDate.format(new Date(item.date))));
    let data = item.status === 'intake' ? completeBlock(item) :
      append(node('section', 'detail-panel'), node('h3', '', 'Сведения о ресурсе'), fields,
        node('h4', '', 'Наблюдение'), node('p', 'case-description', item.details));
    const split = append(node('div', 'drawer-columns'), data, evidenceBlock(item));
    if (!item.receivedText) return split;
    return append(node('div', 'drawer-data'),
      append(node('section', 'source-note'), node('h3', '', 'Исходное сообщение'),
        node('p', '', item.receivedText)), split);
  }

  function caseReview(item) {
    const exact = model.channelMatch(item.url, channels);
    const reference = channels.find(channel => channel.platform === item.platform);
    const title = exact ? 'Адрес совпадает с официальным каналом' : 'Точного совпадения с официальным каналом нет';
    return append(node('div', 'drawer-review'),
      append(node('section', 'comparison ' + (exact ? 'exact' : 'different')),
        node('strong', '', title),
        append(node('dl', 'address-pair'),
          comparisonRow('Адрес из сообщения', item.url, true),
          comparisonRow('Официальный адрес', reference?.url ?? 'Не указан', true))),
      node('p', 'case-description', item.details),
      append(node('div', 'drawer-columns'), evidenceBlock(item), reviewBlock(item, exact)));
  }

  function renderDrawer(item, feedback = '') {
    const back = button('icon-button drawer-close', '×', () => drawer.close());
    back.id = 'close-case';
    back.setAttribute('aria-label', 'Закрыть карточку');
    const title = node('h2', 'detail-title', item.title);
    title.id = 'case-title';
    title.tabIndex = -1;
    const status = append(node('div', 'drawer-meta'), badge(item.status));
    const head = append(node('header', 'drawer-head'),
      append(node('div'), status, title), back);
    const tabs = node('div', 'drawer-tabs');
    tabs.setAttribute('role', 'group');
    tabs.setAttribute('aria-label', 'Разделы карточки');
    for (const [tab, label] of [['data', 'Сведения'], ['review', 'Проверка']]) {
      const control = button('drawer-tab', label, () => {
        if (caseTab === tab) return;
        caseTab = tab;
        renderDrawer(findItem(item.id));
        drawer.scrollTop = 0;
        details.querySelector('[data-tab="' + tab + '"]').focus({ preventScroll: true });
      });
      control.dataset.tab = tab;
      control.setAttribute('aria-pressed', String(caseTab === tab));
      control.disabled = tab === 'review' && item.status === 'intake';
      tabs.append(control);
    }
    const notice = node('p', 'notice');
    notice.id = 'case-notice';
    notice.setAttribute('role', 'status');
    message(feedback, notice);
    const content = caseTab === 'review' ? caseReview(item) : caseData(item);
    details.replaceChildren(append(node('div', 'drawer-chrome'), head, tabs),
      append(node('div', 'drawer-body'), notice, content));
  }

  function renderChannels() {
    byId('channels').replaceChildren(...channels.map(channel =>
      append(node('article', 'channel-row'),
        append(node('div'), node('h2', '', channel.title), node('p', 'dim', channel.purpose)),
        node('span', 'channel-name', channel.platform), node('code', '', channel.url))));
  }

  function show(view) {
    for (const control of document.querySelectorAll('nav [data-view]')) {
      const active = control.dataset.view === view;
      if (active) {
        control.setAttribute('aria-current', 'page');
        byId('current-section').textContent = control.querySelector('.nav-label').textContent;
      } else control.removeAttribute('aria-current');
      byId(control.dataset.view + '-view').hidden = !active;
    }
    byId(view + '-title').focus({ preventScroll: true });
  }

  async function readImage(file) {
    model.checkImage(file.type, file.size);
    let picture;
    try {
      picture = await createImageBitmap(file);
    } catch {
      throw new Error('Снимок не открылся. Выберите исправный файл.');
    }
    try {
      const scale = Math.min(1, 1200 / Math.max(picture.width, picture.height));
      const canvas = node('canvas');
      canvas.width = Math.max(1, Math.round(picture.width * scale));
      canvas.height = Math.max(1, Math.round(picture.height * scale));
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(picture, 0, 0, canvas.width, canvas.height);
      const data = canvas.toDataURL('image/jpeg', 0.82);
      if (!data.startsWith('data:image/jpeg;base64,')) throw new Error('Не удалось сохранить снимок.');
      const filename = file.name.replace(/\.[^.]+$/, '').replace(/[^\p{L}\p{N}_. -]/gu, '').slice(0, 80);
      return { name: (filename || 'учебный-снимок') + '.jpg', data };
    } finally {
      picture.close();
    }
  }

  function syncQuick() {
    quickSave.disabled = busy || (!incomingFile && !quickText.value.trim());
    quickText.readOnly = busy;
    quickFile.disabled = busy;
    removeFile.disabled = busy;
    addCase.disabled = busy;
    removeFile.hidden = !incomingFile;
    byId('file-caption').textContent = incomingFile?.name ?? '';
  }

  function selectFile(file) {
    try {
      if (file) model.checkImage(file.type, file.size);
      incomingFile = file;
      message('', quickError);
    } catch (failure) {
      incomingFile = null;
      quickFile.value = '';
      message(failure.message, quickError);
    }
    syncQuick();
  }

  function revealSaved(item) {
    activeStatus = 'all';
    platformFilter.value = 'all';
    search.value = '';
    renderJournal();
    if (!byId('journal-view').hidden) openCase(item.id, savedMessage('Случай сохранен в журнале.'));
  }

  function openFullForm() {
    fullFormSession += 1;
    fullForm.reset();
    fullForm.elements.date.value = today();
    message('', byId('new-error'));
    updateDomain();
    newDialog.showModal();
  }

  function updateDomain() {
    const host = model.platforms[fullForm.elements.platform.value];
    byId('domain-hint').textContent = host ? 'Учебный домен: ' + host : 'Выберите площадку, чтобы увидеть учебный домен.';
  }

  for (const name of Object.keys(model.platforms)) {
    option(fullForm.elements.platform, name, name);
    option(platformFilter, name, name);
  }
  for (const name of model.kinds) option(fullForm.elements.kind, name, name);
  for (const control of document.querySelectorAll('nav [data-view]')) {
    control.addEventListener('click', () => show(control.dataset.view));
  }
  search.addEventListener('input', renderJournal);
  platformFilter.addEventListener('change', renderJournal);
  byId('sort-date').addEventListener('click', () => {
    dateDescending = !dateDescending;
    renderJournal();
  });
  drawer.addEventListener('click', event => {
    if (event.target === drawer && event.clientX < drawer.getBoundingClientRect().left) drawer.close();
  });
  drawer.addEventListener('close', () => {
    if (drawer.open) return;
    const closedId = selectedId;
    selectedId = null;
    if (closedId && !byId('journal-view').hidden) focusRow(closedId);
  });
  byId('close-evidence').addEventListener('click', () => evidenceDialog.close());
  evidenceDialog.addEventListener('close', () => expandedEvidence.removeAttribute('src'));
  addCase.addEventListener('click', openFullForm);
  for (const id of ['close-dialog', 'cancel-dialog']) byId(id).addEventListener('click', () => newDialog.close());
  fullForm.elements.platform.addEventListener('change', updateDomain);

  quickText.addEventListener('input', () => {
    message('', quickError);
    syncQuick();
  });
  quickFile.addEventListener('change', () => selectFile(quickFile.files[0] ?? null));
  removeFile.addEventListener('click', () => {
    quickFile.value = '';
    selectFile(null);
    quickFile.focus();
  });
  quickText.addEventListener('paste', event => {
    const file = [...(event.clipboardData?.files ?? [])].find(entry => entry.type.startsWith('image/'));
    if (!file || busy) return;
    if (!event.clipboardData.getData('text/plain')) event.preventDefault();
    quickFile.value = '';
    selectFile(file);
  });
  quickForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (busy) return;
    busy = true;
    syncQuick();
    message('', quickError);
    const text = quickText.value;
    try {
      const evidence = incomingFile ? await readImage(incomingFile) : null;
      const entry = model.capture({ text, date: today(), evidence }, items, nextId());
      persist([entry, ...items]);
      quickForm.reset();
      incomingFile = null;
      revealSaved(entry);
    } catch (failure) {
      message(failure.message, quickError);
    } finally {
      busy = false;
      syncQuick();
    }
  });

  fullForm.addEventListener('submit', async event => {
    event.preventDefault();
    const submit = fullForm.querySelector('[type=submit]');
    if (submit.disabled) return;
    submit.disabled = true;
    const session = fullFormSession;
    const error = byId('new-error');
    message('', error);
    try {
      const attributes = Object.fromEntries(new FormData(fullForm));
      const evidence = attributes.evidence?.size ? await readImage(attributes.evidence) : null;
      if (!newDialog.open || session !== fullFormSession) return;
      const entry = model.register({ ...attributes, evidence }, items, nextId());
      persist([entry, ...items]);
      newDialog.close();
      revealSaved(entry);
    } catch (failure) {
      if (session === fullFormSession) message(failure.message, error);
    } finally {
      submit.disabled = false;
    }
  });

  byId('workspace-name').textContent = model.company;
  byId('channel-company').textContent = model.company;
  renderChannels();
  renderJournal();
  syncQuick();
})();
