// ===================== Одиссея — наземная станция =====================

const PAGES = [
  { id: 'overview',  title: 'Обзор',        icon: 'i-home',   sub: 'Главное о ровере на одном экране' },
  { id: 'telemetry', title: 'Телеметрия',   icon: 'i-pulse',  sub: 'Текущие параметры состояния ровера в реальном времени' },
  { id: 'sensors',   title: 'Сенсоры',      icon: 'i-target', sub: 'Данные с бортовых датчиков ровера' },
  { id: 'map',       title: 'Карта / SLAM', icon: 'i-map',    sub: 'Построение карты местности и локализация ровера' },
  { id: 'cameras',   title: 'Камеры',       icon: 'i-cam',    sub: 'Видео с камер ровера' },
  { id: 'tasks',     title: 'Задачи',       icon: 'i-task',   sub: 'Миссии ровера и план проекта' },
  { id: 'control',   title: 'Управление',   icon: 'i-game',   sub: 'Ручное управление ровером' },
  { id: 'logs',      title: 'Логи',         icon: 'i-list',   sub: 'Системные журналы ровера (ROS 2, узлы, ошибки)' },
  { id: 'settings',  title: 'Настройки',    icon: 'i-gear',   sub: 'Параметры наземной станции' },
];

const $ = id => document.getElementById(id);
const $$ = sel => document.querySelectorAll(sel);

// ---------------- настройки (хранятся в браузере) ----------------
const DEFAULTS = { waterFull: 2000, chartMin: 10, co2Warn: 1000, co2Bad: 2000 };
const S = { ...DEFAULTS };
try { Object.assign(S, JSON.parse(localStorage.getItem('odyssey-settings') || '{}')); } catch (e) {}

// ---------------- данные ----------------
const D = { temp: null, hum: null, press: null, co2: null, water: null, flame: null,
            status: '', sys: {}, lastHead: 0 };
const H = { temp: [], co2: [], cpuTemp: [], cpu: [], ram: [] };   // история: [время, значение]
let rosOk = false;
let nodes = null;

function push(key, v) {
  const a = H[key], now = Date.now();
  a.push([now, v]);
  const limit = now - 60 * 60000;                 // храним максимум час
  while (a.length && a[0][0] < limit) a.shift();
}

const num = (v, d = 0) => (v === null || v === undefined || Number.isNaN(v)) ? '—' : Number(v).toFixed(d);
const espOk = () => D.lastHead > 0 && Date.now() - D.lastHead < 5000;
const waterPct = () => Math.min(100, Math.round(D.water * 100 / S.waterFull));

function co2Info(v) {
  if (v < 800)      return { q: 'Отлично', cls: 'ok' };
  if (v < S.co2Warn) return { q: 'Хорошо', cls: 'ok' };
  if (v < S.co2Bad)  return { q: 'Душно, проветрите', cls: 'warn' };
  return { q: 'Высокий / прогрев датчика', cls: 'bad' };
}
function wifiQ(d) {
  if (d === undefined) return '—';
  return d > -50 ? 'отличный сигнал' : d > -60 ? 'хороший сигнал' : d > -70 ? 'средний сигнал' : 'слабый сигнал';
}
function fmtUptime(s) {
  if (s === undefined) return '—';
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}
const okText = v => (!espOk() || v === null) ? 'нет данных' : 'OK';
const okCls = v => (!espOk() || v === null) ? 'st-wait' : 'st-ok';

// ---------------- что выводить в элементы data-k ----------------
const F = {
  temp: () => num(D.temp, 1),
  hum: () => num(D.hum, 0),
  press: () => num(D.press, 0),
  pressmm: () => D.press === null ? '—' : num(D.press * 0.750062, 0),
  co2: () => num(D.co2, 0),
  co2q: () => D.co2 === null ? '—' : co2Info(D.co2).q,
  water: () => D.water === null ? '—' : String(waterPct()),
  waterraw: () => num(D.water, 0),
  flame: () => D.flame === null ? '—' : (D.flame ? 'ПЛАМЯ!' : 'нет'),
  wifi: () => num(D.sys.wifi_dbm, 0),
  wifiq: () => wifiQ(D.sys.wifi_dbm),
  cpu: () => D.sys.cpu === undefined ? '—' : num(D.sys.cpu, 0) + ' %',
  ram: () => D.sys.ram === undefined ? '—' : num(D.sys.ram, 0) + ' %',
  disk: () => D.sys.disk === undefined ? '—' : num(D.sys.disk, 0) + ' %',
  cputemp: () => num(D.sys.cpu_temp, 0),
  cputempShort: () => D.sys.cpu_temp === undefined ? '' : '· ' + num(D.sys.cpu_temp, 0) + ' °C',
  uptime: () => fmtUptime(D.sys.uptime),
  rosText: () => rosOk ? 'Активен' : 'Нет связи',
  espText: () => espOk() ? 'На связи' : 'Нет данных',
  rosTask: () => rosOk ? 'OK' : 'Нет связи',
  espTask: () => espOk() ? 'OK' : 'Нет данных',
  sensTask: () => !espOk() ? 'Ожидание' : (D.status === 'OK' ? 'OK' : 'Неисправность'),
  okTemp: () => okText(D.temp),
  okCo2: () => okText(D.co2),
  okFlame: () => okText(D.flame),
  okWater: () => okText(D.water),
  chartWin: () => `последние ${S.chartMin} мин`,
  nodeCount: () => nodes === null ? '—' : String(nodes.length),
  logTotal: () => String(logCount.DEBUG + logCount.INFO + logCount.WARN + logCount.ERROR + logCount.FATAL),
  logInfo: () => String(logCount.INFO),
  logDebug: () => String(logCount.DEBUG),
  logWarn: () => String(logCount.WARN),
  logErr: () => String(logCount.ERROR + logCount.FATAL),
  rosUrl: () => ROS_URL,
};
// цвет текста (классы st-ok / st-wait / st-fail)
const C = {
  rosTask: () => rosOk ? 'st-ok' : 'st-fail',
  espTask: () => espOk() ? 'st-ok' : 'st-fail',
  sensTask: () => !espOk() ? 'st-wait' : (D.status === 'OK' ? 'st-ok' : 'st-fail'),
  okTemp: () => okCls(D.temp), okCo2: () => okCls(D.co2),
  okFlame: () => okCls(D.flame), okWater: () => okCls(D.water),
};
const COLOR = {
  co2: () => D.co2 === null ? '' : `var(--${co2Info(D.co2).cls})`,
  flame: () => D.flame === null ? '' : (D.flame ? 'var(--bad)' : 'var(--ok)'),
};
const DOT = {
  temp: () => espOk() && D.temp !== null ? 'ok' : '',
  press: () => espOk() && D.press !== null ? 'ok' : '',
  co2: () => espOk() && D.co2 !== null ? co2Info(D.co2).cls : '',
  flame: () => !espOk() || D.flame === null ? '' : (D.flame ? 'bad' : 'ok'),
  water: () => !espOk() || D.water === null ? '' : (waterPct() > 10 ? 'warn' : 'ok'),
  esp: () => espOk() ? 'ok' : (rosOk ? 'warn' : 'bad'),
  ros: () => rosOk ? 'ok' : 'bad',
  sens: () => !espOk() ? '' : (D.status === 'OK' ? 'ok' : 'bad'),
  wifi: () => D.sys.wifi_dbm === undefined ? '' : (D.sys.wifi_dbm > -70 ? 'ok' : 'warn'),
};
const BAR = {
  cpu: () => D.sys.cpu || 0, ram: () => D.sys.ram || 0, disk: () => D.sys.disk || 0,
  water: () => D.water === null ? 0 : waterPct(),
};

function render() {
  $$('[data-k]').forEach(el => {
    const k = el.dataset.k;
    if (!F[k]) return;
    const t = F[k]();
    if (el.textContent !== t) el.textContent = t;
    if (C[k]) { el.classList.remove('st-ok', 'st-wait', 'st-fail'); el.classList.add(C[k]()); }
  });
  $$('[data-color]').forEach(el => { el.style.color = COLOR[el.dataset.color](); });
  $$('[data-dot]').forEach(el => { el.className = 'dot ' + DOT[el.dataset.dot](); });
  $$('[data-bar]').forEach(el => { el.style.width = Math.max(0, Math.min(100, BAR[el.dataset.bar]())) + '%'; });

  let text, cls;
  if (!rosOk)        { text = 'Нет связи';           cls = 'bad'; }
  else if (!espOk()) { text = 'Нет данных «головы»'; cls = 'warn'; }
  else               { text = 'Ровер онлайн';        cls = 'ok'; }
  $('online-text').textContent = text;
  $('online-text').style.color = `var(--${cls})`;
  $('online-dot').className = 'dot ' + cls;
  $('side-pill').textContent = cls === 'ok' ? 'Онлайн' : text;
  $('side-pill').className = 'pill ' + cls;
  $('alarm').style.display = D.flame && espOk() ? 'block' : 'none';
  renderDonut();
}

// ---------------- навигация по страницам ----------------
function buildNav() {
  PAGES.forEach(p => {
    $('topnav').insertAdjacentHTML('beforeend',
      `<a href="#${p.id}" data-page="${p.id}"><svg class="i"><use href="#${p.icon}"/></svg><span class="lbl">${p.title}</span></a>`);
    $('sidenav').insertAdjacentHTML('beforeend',
      `<a href="#${p.id}" data-page="${p.id}"><svg class="i"><use href="#${p.icon}"/></svg>${p.title}</a>`);
    $('page-' + p.id).insertAdjacentHTML('afterbegin',
      `<div class="page-head"><h1>${p.title}</h1><span>${p.sub}</span></div>`);
  });
}
function showPage() {
  const id = location.hash.slice(1);
  const page = PAGES.find(p => p.id === id) || PAGES[0];
  $$('.page').forEach(s => s.classList.toggle('active', s.id === 'page-' + page.id));
  $$('[data-page]').forEach(a => a.classList.toggle('active', a.dataset.page === page.id));
  document.title = page.title + ' — Одиссея';
  render();
  drawCharts();
}
window.addEventListener('hashchange', showPage);

// ---------------- часы ----------------
function tick() {
  const d = new Date();
  $('clock').textContent = d.toLocaleTimeString('ru-RU');
  $('date').textContent = d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ---------------- подключение к ROS 2 ----------------
const ROS_URL = 'ws://' + (location.hostname || 'localhost') + ':9090';
const ros = location.protocol === 'https:' ? new ROSLIB.Ros() : new ROSLIB.Ros({ url: ROS_URL });
ros.on('connection', () => { rosOk = true; refreshNodes(); render(); });
ros.on('error', () => { rosOk = false; render(); });
ros.on('close', () => {
  rosOk = false; render();
  setTimeout(() => location.reload(), 3000);       // переподключение
});

function sub(name, type, cb, isHead = true) {
  new ROSLIB.Topic({ ros, name, messageType: type }).subscribe(msg => {
    if (isHead) D.lastHead = Date.now();
    cb(msg);
  });
}

sub('/odyssey/head/temperature', 'sensor_msgs/msg/Temperature', m => {
  D.temp = m.temperature; push('temp', m.temperature);
});
sub('/odyssey/head/humidity', 'sensor_msgs/msg/RelativeHumidity', m => {
  D.hum = m.relative_humidity * 100;
});
sub('/odyssey/head/pressure', 'sensor_msgs/msg/FluidPressure', m => {
  D.press = m.fluid_pressure / 100;
});
sub('/odyssey/head/co2', 'std_msgs/msg/Int32', m => {
  D.co2 = m.data; push('co2', m.data);
});
sub('/odyssey/head/water', 'std_msgs/msg/Int32', m => { D.water = m.data; });
sub('/odyssey/head/flame', 'std_msgs/msg/Bool', m => { D.flame = m.data; });
sub('/odyssey/head/status', 'std_msgs/msg/String', m => { D.status = m.data; });

sub('/odyssey/system', 'std_msgs/msg/String', m => {
  try { D.sys = JSON.parse(m.data); } catch (e) { return; }
  if (D.sys.cpu_temp !== undefined) push('cpuTemp', D.sys.cpu_temp);
  if (D.sys.cpu !== undefined) push('cpu', D.sys.cpu);
  if (D.sys.ram !== undefined) push('ram', D.sys.ram);
}, false);

// ---------------- узлы ROS 2 ----------------
function refreshNodes() {
  if (!rosOk) return;
  const srv = new ROSLIB.Service({ ros, name: '/rosapi/nodes', serviceType: 'rosapi_msgs/srv/Nodes' });
  srv.callService({}, res => {
    nodes = (res.nodes || []).sort();
    $('nodelist').innerHTML = nodes.length
      ? nodes.map(n => `<div><span class="dot ok"></span>${n}<span class="val st-ok">Активен</span></div>`).join('')
      : '<div class="empty">Узлов нет</div>';
  }, () => {});
}

// ---------------- логи (/rosout) ----------------
const LEVELS = { 10: 'DEBUG', 20: 'INFO', 30: 'WARN', 40: 'ERROR', 50: 'FATAL' };
const logs = [];
const logCount = { DEBUG: 0, INFO: 0, WARN: 0, ERROR: 0, FATAL: 0 };
const logNodes = new Set();
let logPaused = false;

function esc(s) { return String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }
function fmtTime(d) {
  return d.toLocaleTimeString('ru-RU') + '.' + String(d.getMilliseconds()).padStart(3, '0');
}
function logMatches(e) {
  const lv = e.lv === 'FATAL' ? 'ERROR' : e.lv;
  const levels = [...$$('.lvf')].filter(c => c.checked).map(c => c.value);
  if (!levels.includes(lv)) return false;
  const node = $('log-node').value;
  if (node && e.name !== node) return false;
  const q = $('log-search').value.trim().toLowerCase();
  if (q && !(e.msg.toLowerCase().includes(q) || e.name.toLowerCase().includes(q))) return false;
  return true;
}
function logLineHtml(e) {
  return `<div class="logline ${e.lv}"><span>${fmtTime(e.t)}</span><span class="lv-${e.lv}">[${e.lv}]</span>` +
         `<span class="n">[${esc(e.name)}]</span><span>${esc(e.msg)}</span></div>`;
}
function appendLog(e) {
  const box = $('logbox');
  const empty = box.querySelector('.empty');
  if (empty) empty.remove();
  box.insertAdjacentHTML('beforeend', logLineHtml(e));
  while (box.children.length > 500) box.firstElementChild.remove();
  if ($('log-auto').checked) box.scrollTop = box.scrollHeight;
}
function rerenderLogs() {
  const shown = logs.filter(logMatches).slice(-500);
  $('logbox').innerHTML = shown.length ? shown.map(logLineHtml).join('')
                                       : '<div class="empty">Нет сообщений по выбранным фильтрам</div>';
  if ($('log-auto').checked) $('logbox').scrollTop = $('logbox').scrollHeight;
}
function renderDonut() {
  const total = logCount.DEBUG + logCount.INFO + logCount.WARN + logCount.ERROR + logCount.FATAL;
  if (!total) { $('donut').style.background = '#2a2f37'; return; }
  const parts = [[logCount.INFO, 'var(--ok)'], [logCount.DEBUG, 'var(--blue)'],
                 [logCount.WARN, 'var(--warn)'], [logCount.ERROR + logCount.FATAL, 'var(--bad)']];
  let acc = 0;
  const stops = parts.map(([v, c]) => {
    const a = acc / total * 360; acc += v; const b = acc / total * 360;
    return `${c} ${a}deg ${b}deg`;
  });
  $('donut').style.background = `conic-gradient(${stops.join(',')})`;
}

sub('/rosout', 'rcl_interfaces/msg/Log', m => {
  const e = { t: new Date(m.stamp.sec * 1000 + Math.floor(m.stamp.nanosec / 1e6)),
              lv: LEVELS[m.level] || 'INFO', name: m.name, msg: m.msg };
  logs.push(e);
  if (logs.length > 2000) logs.shift();
  logCount[e.lv]++;
  if (!logNodes.has(e.name)) {
    logNodes.add(e.name);
    $('log-node').insertAdjacentHTML('beforeend', `<option>${esc(e.name)}</option>`);
  }
  if (!logPaused && logMatches(e)) appendLog(e);
}, false);

function setupLogs() {
  $$('.lvf').forEach(c => c.addEventListener('change', rerenderLogs));
  $('log-node').addEventListener('change', rerenderLogs);
  $('log-search').addEventListener('input', rerenderLogs);
  $('log-pause').addEventListener('click', () => {
    logPaused = !logPaused;
    $('log-pause').classList.toggle('on', logPaused);
    $('log-pause').lastChild.textContent = logPaused ? 'Продолжить' : 'Пауза';
    if (!logPaused) rerenderLogs();
  });
  $('log-clear').addEventListener('click', () => {
    logs.length = 0;
    Object.keys(logCount).forEach(k => { logCount[k] = 0; });
    $('logbox').innerHTML = '<div class="empty">Ожидание сообщений…</div>';
    render();
  });
  $('log-save').addEventListener('click', () => {
    const text = logs.map(e => `${fmtTime(e.t)} [${e.lv}] [${e.name}] ${e.msg}`).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    a.download = 'odyssey-logs-' + new Date().toISOString().slice(0, 19).replace(/:/g, '-') + '.txt';
    a.click();
    URL.revokeObjectURL(a.href);
  });
}

// ---------------- графики ----------------
const CHARTS = {
  temp:  { series: () => [[H.temp, '#ff8a1f']], digits: 1 },
  co2:   { series: () => [[H.co2, '#5cc8ff']], digits: 0 },
  temps: { series: () => [[H.temp, '#ff8a1f'], [H.cpuTemp, '#b07cff']], digits: 1 },
  load:  { series: () => [[H.cpu, '#ff8a1f'], [H.ram, '#4a8fff']], digits: 0, min: 0, max: 100 },
};

function drawChart(cv, series, digits, fixMin, fixMax) {
  const dpr = window.devicePixelRatio || 1;
  const w = cv.clientWidth, h = cv.clientHeight;
  cv.width = w * dpr; cv.height = h * dpr;
  const c = cv.getContext('2d');
  c.scale(dpr, dpr);
  c.clearRect(0, 0, w, h);

  const top = 8, bottom = h - 18;
  c.strokeStyle = '#262b33'; c.lineWidth = 1;
  for (let i = 0; i <= 3; i++) {
    const y = top + (bottom - top) * i / 3;
    c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke();
  }
  const now = Date.now(), win = S.chartMin * 60000;
  c.fillStyle = '#5b616b'; c.font = '11px system-ui';
  c.fillText(`−${S.chartMin} мин`, 4, h - 4);
  c.fillText('сейчас', w - 40, h - 4);

  const visible = series.map(([a, col]) => [a.filter(p => p[0] >= now - win), col]);
  const all = visible.flatMap(([a]) => a.map(p => p[1]));
  if (!all.length) {
    c.fillStyle = '#5b616b'; c.font = '13px system-ui';
    c.fillText('нет данных', w / 2 - 34, (top + bottom) / 2);
    return;
  }
  let min = fixMin !== undefined ? fixMin : Math.min(...all);
  let max = fixMax !== undefined ? fixMax : Math.max(...all);
  if (max - min < 1) { max += 0.5; min -= 0.5; }

  visible.forEach(([a, col]) => {
    if (a.length < 2) return;
    const pts = a.map(([t, v]) => [w - (now - t) / win * w, top + (bottom - top) * (1 - (v - min) / (max - min))]);
    if (series.length === 1) {
      const g = c.createLinearGradient(0, top, 0, bottom);
      g.addColorStop(0, col + '55'); g.addColorStop(1, col + '00');
      c.beginPath();
      pts.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y));
      c.lineTo(pts[pts.length - 1][0], bottom); c.lineTo(pts[0][0], bottom); c.closePath();
      c.fillStyle = g; c.fill();
    }
    c.beginPath();
    pts.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y));
    c.strokeStyle = col; c.lineWidth = 2; c.stroke();
  });

  c.fillStyle = '#8b929c'; c.font = '12px system-ui';
  c.fillText(max.toFixed(digits), 4, top + 12);
  c.fillText(min.toFixed(digits), 4, bottom - 4);
}

function drawCharts() {
  $$('canvas[data-chart]').forEach(cv => {
    if (!cv.clientWidth) return;                    // график на скрытой странице
    const ch = CHARTS[cv.dataset.chart];
    drawChart(cv, ch.series(), ch.digits, ch.min, ch.max);
  });
}

// ---------------- настройки ----------------
function setupSettings() {
  const fill = () => {
    $('set-water').value = S.waterFull;
    $('set-chart').value = String(S.chartMin);
    $('set-co2warn').value = S.co2Warn;
    $('set-co2bad').value = S.co2Bad;
  };
  const save = () => {
    try { localStorage.setItem('odyssey-settings', JSON.stringify(S)); } catch (e) {}
  };
  fill();
  $('set-save').addEventListener('click', () => {
    const w = parseInt($('set-water').value, 10);
    const cw = parseInt($('set-co2warn').value, 10);
    const cb = parseInt($('set-co2bad').value, 10);
    if (!(w > 0) || !(cw > 0) || !(cb > cw)) {
      $('set-msg').textContent = 'Проверьте значения: порог «опасно» должен быть больше «душно»';
      return;
    }
    S.waterFull = w; S.chartMin = parseInt($('set-chart').value, 10); S.co2Warn = cw; S.co2Bad = cb;
    save();
    $('set-msg').textContent = 'Сохранено';
    render(); drawCharts();
  });
  $('set-reset').addEventListener('click', () => {
    Object.assign(S, DEFAULTS);
    save(); fill();
    $('set-msg').textContent = 'Сброшено по умолчанию';
    render(); drawCharts();
  });
}

// ---------------- запуск ----------------
buildNav();
setupLogs();
setupSettings();
showPage();
tick();
setInterval(tick, 1000);
setInterval(render, 500);
setInterval(drawCharts, 2000);
setInterval(refreshNodes, 5000);
window.addEventListener('resize', drawCharts);
