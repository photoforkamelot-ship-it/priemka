/* Приёмка магазина — Mini App (без сборки, чистый JS).
   #objects · #new · #instr
   #o/<id>            Подготовка (19 пунктов «Не забывай» с данными объекта)
   #o/<id>/walk/<n>   Обход · #o/<id>/zone/<n>/<i> · #o/<id>/rnew/<n>/<i> · #o/<id>/r/<rid>
   #o/<id>/data       Данные объекта и люди (подсказки из справочников)
   #o/<id>/instr      Инструкции
   #o/<id>/contracts · /ahch · /dvornik */
(function () {
  "use strict";
  const tg = window.Telegram && Telegram.WebApp;
  const inTg = !!(tg && tg.initData);
  if (tg) { tg.ready(); tg.expand(); if (tg.colorScheme === "dark") document.documentElement.classList.add("dark"); }
  const MEMO = "memo/pamyatka-otkrytiya/";
  const ORIG = "memo/";
  const $top = document.getElementById("top"), $app = document.getElementById("app");
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt = (d) => (d ? d.split("-").reverse().join(".") : "—");
  const fmtShort = (d) => (d ? d.split("-").reverse().slice(0, 2).join(".") : "—");

  async function api(method, path, body) {
    const r = await fetch(path, {
      method, headers: { "Content-Type": "application/json", "X-Telegram-Init-Data": tg ? tg.initData : "" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const ct = r.headers.get("Content-Type") || "";
    const data = ct.includes("json") ? await r.json() : await r.blob();
    if (!r.ok) throw new Error((data && data.error) || "ошибка " + r.status);
    return data;
  }
  // ---------- отклик: вибрация (Telegram) и короткий звук ----------
  const HAP = tg && tg.HapticFeedback;
  let soundOn = true; try { soundOn = localStorage.getItem("sound") !== "off"; } catch (e) {}
  let AC = null;
  function tone(notes) {
    if (!soundOn) return;
    try {
      AC = AC || new (window.AudioContext || window.webkitAudioContext)();
      if (AC.state === "suspended") AC.resume();
      let t = AC.currentTime;
      notes.forEach(([f, d, v]) => {
        const o = AC.createOscillator(), g = AC.createGain();
        o.type = "sine"; o.frequency.value = f; g.gain.setValueAtTime(v || 0.05, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
        o.connect(g); g.connect(AC.destination); o.start(t); o.stop(t + d); t += d * 0.8;
      });
    } catch (e) {}
  }
  const fx = {
    tap() { HAP ? HAP.selectionChanged() : navigator.vibrate && navigator.vibrate(8); tone([[1400, 0.025, 0.035]]); },
    nav() { HAP ? HAP.impactOccurred("light") : navigator.vibrate && navigator.vibrate(12); tone([[700, 0.05, 0.03], [1050, 0.06, 0.03]]); },
    ok() { HAP ? HAP.notificationOccurred("success") : navigator.vibrate && navigator.vibrate([10, 40, 10]); tone([[880, 0.07, 0.05], [1320, 0.11, 0.05]]); },
    err() { HAP ? HAP.notificationOccurred("error") : navigator.vibrate && navigator.vibrate([30, 40, 30]); tone([[260, 0.16, 0.06]]); },
  };
  document.addEventListener("pointerdown", (e) => { if (e.target.closest("button, a, summary, label, input[type=checkbox], select")) fx.tap(); }, { capture: true, passive: true });
  function toast(t, kind) { (kind === "err" || /ошибк|не удалось|нельзя|нет доступа|не найден|нужн|укажите|выберите/i.test(t) ? fx.err : /загружаю|проверяю/i.test(t) ? () => {} : fx.ok)();
    const el = document.getElementById("toast"); el.textContent = t; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => (el.hidden = true), 2400); }
  async function copy(t) {
    try { await navigator.clipboard.writeText(t); toast("Скопировано"); }
    catch (e) { const ta = document.createElement("textarea"); ta.value = t; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); toast("Скопировано"); } catch (_) { toast("Выделите текст и скопируйте"); } ta.remove(); }
  }
  const absUrl = (u) => new URL(u, location.href).href;
  /** Внешние ссылки, файлы, почта и звонки. В Telegram mailto:/tel: идут через go.html (в браузере телефона они открывают почту/звонилку). */
  function go(u) {
    // свои страницы-инструкции открываются внутри приложения (экран с кнопкой «Назад»), PDF и чужие сайты — в браузере Telegram
    const abs = /^(mailto|tel):/i.test(u) ? "" : absUrl(u);
    if (abs && abs.startsWith(location.origin + "/") && /\.html?(#.*)?$/i.test(abs.split("?")[0])) {
      location.hash = "#doc/" + encodeURIComponent(abs.slice(location.origin.length + 1)); return;
    }
    if (/^(mailto|tel):/i.test(u)) {
      // уникальный адрес каждый раз — иначе браузер Telegram показывает прошлый черновик
      if (inTg) tg.openLink(absUrl("go.html") + "?t=" + Date.now() + "#" + encodeURIComponent(u)); else location.href = u;
      return;
    }
    if (inTg) tg.openLink(absUrl(u)); else window.open(absUrl(u), "_blank");
  }
  // шапка уезжает вверх при прокрутке вниз и возвращается при прокрутке вверх
  let lastY = 0, ticking = false;
  window.addEventListener("scroll", () => {
    if (lastRoute === location.hash && !location.hash.startsWith("#doc/")) SCROLL[location.hash] = window.scrollY;
    if (ticking) return; ticking = true;
    requestAnimationFrame(() => {
      const y = window.scrollY, h = $top.offsetHeight;
      const hide = y > lastY && y > h;
      if (Math.abs(y - lastY) > 6) { $top.classList.toggle("hid", hide); document.documentElement.style.setProperty("--topH", (hide ? 0 : h) + "px"); lastY = y; }
      ticking = false;
    });
  }, { passive: true });
  document.addEventListener("focusin", (e) => {
    if (!e.target.matches("input:not([type=checkbox]):not([type=file]), textarea, select")) return;
    document.body.classList.add("kb");
    setTimeout(() => e.target.scrollIntoView({ block: "center", behavior: "smooth" }), 350);
  });
  document.addEventListener("focusout", () => setTimeout(() => { if (!document.activeElement || !document.activeElement.matches("input, textarea, select")) document.body.classList.remove("kb"); }, 100));
  document.addEventListener("click", (e) => {
    const a = e.target.closest("a[href]");
    if (!a) return;
    const h = a.getAttribute("href");
    if (!h || h.startsWith("#") || h.startsWith("javascript")) return;
    e.preventDefault(); go(h);
  });

  function shareUrl(url, title) {
    if (inTg) return tg.openTelegramLink("https://t.me/share/url?url=" + encodeURIComponent(url) + "&text=" + encodeURIComponent(title));
    if (navigator.share) return navigator.share({ title, url }).catch(() => {});
    copy(url);
  }
  function top(o) {
    $top.hidden = false; $top.classList.remove("hid");
    // o: {back:[href,text], cap, title, right, tabs:[id,active], extra}
    $top.innerHTML = `<div class="in ${o.tabs ? "" : "pad"}">
      ${o.back ? `<a class="back" href="${o.back[0]}">← ${esc(o.back[1])}</a>` : ""}
      ${o.cap ? `<span class="cap">${esc(o.cap)}</span>` : ""}
      <div class="hrow"><h1>${esc(o.title)}</h1>${o.right || ""}</div>
      ${o.extra || ""}
      ${o.tabs ? tabs(o.tabs[0], o.tabs[1]) : ""}</div>`;
    requestAnimationFrame(() => document.documentElement.style.setProperty("--topH", $top.offsetHeight + "px"));
  }
  function tabs(id, on) {
    const t = [["prep", "Подготовка", `#o/${id}`], ["walk", "Обход", `#o/${id}/walk/1`], ["plan", "План", `#o/${id}/plan`], ["letter", "Письмо", `#o/${id}/letter/first`], ["data", "Данные", `#o/${id}/data`], ["instr", "Инструкции", `#o/${id}/instr`]];
    return `<nav class="tabs">${t.map(([k, n, h]) => `<a href="${h}" class="${k === on ? "on" : ""}">${n}</a>`).join("")}</nav>`;
  }
  const objLine = (o) => `${o.code}${o.city ? " · " + o.city : ""}${o.address ? ", " + o.address : ""}`;
  let lastRoute = "";
  // место на странице запоминается для каждого экрана: вернулись из инструкции — там же, где были
  const SCROLL = {};
  function render(html) {
    const same = lastRoute === location.hash, y = window.scrollY;
    $app.innerHTML = html; lastRoute = location.hash;
    const back = SCROLL[location.hash] || 0;
    window.scrollTo(0, same ? y : back);       // перерисовка того же экрана не прыгает наверх
    if (!same && back) setTimeout(() => window.scrollTo(0, back), 60);
  }
  function fail(e) {
    top({ title: "Не получилось" });
    render(`<div class="card"><span class="sub">${esc(e.message)}</span>
      ${inTg ? "" : `<span class="sub">Приложение открывается из Telegram: бот @priemka_yarche_bot → кнопка «Приёмка».</span>`}
      <button onclick="location.reload()">Обновить</button></div>`);
  }

  let DIR = null;
  async function directory() { if (!DIR) DIR = await api("GET", "/api/directory"); return DIR; }

  // ---------- объекты ----------
  function dayLabel(acc) {
    if (!acc) return "";
    const d = Math.round((new Date(acc) - new Date(new Date().toDateString())) / 864e5);
    return d > 0 ? `через ${d} дн.` : d === 0 ? "приёмка сегодня" : `день ${-d + 1}`;
  }
  async function objects() {
    const list = await api("GET", "/api/objects");
    setTimeout(() => { const c = document.getElementById("snd"); if (c) c.onchange = () => { soundOn = c.checked; try { localStorage.setItem("sound", soundOn ? "on" : "off"); } catch (e) {} if (soundOn) fx.ok(); }; }, 0);
    top({ cap: "Команда открытия", title: "Мои объекты", right: `<a class="btn small main" href="#new">+ Объект</a>` });
    render(`${list.length ? "" : `<div class="empty"><b>Объектов пока нет</b><span>Создайте объект — данные подставятся в письма, заявки, объявление и конверт.</span><a class="btn main" href="#new">+ Новый объект</a></div>`}
      ${list.map((o) => `<a class="card" href="#o/${o.id}">
        <div class="row" style="align-items:flex-start"><div style="display:flex;flex-direction:column;gap:3px">
          <span class="kicker">${esc(o.code)}${o.city ? " · " + esc(o.city) : ""} · ${esc(o.okrug)}</span><span class="big">${esc(o.address || "адрес не указан")}</span></div>
          ${o.missing_people ? `<span class="chip warn">данные: ${o.missing_people}</span>` : o.remarks_open ? `<span class="chip info">замечаний: ${o.remarks_open}</span>` : ""}</div>
        <div class="row sub"><span>Приёмка ${fmtShort(o.accept_date)} · открытие ${fmtShort(o.open_date)}</span><span>${dayLabel(o.accept_date)}</span></div>
        <div class="row sub"><span>Подготовка ${o.firstday_done} из ${o.firstday_total}</span><span style="color:var(--link);font-weight:600">Открыть →</span></div>
        <div class="bar"><i style="width:${(o.firstday_done / o.firstday_total) * 100}%"></i></div></a>`).join("")}
      <div class="group">Справка</div>
      <label class="card tick" style="font-weight:500;font-size:14px"><input type="checkbox" id="snd" ${soundOn ? "checked" : ""}> Звук нажатий и сохранений (вибрация — всегда)</label>
      <div class="list"><a href="#instr"><span class="t"><b>Инструкции</b><span>МК, ЯК, ЛМК, приём на работу, форма, дворник, покупюрник</span></span><span class="go">›</span></a></div>`);
  }

  // ---------- новый объект и данные ----------
  function segHtml(id, vals, on) { return `<div class="seg" id="${id}">${vals.map((x) => `<button type="button" data-v="${x}" class="${x === on ? "on" : ""}">${x}</button>`).join("")}</div>`; }
  function bindSeg(id, cb) {
    $app.querySelectorAll(`#${id} button`).forEach((b) => (b.onclick = () => {
      $app.querySelectorAll(`#${id} button`).forEach((x) => x.classList.remove("on")); b.classList.add("on"); cb && cb(b.dataset.v);
    }));
  }
  const segVal = (id) => ($app.querySelector(`#${id} .on`) || {}).dataset?.v;
  function storeCard(o, d) {
    return `<div class="card">
      <div class="grid2"><label class="f">Код магазина<input name="code" value="${esc(o.code)}" placeholder="ПР22" autocapitalize="characters" required></label>
      <label class="f">Город<input name="city" value="${esc(o.city)}" placeholder="Пермь" list="dl-cities"></label></div>
      <label class="f">Улица, дом<input name="address" value="${esc(o.address)}" placeholder="Комсомольский пр-т, 36"></label>
      <div id="storeHint"></div>
      <label class="f">Округ</label>${segHtml("okrug", ["СФО", "УФО", "ЦФО"], o.okrug || "СФО")}
      <div class="grid2"><label class="f">Приёмка<input type="date" name="accept_date" value="${o.accept_date || ""}"></label>
      <label class="f">Открытие <span class="sub">(приёмка + 4 дня)</span><input type="date" name="open_date" value="${o.open_date || ""}"></label></div>
      <label class="f">День заказа размена, печати, доверенности<input type="date" name="razmen_date" value="${(o.flags || {}).razmen_date || ""}"></label>
      <label class="f">Почта магазина<input name="store_email" type="email" value="${esc(o.store_email)}" placeholder="PR22@ya-retail.ru"></label>
      <datalist id="dl-cities">${(d.cities || []).map((c) => `<option value="${esc(c)}">`).join("")}</datalist></div>`;
  }
  function bindDates() {
    const a = field("accept_date"), b = field("open_date"); if (!a || !b) return;
    a.addEventListener("change", () => { if (!a.value || (b.value && b.dataset.auto !== "1")) return;
      const [y, m, dd] = a.value.split("-").map(Number); b.value = new Date(Date.UTC(y, m - 1, dd + 4)).toISOString().slice(0, 10); b.dataset.auto = "1"; });
    b.addEventListener("input", () => (b.dataset.auto = "0"));
  }
  const field = (n) => $app.querySelector(`[name="${n}"]`);
  /** По коду магазина — подсказка из справочника магазинов (существующий магазин) или по похожим кодам (округ, город, почта). */
  function bindStoreHint() {
    const code = field("code");
    const run = async () => {
      const v = code.value.trim().toUpperCase(); if (v.length < 2) return;
      let h; try { h = await api("GET", "/api/store/" + encodeURIComponent(v)); } catch (e) { return; }
      const box = document.getElementById("storeHint"); box.innerHTML = "";
      if (h.found) {
        box.innerHTML = `<div class="hint"><span>Есть в справочнике: ${esc(h.address)}${h.director ? " · управляющий " + esc(h.director) : ""}</span><button class="small" id="useStore">Подставить</button></div>`;
        document.getElementById("useStore").onclick = () => {
          if (h.city) field("city").value = h.city; if (h.street) field("address").value = h.street; if (h.email) field("store_email").value = h.email;
          $app.querySelectorAll("#okrug button").forEach((b) => b.classList.toggle("on", b.dataset.v === h.okrug));
          const dn = $app.querySelector('[data-person="director"] [data-f="name"]');
          if (dn && h.director && !dn.value) { dn.value = h.director; $app.querySelector('[data-person="director"] [data-f="phone"]').value = h.director_phone || ""; }
          box.innerHTML = ""; toast("Подставлено");
        };
        return;
      }
      if (h.okrug && !code.dataset.touched) $app.querySelectorAll("#okrug button").forEach((b) => b.classList.toggle("on", b.dataset.v === h.okrug));
      if (h.city && !field("city").value) field("city").value = h.city;
      if (h.email && !field("store_email").value) field("store_email").value = h.email;
    };
    code.addEventListener("change", run);
    $app.querySelectorAll("#okrug button").forEach((b) => b.addEventListener("click", () => (code.dataset.touched = "1")));
  }

  const ROLES = {
    director: { title: "Директор магазина", match: (p) => /Управляющий|Директор/.test(p.role), phone: true },
    coordinator: { title: "Координатор строительства", match: (p) => /Координатор/.test(p.role) },
    dev_manager: { title: "Менеджер по развитию региона", match: (p) => /менеджер по развитию/i.test(p.role) },
    mops_contractor: { title: "Подрядчик МОПы и ковры (ЦФО)", match: (p) => /МОП/.test(p.role), phone: true },
    trainer: { title: "Тренер по региону — у него куратор АХЧ и где брать размен", match: (p) => /тренер/i.test(p.role), phone: true },
    ahch_curator: { title: "Куратор службы АХЧ в регионе — звоним, чтобы был на приёмке", match: (p) => /АХЧ/.test(p.role), phone: true },
  };
  function personBlock(key, v, d, o) {
    const r = ROLES[key];
    const near = key === "director" || v.name ? [] : d.people.filter((p) => r.match(p) && p.area && (p.area === o.city || p.area === o.code)).slice(0, 3);
    return `<div class="person" data-person="${key}">
      <span class="title" style="font-size:14px">${r.title}</span>
      ${near.map((p) => `<div class="hint"><span>${o.city && p.area === o.city ? "Для г. " + esc(o.city) : esc(p.area)}: <b>${esc(p.name)}</b></span><button class="small" data-use="${esc(p.name)}">Выбрать</button></div>`).join("")}
      <input data-f="name" placeholder="Фамилия Имя Отчество — начните вводить" value="${esc(v.name)}" list="dl-${key}" autocomplete="off">
      <div class="grid2"><input data-f="phone" type="tel" placeholder="Телефон" value="${esc(v.phone)}">
      <input data-f="email" type="email" placeholder="Почта" value="${esc(v.email)}"></div>
      <datalist id="dl-${key}">${d.people.filter((p) => key === "director" ? r.match(p) || p.slot === key : true).map((p) => `<option value="${esc(p.name)}">${esc(p.role)}${p.area ? " · " + esc(p.area) : ""}</option>`).join("")}</datalist></div>`;
  }
  function bindPeople(d) {
    $app.querySelectorAll("[data-person]").forEach((box) => {
      const name = box.querySelector('[data-f="name"]');
      const fill = (p) => {
        name.value = p.name;
        const ph = box.querySelector('[data-f="phone"]'), em = box.querySelector('[data-f="email"]');
        if (p.phone) ph.value = p.phone; if (p.email) em.value = p.email;
      };
      name.addEventListener("change", () => { const p = d.people.find((x) => x.name === name.value.trim()); if (p) fill(p); });
      box.querySelectorAll("[data-use]").forEach((b) => (b.onclick = () => { const p = d.people.find((x) => x.name === b.dataset.use); if (p) { fill(p); b.closest(".hint").remove(); } }));
    });
  }
  function readForm() {
    const d = {};
    $app.querySelectorAll("input[name]").forEach((i) => (d[i.name] = i.value.trim()));
    d.okrug = segVal("okrug") || "СФО";
    $app.querySelectorAll("[data-person]").forEach((f) => {
      d[f.dataset.person] = {}; f.querySelectorAll("[data-f]").forEach((i) => (d[f.dataset.person][i.dataset.f] = i.value.trim()));
    });
    return d;
  }
  const REGIONAL = {
    "СФО": "Бухгалтер по кассе — Конохова Наталья, 8-913-864-98-24<br>АХЧ — заявка через «Ярче Коммуникации»",
    "УФО": "Бухгалтер по кассе — Русакова Наталья, 8-912-250-19-82<br>АХЧ — заявка через «Ярче Коммуникации»",
    "ЦФО": "Бухгалтер по кассе — Романова Мария, 8-916-754-57-51<br>АХЧ — в WhatsApp; Тверь/Калуга — почтой",
  };

  async function newObject() {
    const d = await directory();
    top({ back: ["#objects", "Объекты"], title: "Новый объект", extra: `<span class="sub">Вводится один раз — подставляется в письма, заявки, объявление, конверт и контакты</span>` });
    render(`${storeCard({}, d)}
      <div class="card"><span class="title">Люди объекта</span>${personBlock("director", {}, d, {})}${personBlock("trainer", {}, d, {})}${personBlock("ahch_curator", {}, d, {})}</div>
      <div class="bottom"><button class="main" id="save">Создать объект</button></div>`);
    bindSeg("okrug"); bindStoreHint(); bindPeople(d); bindDates();
    document.getElementById("save").onclick = async () => {
      const f = readForm(); if (!f.code) return toast("Укажите код магазина");
      try { const o = await api("POST", "/api/objects", f); toast("Объект создан"); location.hash = `#o/${o.id}/data`; } catch (e) { toast(e.message); }
    };
  }

  async function dataScreen(id) {
    const [o, d] = await Promise.all([api("GET", `/api/objects/${id}`), directory()]);
    top({ back: ["#objects", "Объекты"], cap: objLine(o), title: "Данные объекта", tabs: [id, "data"] });
    const keys = ["director", "coordinator", "dev_manager", "trainer", "ahch_curator"].concat(o.okrug === "ЦФО" ? ["mops_contractor"] : []);
    const don = o.razmen_donor || {};
    render(`${o.missing_people.length ? `<div class="card warnc"><b>Не заполнено: ${o.missing_people.length}</b><span class="sub">${esc(o.missing_people.join(", "))}</span></div>` : ""}
      ${storeCard(o, d)}
      <div class="card"><span class="title">Люди объекта</span><span class="sub">Подсказки — из справочника; ответственного выбираете вы</span>
        ${keys.map((k) => personBlock(k, o[k] || {}, d, o)).join("")}</div>
      <div class="card"><span class="title">Размен — из какого магазина</span><span class="sub">Узнайте у тренера. По коду подтянутся адрес, директор и телефон из справочника</span>
        <input id="donor" value="${esc(don.code || "")}" placeholder="код магазина, напр. ПР07" style="text-transform:uppercase">
        ${don.code ? `<span class="sub">${esc([don.address, don.director && "директор " + don.director, don.director_phone].filter(Boolean).join(" · ") || "в справочнике не найден")}</span>` : ""}</div>
      <a class="btn" href="#o/${id}/docs">📁 Документы объекта: электролаборатория, ЭОМ, договоры, лист АХЧ</a>
      <label class="card tick"><input type="checkbox" id="dv" ${o.flags.dvornik_hired ? "checked" : ""}> Дворник оформлен — напоминать про акт в конце месяца</label>
      <div class="card" style="background:var(--accent-soft);border:0"><span class="title" style="font-size:14px">Региональные — ${esc(o.okrug)}</span><span class="sub">${REGIONAL[o.okrug] || ""}</span></div>
      <button id="vcf">Контакты объекта в чат (.vcf)</button>
      <div class="bottom"><button class="main" id="save">Сохранить</button></div>`);
    bindSeg("okrug"); bindStoreHint(); bindPeople(d); bindDates();
    document.getElementById("save").onclick = async () => {
      try { await api("PUT", `/api/objects/${id}`, { ...readForm(), dvornik_hired: document.getElementById("dv").checked, razmen_donor: { code: document.getElementById("donor").value.trim().toUpperCase() } }); DIR = null; toast("Сохранено"); location.hash = `#o/${id}`; } catch (e) { toast(e.message); }
    };
    document.getElementById("vcf").onclick = () => printToChat(id, "vcf");
  }

  // ---------- подготовка: 19 пунктов «Не забывай» ----------
  let MEMO_HTML = null;
  async function memoHtml() {
    if (!MEMO_HTML) { const r = await fetch(MEMO + "index.html"); if (!r.ok) throw new Error("памятка не загрузилась"); MEMO_HTML = await r.text(); }
    return MEMO_HTML;
  }
  async function prep(id) {
    const [o, T, html] = await Promise.all([api("GET", `/api/objects/${id}`), api("GET", `/api/objects/${id}/texts`), memoHtml()]);
    const doc = new DOMParser().parseFromString(html, "text/html");
    const wrap = doc.querySelector(".wrap");
    wrap.querySelectorAll(".foot").forEach((x) => x.remove());
    wrap.querySelectorAll("a[href]").forEach((a) => {
      const h = a.getAttribute("href");
      if (!/^(https?:|mailto:|tel:|#)/.test(h)) a.setAttribute("href", MEMO + h);
      a.removeAttribute("target"); a.removeAttribute("download");
    });
    const reg = { "СФО": "sfo", "УФО": "ufo", "ЦФО": "cfo" }[o.okrug] || "sfo";
    wrap.querySelectorAll("[data-reg]").forEach((el) => { if (!el.dataset.reg.split(" ").includes(reg)) el.remove(); });
    const item = (n) => wrap.querySelector(`details.item[data-id="${n}"]`);
    const setText = (sel, t) => { const el = wrap.querySelector(sel); if (el && t) el.textContent = t; };
    setText("#grpName", T.whatsapp_group); setText("#sign", T.outlook_signature); setText("#mopTpl", T.mops);
    const body = (n) => item(n) && item(n).querySelector(".body");
    const before = (n, html) => { const b = body(n); if (b) b.querySelector("label.done").insertAdjacentHTML("beforebegin", html); };
    // ☎ тренер: куратор АХЧ и магазин для размена — вносятся здесь и расходятся по пунктам и напоминаниям
    const tel = (p) => (p || "").replace(/[^\d+]/g, "");
    const H = o.hints || {}, tr = o.trainer || {}, cu = o.ahch_curator || {}, don = o.razmen_donor || {};
    const pf = (k, p, lbl) => `<div class="pfield"><b>${lbl}</b><div class="grid2"><input data-pk="${k}" data-pf="name" value="${esc(p.name || "")}" placeholder="ФИО">
      <input data-pk="${k}" data-pf="phone" inputmode="tel" value="${esc(p.phone || "")}" placeholder="телефон"></div>
      ${p.phone ? `<a class="btn small" href="tel:${tel(p.phone)}">📞 ${esc(p.phone)}</a>` : ""}
      ${!p.name && H[k] ? `<button class="small ghost" data-hint="${k}">Как в прошлом объекте: ${esc(H[k].name)} ${esc(H[k].phone || "")} — подставить</button>` : ""}</div>`;
    const donorH = don.code ? `<div class="sub"><b>${esc(don.code)}</b>${don.address ? " · " + esc(don.address) : ""}${don.director ? " · директор " + esc(don.director) : ""}</div>
      ${don.director_phone ? `<a class="btn small" href="tel:${tel(don.director_phone)}">📞 ${esc(don.director_phone)}</a>` : ""}` : "";
    before(20, `<div class="pform">${pf("trainer", tr, "Тренер по региону")}${pf("ahch_curator", cu, "Куратор АХЧ в регионе")}
      <div class="pfield"><b>Размен — из какого магазина</b><input data-donor value="${esc(don.code || "")}" placeholder="код магазина, напр. ПР07" style="text-transform:uppercase">${donorH}</div></div>`);
    before(21, `<div class="btns"><button class="small" data-print="ahchlist">🖨 Лист готовности на печать</button><a class="btn small ghost" href="#o/${id}/walk/3">Скан — в «Обход → Этап 3»</a></div>`);
    before(21, cu.name || cu.phone ? `<div class="row"><span><b>${esc(cu.name || "Куратор АХЧ")}</b></span>${cu.phone ? `<a class="btn small main" href="tel:${tel(cu.phone)}">📞 Позвонить</a>` : ""}</div>`
      : `<div class="note">Контакт куратора — у тренера по региону. Внесите его в пункте ☎ выше.</div>`);
    // 1 — размен: магазин-донор из пункта ☎
    if (don.code) before(1, `<div class="card" style="gap:4px"><b>Размен из ${esc(don.code)}</b>${donorH}</div>`);
    // 1 — размен: доступ к кассе отдельной галкой (на неё смотрят напоминания бота)
    before(1, `<label class="done"><input type="checkbox" data-k="cash"> Доступ к кассе получен</label>`);
    // 3 — кнопки «На печать» пока нет
    if (body(3)) body(3).querySelectorAll(".note").forEach((x) => x.remove());
    // 14 — договоры: статус и экран договоров вместо шаблона
    const c = o.contracts || {}, got = Object.values(c).filter((x) => x.status === "received").length;
    const tpl = wrap.querySelector("#dogTpl"); if (tpl) { const bb = tpl.nextElementSibling; tpl.remove(); if (bb && bb.classList.contains("btns")) bb.remove(); }
    before(14, `<div class="row"><span class="chip ${got === 4 ? "ok" : "warn"}">получено ${got} из 4</span><a class="btn main" href="#o/${id}/contracts">Договоры и запрос</a></div>
      <a class="btn small ghost" href="#o/${id}/docs">📁 Все документы объекта: электролаборатория, ЭОМ, лист АХЧ</a>`);
    // 15 — АХЧ в приложении
    const ah = body(15) && body(15).querySelector('a[href*="instr/ahch"]'); if (ah) { ah.setAttribute("href", `#o/${id}/ahch`); ah.textContent = "Собрать заявку"; }
    // 16 — МОПы: контакт подрядчика в данных
    if (body(16)) before(16, `<div class="btns"><a class="btn" href="#o/${id}/data">Контакт подрядчика</a></div>`);
    // 17 — дворник: объявление и вкладыш с данными объекта
    const dv = body(17) && body(17).querySelector(".btns"); if (dv) dv.insertAdjacentHTML("afterbegin", `<a class="btn main" href="#o/${id}/dvornik">Объявление и конверт</a>`);
    // готовые письма из памятки: текст, копия на почту магазина
    const mt = (to, subj, body) => `mailto:${to}?` + [o.store_email && "cc=" + o.store_email, "subject=" + encodeURIComponent(subj), "body=" + encodeURIComponent(body)].filter(Boolean).join("&");
    const fa = (o.city ? "г. " + o.city + ", " : "") + (o.address || "");
    const dirName = (o.director && o.director.name) || "________________";
    const MAILS = {
      "e.badeeva@": mt("e.badeeva@ya-retail.ru", "График Инкассации и Размена. Новое ОСП",
        `Елена, добрый день!\n\nОткрывается новый магазин ${o.code}, ${fa}.\nДата приёмки — ${fmt(o.accept_date)}, дата открытия — ${fmt(o.open_date)}.\nПросьба сообщить дни инкассации и размена для нового ОСП.\n\nЗаранее благодарю!`),
      "o.pavlovskaya@": mt("o.pavlovskaya@ya-retail.ru", "Заявка на доверенность и печать. Новый магазин и УМ",
        `Ольга, добрый день!\n\nНовый магазин ${o.code}, ${fa}, открытие ${fmt(o.open_date)}.\nВ «Ярче Коммуникациях» созданы заявки на доверенность и печать для управляющего магазином: ${dirName}.\nПросьба взять в работу.\n\nЗаранее благодарю!`),
    };
    wrap.querySelectorAll('a[href^="mailto:"]').forEach((a) => { const k = Object.keys(MAILS).find((x) => a.getAttribute("href").includes(x)); if (k) a.setAttribute("href", MAILS[k]); });
    // контакты: телефон и почта — кнопками «Позвонить» / «Написать»
    wrap.querySelectorAll(".p .c").forEach((c) => {
      const t = c.textContent.trim();
      const digits = t.replace(/[^\d+]/g, "");
      if (/@/.test(t)) c.outerHTML = `<a class="btn small" href="mailto:${t}?subject=${encodeURIComponent(o.code + " " + fa)}">✉ ${t}</a>`;
      else if (digits.length >= 10) c.outerHTML = `<a class="btn small" href="tel:${digits}">📞 ${t}</a>`;
    });
    // галки «Сделано» → сервер
    wrap.querySelectorAll("details.item").forEach((dt) => {
      const cb = dt.querySelector("label.done:last-of-type input"); cb.dataset.k = "m" + dt.dataset.id;
      dt.querySelectorAll("input[data-k]").forEach((x) => (x.checked = !!o.first_day_done[x.dataset.k]));
      dt.dataset.done = cb.checked ? "1" : "0";
    });
    const items = [...wrap.querySelectorAll("details.item")];
    const prog = () => items.filter((d) => d.dataset.done === "1").length;
    top({ back: ["#objects", "Объекты"], cap: objLine(o), title: "Подготовка", tabs: [id, "prep"],
      right: `<span class="sub" style="font-weight:700" id="prog">${prog()} из ${items.length}</span>`,
      extra: `<div class="bar"><i id="barI" style="width:${(prog() / items.length) * 100}%"></i></div>` });
    render(`<div class="row"><span class="sub">Памятка «Не забывай» с данными объекта</span><button class="small" id="shareMemo">Поделиться памяткой</button></div>` + wrap.innerHTML);
    document.getElementById("shareMemo").onclick = () => shareUrl(absUrl(MEMO + "index.html"), "Не забывай — памятка открытия");
    const live = [...$app.querySelectorAll("details.item")];
    const upd = () => { const n = live.filter((d) => d.dataset.done === "1").length; document.getElementById("prog").textContent = `${n} из ${live.length}`; document.getElementById("barI").style.width = (n / live.length) * 100 + "%"; };
    $app.querySelectorAll("input[data-k]").forEach((cb) => (cb.onchange = async () => {
      const dt = cb.closest("details");
      if (cb.dataset.k.startsWith("m")) { dt.dataset.done = cb.checked ? "1" : "0"; upd(); }
      try { await api("POST", `/api/objects/${id}/firstday/${cb.dataset.k}`, { done: cb.checked }); } catch (e) { toast(e.message); }
    }));
    $app.querySelectorAll("[data-copy]").forEach((b) => (b.onclick = () => copy(document.getElementById(b.dataset.copy).textContent)));
    $app.querySelectorAll("[data-print]").forEach((b) => (b.onclick = () => printToChat(id, b.dataset.print)));
    const savePrep = async (d) => { try { await api("PUT", `/api/objects/${id}`, d); toast("Сохранено"); prep(id); } catch (e) { toast(e.message); } };
    $app.querySelectorAll("[data-pk]").forEach((inp) => (inp.onchange = () => savePrep({ [inp.dataset.pk]: { [inp.dataset.pf]: inp.value.trim() } })));
    $app.querySelectorAll("[data-hint]").forEach((b) => (b.onclick = () => savePrep({ [b.dataset.hint]: H[b.dataset.hint] })));
    const dn = $app.querySelector("[data-donor]"); if (dn) dn.onchange = () => savePrep({ razmen_donor: { code: dn.value.trim().toUpperCase() } });
    const ip = document.getElementById("ipIn"), out = document.getElementById("ipOut");
    if (ip) ip.oninput = () => { const p = ip.value.trim().split("."); out.textContent = p.length === 4 ? p.slice(0, 3).join(".") + ".20" : "—"; };
    const key = "open:" + id;
    let opened = []; try { opened = JSON.parse(sessionStorage.getItem(key) || "[]"); } catch (e) {}
    live.forEach((d) => { if (opened.includes(d.dataset.id)) d.open = true;
      d.addEventListener("toggle", () => { const ids = live.filter((x) => x.open).map((x) => x.dataset.id); try { sessionStorage.setItem(key, JSON.stringify(ids)); } catch (e) {} }); });
  }

  // ---------- инструкции ----------
  const INSTR = [
    ["Приложения и доступы", [
      ["Мобильные кадры — iPhone", "установка через TestFlight, вход · исходник от 19.06.2025", MEMO + "instr/mk/mk-ios.html"],
      ["Мобильные кадры — Android", "установка, вход · исходник от 19.06.2025", MEMO + "instr/mk/mk-android.html"],
      ["Ярче Коммуникации — iPhone", "App Store, вход через кассу · исходник от 11.08.2026", MEMO + "instr/yk/index.html"],
      ["Ярче Коммуникации — Android", "RuStore, вход через кассу · исходник от 11.08.2026", MEMO + "instr/yk/yk-android.html"],
      ["ЛМК-Контроль — телефон", "карточка, направления, ЭЛМК, журналы", MEMO + "instr/lmk/lmk-mobile.html"],
      ["ЛМК-Контроль — компьютер", "полная инструкция", MEMO + "instr/lmk/lmk.html"]]],
    ["Персонал", [
      ["Приём на работу", "+ бланки с образцами · «Кадровое делопроизводство»", MEMO + "instr/priem/priem.html"],
      ["Спецодежда на кассе", "после доступа к кассе", MEMO + "instr/forma/forma.html"],
      ["Дворник по договору ГПХ", "объявление, конверт, договор, акт", MEMO + "instr/dvornik/dvornik.html"]]],
    ["Касса", [["Размен: передача ДС через ЯК", "Выдача ДС · ПКО/РКО · первый отчёт 0,01", MEMO + "instr/ds/peredacha-ds.html"], ["Покупюрник и кассовая дисциплина", "СФО/УФО от 01.07.2026 · ЦФО от 02.07.2025", MEMO + "instr/pokup/pokupyurnik.html"]]],
    ["Исходные документы (PDF)", [
      ["Мобильные кадры", "от 19.06.2025", ORIG + "pamyatka-originaly-1/mobilnye-kadry-instrukciya-19.06.2025.pdf"],
      ["Ярче Коммуникации", "от 11.08.2026", ORIG + "pamyatka-originaly-1/yarche-kommunikacii-instrukciya-11.08.2026.pdf"],
      ["Кадровое делопроизводство", "2025", ORIG + "pamyatka-originaly-2/kadrovoe-deloproizvodstvo-2025.pdf"],
      ["Кассовая дисциплина СФО и УФО", "от 01.07.2026", ORIG + "pamyatka-originaly-2/kassovaya-disciplina-sfo-ufo-01.07.2026.pdf"],
      ["Кассовая дисциплина ЦФО", "от 02.07.2025", ORIG + "pamyatka-originaly-2/kassovaya-disciplina-cfo-02.07.2025.pdf"],
      ["МК: договоры и акты (дворник)", "от 19.06.2025", ORIG + "pamyatka-originaly-2/mk-dogovory-i-akty-19.06.2025.pdf"],
      ["Памятка по дворнику ГПХ", "от 02.05.2023", ORIG + "pamyatka-originaly-2/pamyatka-dvornik-gph-02.05.2023.pdf"]]],
  ];
  async function instrScreen(id) {
    let o = null; if (id) o = await api("GET", `/api/objects/${id}`);
    top(o ? { back: ["#objects", "Объекты"], cap: objLine(o), title: "Инструкции", tabs: [id, "instr"] } : { back: ["#objects", "Объекты"], title: "Инструкции" });
    render(INSTR.map(([g, rows]) => `<div class="group">${g}</div><div class="list">${rows.map(([t, s, u]) =>
      `<a href="${u}"><span class="t"><b>${esc(t)}</b><span>${esc(s)}</span></span><span class="go">${u.endsWith(".pdf") ? "PDF" : "›"}</span></a>`).join("")}</div>`).join("")
      + `<div class="group">Ещё</div><div class="list">
        <a href="${MEMO}index.html"><span class="t"><b>Памятка «Не забывай» целиком</b><span>19 пунктов, без привязки к объекту</span></span><span class="go">›</span></a>
        ${o ? `<a href="#o/${id}/ahch"><span class="t"><b>Заявка АХЧ</b><span>16 работ по образцу</span></span><span class="go">›</span></a>` : ""}
        <a href="${MEMO}files/kontakty-otkrytie.vcf"><span class="t"><b>Контакты открытия (.vcf)</b><span>все номера одним файлом</span></span><span class="go">↓</span></a></div>`);
  }

  // ---------- договоры ----------
  const TITLES = { arenda: "Аренда", tko: "ТКО", dez: "Дезинсекция/дератизация", ops: "ОПС" };
  async function contractsScreen(id) {
    const o = await api("GET", `/api/objects/${id}`);
    const c = o.contracts, got = Object.keys(TITLES).filter((k) => c[k].status === "received").length;
    top({ back: [`#o/${id}`, "Подготовка"], cap: objLine(o), title: "Договоры", right: `<span class="chip ${got === 4 ? "ok" : "warn"}">${got} из 4</span>` });
    render(`<span class="sub">Файл узнаётся по тексту и засчитывается, если в нём есть адрес магазина</span>
      <div class="list">${Object.keys(TITLES).map((k) => `<div><span class="t"><b>${TITLES[k]}</b><span>${c[k].status === "received" ? esc([c[k].number && "№ " + c[k].number, c[k].doc_date].filter(Boolean).join(" · ") || "получен") : "нет файла"}</span></span>
        <span class="chip ${c[k].status === "received" ? "ok" : "bad"}">${c[k].status === "received" ? "есть" : "нет"}</span></div>`).join("")}</div>
      <label class="btn">+ Загрузить PDF договора<input type="file" accept="application/pdf" id="file" hidden></label>
      <div id="manual"></div>
      ${got < 4 ? `<div class="card"><span class="title">Запросить недостающие</span>
        <label class="f">У кого<select id="to"><option value="">— выберите —</option>${o.dev_manager.name ? `<option value="dev_manager">${esc(o.dev_manager.name)} · менеджер по развитию</option>` : ""}<option value="custom">Другой человек</option></select></label>
        <div id="custom" hidden class="grid2"><input id="cn" placeholder="Имя Фамилия"><input id="ce" type="email" placeholder="Почта"></div>
        <button class="main" id="req" disabled>Выберите, у кого запросить</button>
        <pre class="tpl" id="preview" hidden></pre></div>` : ""}`);
    const sel = document.getElementById("to"), req = document.getElementById("req");
    if (sel) {
      sel.onchange = () => { document.getElementById("custom").hidden = sel.value !== "custom"; req.disabled = !sel.value; req.textContent = "Показать письмо"; req.onclick = build; };
      const build = async () => {
        const body = sel.value === "custom" ? { to: "custom", custom: { name: document.getElementById("cn").value, email: document.getElementById("ce").value } } : { to: "dev_manager" };
        try {
          const r = await api("POST", `/api/objects/${id}/contracts/request`, body);
          if (r.all_received) return toast("Все договоры получены");
          const pv = document.getElementById("preview"); pv.hidden = false;
          pv.textContent = `Кому: ${r.to}\nКопия: ${r.cc}\nТема: ${r.subject}\n\n${r.body}`;
          req.textContent = r.button + " — открыть почту"; req.onclick = () => go(r.mailto);
        } catch (e) { toast(e.message); }
      };
    }
    document.getElementById("file").onchange = async (ev) => {
      const f = ev.target.files[0]; if (!f) return;
      const b64 = await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result.split(",")[1]); fr.readAsDataURL(f); });
      try {
        toast("Проверяю файл…");
        const r = await api("POST", `/api/objects/${id}/contracts/upload`, { file_b64: b64 });
        if (r.need_manual || r.warn_address) return manualPick(id, b64, r);
        toast("Засчитано: " + r.slots.map((s) => TITLES[s]).join(", ")); contractsScreen(id);
      } catch (e) { toast(e.message); }
    };
  }
  function manualPick(id, b64, r) {
    const box = document.getElementById("manual");
    box.innerHTML = `<div class="card warnc"><b>Проверьте вручную</b><span class="sub">${esc(r.reason || "")}</span>
      ${Object.keys(TITLES).map((k) => `<label class="tick"><input type="checkbox" value="${k}" ${(r.slots || []).includes(k) ? "checked" : ""}> ${TITLES[k]}</label>`).join("")}
      <button class="main" id="force">Засчитать отмеченные</button></div>`;
    document.getElementById("force").onclick = async () => {
      const slots = [...box.querySelectorAll("input:checked")].map((x) => x.value); if (!slots.length) return toast("Отметьте договор");
      try { await api("POST", `/api/objects/${id}/contracts/upload`, { file_b64: b64, slots, force: true }); toast("Засчитано"); contractsScreen(id); } catch (e) { toast(e.message); }
    };
  }

  // ---------- АХЧ ----------
  async function ahchScreen(id) {
    const o = await api("GET", `/api/objects/${id}`);
    const base = await api("POST", `/api/objects/${id}/ahch`, {});
    let items = base.defaults.map((t) => ({ t, on: true }));
    const where = { yk: "Ярче Коммуникации → Помощь → Заявки по АХЧ → Создать", whatsapp: "ЦФО — отправьте в WhatsApp" }[base.channel.kind] || "";
    top({ back: [`#o/${id}`, "Подготовка"], cap: objLine(o), title: "Заявка АХЧ", extra: `<span class="sub">${esc(where)}</span>` });
    function draw() {
      render(`<div class="card" style="gap:0">${items.map((it, i) => `<label class="check"><input type="checkbox" data-i="${i}" ${it.on ? "checked" : ""}><textarea data-t="${i}" rows="1">${esc(it.t)}</textarea></label>`).join("")}</div>
        <div class="row"><input id="new" placeholder="Свой пункт"><button class="small" id="add">Добавить</button></div>
        <label class="f">Просьба приехать<input type="date" id="visit" value="${o.accept_date || ""}"></label>
        <pre class="tpl" id="out"></pre>
        <div class="bottom"><button class="main" id="copy">Скопировать текст заявки</button></div>`);
      $app.querySelectorAll("[data-i]").forEach((c) => (c.onchange = () => { items[c.dataset.i].on = c.checked; upd(); }));
      const fit = (c) => { c.style.height = "auto"; c.style.height = c.scrollHeight + "px"; };
      $app.querySelectorAll("[data-t]").forEach((c) => { fit(c); c.oninput = () => { fit(c); items[c.dataset.t].t = c.value; upd(); }; });
      document.getElementById("add").onclick = () => { const v = document.getElementById("new").value.trim(); if (v) { items.push({ t: v, on: true }); draw(); } };
      document.getElementById("visit").onchange = upd;
      document.getElementById("copy").onclick = () => copy(document.getElementById("out").textContent);
      upd();
    }
    async function upd() {
      const r = await api("POST", `/api/objects/${id}/ahch`, { items: items.filter((x) => x.on).map((x) => x.t), visit: document.getElementById("visit").value || null });
      document.getElementById("out").textContent = r.text;
    }
    draw();
  }

  // ---------- дворник ----------
  async function dvornikScreen(id) {
    const o = await api("GET", `/api/objects/${id}`);
    const ok = o.director.name && o.director.phone;
    top({ back: [`#o/${id}`, "Подготовка"], cap: objLine(o), title: "Дворник", extra: `<span class="sub">Адрес и телефон директора — из данных объекта</span>` });
    render(`${ok ? "" : `<div class="card warnc">Укажите ФИО и телефон директора в <a href="#o/${id}/data">данных объекта</a></div>`}
      <div class="card"><span class="title">Объявление «Требуется дворник»</span><span class="sub">Телефон: ${esc(o.director.phone || "—")} · ${esc(o.address || "")}</span>
        <div class="btns"><button class="main" data-print="dvornik" ${ok ? "" : "disabled"}>Прислать в чат на печать</button></div></div>
      <div class="card"><span class="title">Вкладыш на конверт — Светлане Калько</span><span class="sub">Договор: 3 экз. (Калько, «Уставные документы», дворнику), все подписаны обеими сторонами; акт: 2 экз.</span>
        <div class="btns"><button class="main" data-print="konvert" ${ok ? "" : "disabled"}>Прислать в чат на печать</button></div></div>
      <div class="list"><a href="${MEMO}instr/dvornik/dvornik.html"><span class="t"><b>Инструкция: договор и акт в МК</b><span>с картинками и PDF</span></span><span class="go">›</span></a></div>`);
    $app.querySelectorAll("[data-print]").forEach((b) => (b.onclick = () => printToChat(id, b.dataset.print)));
  }
  // ---------- лист готовности АХЧ: печать шаблона и скан заполненного ----------
  const b64file = (f) => new Promise((res, rej) => { const r = new FileReader(); r.onerror = rej; r.onload = () => res(String(r.result).split(",")[1]); r.readAsDataURL(f); });
  function ahchHtml(ex) {
    const url = ex.ahch_scan, inL = ex.ahch_in_letter !== false;
    return `<div class="card" id="ahchCard"><span class="title">Лист готовности (АХЧ)</span>
      <span class="sub">Печатаем шаблон с кодом, адресом, датой и фамилиями → заполняем ручкой на приёмке, подписывают все → фото или скан сюда. Ссылка встанет в первое письмо${url ? "; повторная загрузка — «ОБНОВЛЁННЫЙ ЛИСТ ГОТОВНОСТИ»" : ""}.</span>
      ${url ? `<span class="row"><span class="chip ${inL ? "ok" : "warn"}">${inL ? (ex.ahch_updated ? "обновлённый · в письме" : "загружен · в письме") : "загружен · убран из письма"}</span><a class="btn small ghost" href="${esc(url)}">Открыть скан</a></span>` : `<span class="chip warn">скан не загружен</span>`}
      <div class="btns"><button class="small" id="ahPrint">🖨 Шаблон на печать</button>
        <label class="btn small ${url ? "" : "main"}">📷 ${url ? "Заменить скан" : "Загрузить скан / фото"}<input type="file" accept="image/*,application/pdf" multiple hidden id="ahFile"></label>
        ${url ? `<button class="small ghost" id="ahToggle">${inL ? "Убрать из письма" : "Вернуть в письмо"}</button>` : ""}</div></div>`;
  }
  function bindAhch(id, ex, again) {
    const pr = document.getElementById("ahPrint"); if (!pr) return;
    pr.onclick = () => printToChat(id, "ahchlist");
    document.getElementById("ahFile").onchange = async (e) => {
      const files = [];
      for (const f of e.target.files) files.push(/pdf/i.test(f.type) ? { b64: await b64file(f), pdf: true } : { b64: await shrink(f, 2400) });
      try { toast("Загружаю на Диск…"); await api("POST", `/api/objects/${id}/ahch-scan`, { files }); toast("Лист готовности на Диске — ссылка в письме"); again(); } catch (er) { toast(er.message); }
    };
    const tg2 = document.getElementById("ahToggle");
    if (tg2) tg2.onclick = async () => { await api("POST", `/api/objects/${id}/ahch-scan`, ex.ahch_in_letter !== false ? { remove: true } : { restore: true }); again(); };
  }

  // ---------- документы объекта: электролаборатория, ЭОМ, договоры, лист АХЧ ----------
  async function docsScreen(id) {
    const [o, D] = await Promise.all([api("GET", `/api/objects/${id}`), api("GET", `/api/objects/${id}/docs`)]);
    top({ back: [`#o/${id}/data`, "Данные"], cap: objLine(o), title: "Документы объекта", extra: `<span class="sub">Архив вне письма. Чего нет — подсвечено. Файлы — на Яндекс Диске в папке объекта</span>` });
    const row = (s) => { const opt = s.key === "other"; return `<div class="card ${s.url || opt ? "" : "warnc"}" data-doc="${s.key}"><div class="row"><b>${esc(s.title)}</b><span class="chip ${s.url ? "ok" : opt ? "info" : "bad"}">${s.url ? "✓ есть" : opt ? "по желанию" : "нет файла"}</span></div>
      ${s.url ? `<span class="sub">файлов: ${s.count} · ${fmt(s.date)} · ${esc(s.by || "")}${s.note ? " · " + esc(s.note) : ""}</span>` : ""}
      ${s.key === "elab" ? `<span class="sub">Пока отчёта нет — в письме «ОТЧЕТ ЭЛЕКТРОЛАБОРАТОРИИ ПРИШЁЛ – ОТСУТСТВУЕТ» оранжевым; формулировку можно поменять в «Обход → Этап 3 → Статусы»</span>` : ""}
      <div class="btns">${s.url ? `<a class="btn small ghost" href="${esc(s.url)}">Открыть</a>` : ""}<label class="btn small ${s.url ? "" : "main"}">📎 ${s.url ? "Добавить файл" : "Загрузить PDF / фото"}<input type="file" accept="image/*,application/pdf" multiple hidden data-up="${s.key}"></label></div></div>`; };
    render(`${D.slots.map(row).join("")}
      <a class="card ${D.contracts.got === D.contracts.total ? "" : "warnc"}" href="#o/${id}/contracts" style="text-decoration:none;color:inherit"><div class="row"><b>Договоры: аренда, ТКО, дезинфекция, ОПС</b><span class="chip ${D.contracts.got === D.contracts.total ? "ok" : "warn"}">${D.contracts.got} из ${D.contracts.total}</span></div><span class="sub">Запрос у менеджера по развитию и загрузка — на экране договоров ›</span></a>
      <a class="card ${D.ahch.url ? "" : "warnc"}" href="#o/${id}/walk/3" style="text-decoration:none;color:inherit"><div class="row"><b>Лист готовности АХЧ</b><span class="chip ${D.ahch.url ? "ok" : "bad"}">${D.ahch.url ? (D.ahch.updated ? "обновлённый" : "✓ есть") : "нет скана"}</span></div><span class="sub">Печать шаблона и скан — в «Обход → Этап 3» или на экране письма ›</span></a>`);
    $app.querySelectorAll("[data-up]").forEach((inp) => (inp.onchange = async () => {
      const files = []; for (const f of inp.files) files.push(/pdf/i.test(f.type) ? { b64: await b64file(f), pdf: true } : { b64: await shrink(f, 2400) });
      try { toast("Загружаю на Диск…"); await api("POST", `/api/objects/${id}/docs/${inp.dataset.up}`, { files }); toast("Документ на Диске"); docsScreen(id); } catch (e) { toast(e.message); }
    }));
  }

  async function printToChat(id, kind) {
    try { await api("POST", `/api/objects/${id}/print/${kind}`); toast("Файл отправлен в чат с ботом"); if (tg) setTimeout(() => tg.close(), 1200); }
    catch (e) { toast(e.message); }
  }

  // ---------- обход: общие куски ----------
  const ZONES = ["Фасад", "Входная группа", "Тамбур", "Торговый зал", "Касса", "Стеллажка", "Пекарня", "Кофестанция",
    "Санузел", "Кабинет", "Склад", "Разгрузка", "Агрегатная", "Конденсаторная опора"];
  const LIGHT_ZONES = ["Торговый зал", "Тамбур", "Касса", "Пекарня", "Склад", "Кабинет", "Санузел", "Фасад и вывеска"];
  const STAGES = { 1: ["Этап 1", "Ремонт"], 2: ["Этап 2", "Оборудование"], 3: ["Этап 3", "Наличие"] };
  const initials = (n) => (n || "").split(" ").slice(0, 2).map((x) => x[0] || "").join("").toUpperCase();
  const fab = (href) => `<a class="fab" href="${href}">+ Замечание</a>`;
  function stepper(val, attrs) {
    return `<span class="stepper" ${attrs}><button type="button" data-d="-1" aria-label="Меньше">−</button><b>${val}</b><button type="button" data-d="1" aria-label="Больше">+</button></span>`;
  }
  function walkTop(o, id, stage, st) {
    top({ back: ["#objects", "Объекты"], cap: objLine(o), title: "Обход", tabs: [id, "walk"],
      extra: `<div class="stages">${[1, 2, 3].map((s) => `<a href="#o/${id}/walk/${s}" class="${s == stage ? "on" : ""}"><b>${STAGES[s][0].toUpperCase()}${st && st[s] ? " ✓" : ""}</b><span>${STAGES[s][1]}</span></a>`).join("")}</div>` });
  }
  async function loadWalk(id) {
    const [o, C, rs] = await Promise.all([api("GET", `/api/objects/${id}`), api("GET", `/api/objects/${id}/checklists`), api("GET", `/api/objects/${id}/remarks`)]);
    return { o, C, rs };
  }
  function checkStats(C, prefix, zones) {
    let total = 0, done = 0;
    zones.forEach((z) => z.items.forEach((_, i) => { total++; const k = `${prefix}:${z.key}:${i}`; if (C.checks[k] || C.refs[k]) done++; }));
    return { total, done };
  }
  /** Зоны с пунктами чек-листа: ✓ — в порядке, ! — есть замечание, пунктир — не проверено. */
  function zonesHtml(id, stage, prefix, zones, C, rs) {
    return zones.map((z) => {
      const keys = z.items.map((_, i) => `${prefix}:${z.key}:${i}`);
      const zrs = rs.filter((r) => r.zone === z.zone && String(r.stage) === String(stage) && !(r.item_ref && keys.includes(r.item_ref)) && (!z.first || true));
      const done = keys.filter((k) => C.checks[k] || C.refs[k]).length;
      const nrem = keys.reduce((a, k) => a + (C.refs[k] || []).length, 0) + zrs.length;
      const complete = done === keys.length;
      return `<details class="zone ${complete ? "" : "todo"}" ${complete && !nrem ? "" : "open"} data-zone="${esc(z.zone)}">
        <summary><span class="st"><b>${esc(z.title)}</b><span>${done} из ${keys.length} пунктов${nrem ? ` · ${nrem} замеч.` : complete ? " · без замечаний" : ""}${complete ? "" : " · не проверено: " + (keys.length - done)}</span></span>
          ${complete ? `<span class="okdot">✓</span>` : `<span class="chev">▾</span>`}</summary>
        <div class="items">${z.items.map((t, i) => {
          const k = keys[i], ref = C.refs[k] || [], ch = C.checks[k];
          const state = ref.length ? "bad" : ch ? "ok" : "";
          return `<div class="it ${state || "un"}" data-k="${k}">
            <button class="mark" data-toggle="${k}" aria-label="Отметить">${state === "ok" ? "✓" : state === "bad" ? "!" : ""}</button>
            <span class="txt" data-toggle="${k}">${esc(t)}</span>
            ${ref.length ? ref.map((r) => `<a class="av" href="#o/${id}/r/${r.id}" title="${esc(r.author)}">${esc(initials(r.author))}</a>`).join("") : ch ? `<span class="av ok" title="${esc(ch.by)}">${esc(initials(ch.by))}</span>` : ""}
            <button class="addr" data-add="${k}" data-zone="${esc(z.zone)}" data-text="${esc(t)}" aria-label="Замечание по пункту">+ замеч.</button></div>`;
        }).join("")}
        ${zrs.map((r) => `<a class="it rem" href="#o/${id}/r/${r.id}"><span class="mark bad">!</span><span class="txt">${esc(r.text)}</span><span class="av">${esc(initials(r.author_name))}</span></a>`).join("")}
        ${complete ? "" : `<button class="small ghost allok" data-allok="${keys.join(",")}">Остальное в порядке</button>`}</div></details>`;
    }).join("");
  }
  function bindZones(id, stage, C, rerender) {
    $app.querySelectorAll("[data-toggle]").forEach((el) => (el.onclick = async () => {
      const k = el.dataset.toggle;
      if (C.refs[k]) { location.hash = `#o/${id}/r/${C.refs[k][0].id}`; return; }
      const on = !C.checks[k];
      const row = el.closest(".it"); row.classList.toggle("ok", on); row.classList.toggle("un", !on); row.querySelector(".mark").textContent = on ? "✓" : "";
      try { const r = await api("POST", `/api/objects/${id}/checks`, { key: k, state: on ? "ok" : null }); if (r.check) C.checks[k] = r.check; else delete C.checks[k]; } catch (e) { toast(e.message); }
    }));
    $app.querySelectorAll("[data-allok]").forEach((b) => (b.onclick = async () => {
      for (const k of b.dataset.allok.split(",")) if (!C.checks[k] && !C.refs[k]) { await api("POST", `/api/objects/${id}/checks`, { key: k, state: "ok" }); }
      rerender();
    }));
    $app.querySelectorAll("[data-add]").forEach((b) => (b.onclick = () => {
      try { sessionStorage.setItem("newRemark", JSON.stringify({ item_ref: b.dataset.add, zone: b.dataset.zone, hint: b.dataset.text })); } catch (e) {}
      location.hash = `#o/${id}/rnew/${stage}/${Math.max(0, ZONES.indexOf(b.dataset.zone))}`;
    }));
  }

  // ---------- этап 1: ремонт по зонам листа контроля ----------
  async function stage1(id) {
    const { o, C, rs } = await loadWalk(id);
    const s = checkStats(C, "s1", C.stage1);
    walkTop(o, id, 1);
    render(`${surveyBanner(o, C, id)}
      <div class="row sub"><b style="color:var(--fg)">Проверено ${s.done} из ${s.total} пунктов</b>${s.total - s.done ? `<span style="color:var(--warn);font-weight:600">${s.total - s.done} не проверено</span>` : `<span style="color:var(--ok);font-weight:600">всё проверено</span>`}</div>
      <div class="bar"><i style="width:${(s.done / s.total) * 100}%"></i></div>
      <span class="sub">Касание пункта — «в порядке» ✓ (повторное — снять). «+ замеч.» — замечание по пункту. Непроверенные подсвечены.</span>
      ${zonesHtml(id, 1, "s1", C.stage1, C, rs)}
      ${s.total - s.done ? "" : `<a class="btn main" href="#o/${id}/walk/2">Дальше: этап 2 — оборудование</a>`}
      ${fab(`#o/${id}/rnew/1/0`)}`);
    bindZones(id, 1, C, () => stage1(id));
  }
  function surveyBanner(o, C, id) {
    const sv = C.survey || {};
    const miss = ["grids", "ends", "superstructures"].filter((k) => sv[k] === null || sv[k] === undefined);
    return miss.length ? `<a class="card warnc" href="#o/${id}/survey" style="flex-direction:row;align-items:center;justify-content:space-between"><span><b>Опрос перед приёмкой</b><br><span class="sub">Кофемашины, сетки, торцы, суперструктуры — от них считаются нормы недовоза</span></span><span class="chip warn">заполнить</span></a>` : "";
  }

  // ---------- этап 2: оборудование, проходы, свет ----------
  async function stage2(id) {
    const { o, C, rs } = await loadWalk(id);
    const ex = C.extras || {};
    const ms = ex.measures || [];
    const light = ex.light || {};
    const s = checkStats(C, "s2", C.stage2);
    walkTop(o, id, 2);
    const ps = (C.state || {}).passes || {}, pst = ps.state || "";
    render(`<div class="card stc ${pst === "bad" ? "bad" : pst === "ok" ? "ok" : ""}"><b>Ключевые проходы соответствуют планировке?</b>
        <span class="sub">Одна отметка — строка уйдёт в низ письма: «КЛЮЧЕВЫЕ РАЗМЕРЫ ПРОХОДОВ <b style="color:${pst === "bad" ? "#ED7D31" : "#00B050"}">${pst === "bad" ? "НЕ СООТВЕТСТВУЮТ" : "СООТВЕТСТВУЮТ"} ПЛАНИРОВКЕ</b>»</span>
        <div class="seg"><button data-pass="ok" class="${pst === "ok" ? "on" : ""}">✓ Соответствуют</button><button data-pass="bad" class="${pst === "bad" ? "on" : ""}">✕ Нет</button></div>
        ${pst === "bad" ? `<a class="btn small" href="#o/${id}/rnew/2/5" id="passRem">+ замечание о проходе</a>` : ""}</div>
      <details class="card" ${ms.length ? "open" : ""}><summary><b>Замеры по точкам</b> <span class="sub">— по желанию, если есть сомнения. Допуск ±15 см</span></summary>
      <a class="btn" href="#o/${id}/plan">◎ Поставить точки на плане</a>
      <div style="display:grid;gap:0"><div class="mrow head"><span>ТОЧКА</span><span></span><span>ПЛАН, см</span><span>ФАКТ, см</span></div>
        ${ms.map((m, i) => { const d = m.fact !== "" && m.fact != null && m.plan_cm ? +m.fact - +m.plan_cm : null; const bad = d !== null && Math.abs(d) > 15;
          return `<div class="mrow"><span class="pt ${d === null ? "" : bad ? "bad" : "ok"}">${/^[0-9a-f]{12}$/.test(m.plan || "") ? `<a href="#o/${id}/plan/${m.plan}/${m.page || 1}" style="text-decoration:none;color:inherit">◎${i + 1}</a>` : i + 1}</span>
            <span class="${bad ? "badt" : d === null ? "sub" : "okt"}">${d === null ? "не замерено" : bad ? `${d > 0 ? "+" : ""}${d} · <a href="#" data-mrem="${i}">в замечание →</a>` : "✓ в допуске"}</span>
            <input inputmode="numeric" data-m="${i}" data-f="plan_cm" value="${m.plan_cm ?? ""}" placeholder="—"><input inputmode="numeric" data-m="${i}" data-f="fact" value="${m.fact ?? ""}" placeholder="—"></div>`; }).join("")}
        <button class="small ghost" id="addm" style="margin-top:8px">+ точка</button></div></details>
      ${(light.types || []).length ? `<div class="card" style="gap:0"><span class="title">Световой план · ${esc(light.source || "DIALux")}</span><span class="sub" style="margin-bottom:6px">по плану — из файла; впишите, сколько по факту</span>
        ${light.types.map((t, i) => { const bad = t.fact !== "" && t.fact != null && +t.fact !== +t.count;
          return `<div class="row" style="padding:6px 0;border-top:1px solid var(--line2)"><span style="font-size:13px"><b>${t.count} ×</b> ${esc(t.name)}</span>
            <input class="numin ${bad ? "badin" : ""}" inputmode="numeric" data-lt="${i}" value="${t.fact ?? ""}" placeholder="факт"></div>`; }).join("")}
        <div class="row" style="padding:6px 0;border-top:1px solid var(--line2)"><span style="font-size:13px"><b>${light.emergency_plan || 0} ×</b> аварийные «А»</span>
          <input class="numin ${light.emergency_fact !== undefined && light.emergency_fact !== "" && +light.emergency_fact !== +(light.emergency_plan || 0) ? "badin" : ""}" inputmode="numeric" id="lem" value="${light.emergency_fact ?? ""}" placeholder="факт"></div></div>` :
      `<div class="card" style="gap:0"><span class="title">Световой план</span><span class="sub" style="margin-bottom:6px">светильников по плану / по факту, по зонам · загрузите DIALux во вкладке «План» — числа подставятся сами</span>
        ${LIGHT_ZONES.map((z) => { const v = (light.zones || {})[z] || {}; const bad = v.plan !== undefined && v.plan !== "" && v.fact !== undefined && v.fact !== "" && +v.plan !== +v.fact;
          return `<div class="row" style="padding:6px 0;border-top:1px solid var(--line2)"><span style="font-size:14px">${z}</span><span class="row" style="gap:6px">
            <input class="numin" inputmode="numeric" data-lz="${z}" data-lf="plan" value="${v.plan ?? ""}" placeholder="план"><span class="sub">/</span>
            <input class="numin ${bad ? "badin" : ""}" inputmode="numeric" data-lz="${z}" data-lf="fact" value="${v.fact ?? ""}" placeholder="факт"></span></div>`; }).join("")}</div>`}
      <div class="row sub"><b style="color:var(--fg)">Оборудование: ${s.done} из ${s.total}</b></div>
      ${zonesHtml(id, 2, "s2", C.stage2.map((z) => z.key === "e3" && +(C.survey.coffee || 1) === 2 ? { ...z, title: "Кофестанция · 2 модуля" } : z), C, rs)}
      <a class="btn main" href="#o/${id}/walk/3">Дальше: этап 3 — наличие</a>
      ${fab(`#o/${id}/rnew/2/7`)}`);
    bindZones(id, 2, C, () => stage2(id));
    $app.querySelectorAll("[data-pass]").forEach((b) => (b.onclick = async () => { await api("PUT", `/api/objects/${id}/statuses`, { key: "passes", state: b.dataset.pass }); toast(b.dataset.pass === "ok" ? "Проходы: соответствуют — в письме" : "Проходы: не соответствуют — оранжевым в письме"); stage2(id); }));
    const pr = document.getElementById("passRem"); if (pr) pr.onclick = () => { try { sessionStorage.setItem("newRemark", JSON.stringify({ zone: "Торговый зал", section: "equip", text: "Привести ширину прохода в соответствие с планировкой" })); } catch (_) {} };
    const saveM = async () => { await api("PUT", `/api/objects/${id}/extras`, { measures: ms }); };
    $app.querySelectorAll("[data-m]").forEach((inp) => (inp.onchange = async () => { ms[inp.dataset.m][inp.dataset.f] = inp.value.trim(); await saveM(); stage2(id); }));
    document.getElementById("addm").onclick = async () => { ms.push({ plan_cm: "", fact: "" }); await saveM(); stage2(id); };
    $app.querySelectorAll("[data-mrem]").forEach((a) => (a.onclick = (e) => {
      e.preventDefault(); const m = ms[a.dataset.mrem];
      try { sessionStorage.setItem("newRemark", JSON.stringify({ zone: "Стеллажка", section: "equip", text: `Проход у точки ${+a.dataset.mrem + 1}: по плану ${m.plan_cm} см, по факту ${m.fact} см — привести в соответствие с планировкой` })); } catch (_) {}
      location.hash = `#o/${id}/rnew/2/5`;
    }));
    $app.querySelectorAll("[data-lt]").forEach((inp) => (inp.onchange = async () => {
      const t = light.types[+inp.dataset.lt]; t.fact = inp.value.trim(); await api("PUT", `/api/objects/${id}/extras`, { light });
      const bad = t.fact !== "" && +t.fact !== +t.count; inp.classList.toggle("badin", bad); if (bad) toast(`${t.name}: по плану ${t.count}, по факту ${t.fact}`, "err");
    }));
    const lem = document.getElementById("lem"); if (lem) lem.onchange = async () => { light.emergency_fact = lem.value.trim(); await api("PUT", `/api/objects/${id}/extras`, { light });
      const bad = light.emergency_fact !== "" && +light.emergency_fact !== +(light.emergency_plan || 0); lem.classList.toggle("badin", bad); if (bad) toast(`Аварийные: по плану ${light.emergency_plan}, по факту ${light.emergency_fact}`, "err"); };
    $app.querySelectorAll("[data-lz]").forEach((inp) => (inp.onchange = async () => {
      const zones = { ...(light.zones || {}) }; zones[inp.dataset.lz] = { ...(zones[inp.dataset.lz] || {}), [inp.dataset.lf]: inp.value.trim() };
      light.zones = zones; await api("PUT", `/api/objects/${id}/extras`, { light: { ...light, zones } });
      const v = zones[inp.dataset.lz]; const row = inp.closest(".row"); const f = row.querySelector('[data-lf="fact"]');
      f.classList.toggle("badin", v.plan !== undefined && v.plan !== "" && v.fact !== undefined && v.fact !== "" && +v.plan !== +v.fact);
      if (f.classList.contains("badin")) toast(`${inp.dataset.lz}: по плану ${v.plan}, по факту ${v.fact}`, "err");
    }));
  }

  // ---------- этап 3: недовозы, статусы, батареи, фото ----------
  const LISTS = { mto: "МТО", hoz: "Хоз", coffee: "Кофе" };
  let S3 = { tab: "mto", q: "", mark: false };
  async function stage3(id) {
    const [o, N, C] = await Promise.all([api("GET", `/api/objects/${id}`), api("GET", `/api/objects/${id}/norms`), api("GET", `/api/objects/${id}/checklists`)]);
    const cnt = (l) => (N.shortages[l] || []).length;
    walkTop(o, id, 3);
    const tabsH = `<div class="chips">${Object.entries(LISTS).map(([k, n]) => `<button class="chipb ${S3.tab === k ? "on" : ""}" data-tab="${k}">${n} · ${cnt(k)}</button>`).join("")}
      <button class="chipb ${S3.tab === "st" ? "on" : ""}" data-tab="st">Статусы ●</button><button class="chipb ${S3.tab === "more" ? "on" : ""}" data-tab="more">Батареи и фото</button></div>`;
    let body = "";
    if (LISTS[S3.tab]) {
      const short = Object.fromEntries((N.shortages[S3.tab] || []).map((x) => [x.n, x.missing]));
      const rows = N.norms[S3.tab];
      const qty = (n, v) => `<span class="qty"><button type="button" data-q="-1">−</button><input inputmode="numeric" pattern="[0-9]*" data-qn="${n}" value="${v}" aria-label="К довозу"><button type="button" data-q="1">+</button></span>`;
      const search = `<div class="sticky-search"><input id="q" type="search" placeholder="Поиск по названию: сетка, ограничитель, 76…" value="${esc(S3.q)}"></div>`;
      const surveyWarn = N.survey_missing.length && S3.tab === "mto" ? `<a class="card warnc" href="#o/${id}/survey"><b>Нет данных опроса:</b> ${esc(N.survey_missing.join(", "))} — нормы по этим позициям не посчитаны</a>` : "";
      if (!S3.mark) {
        const list = rows.filter((x) => short[x.n]);
        body = `${surveyWarn}${search}
          ${list.length ? `<span class="sub">К довозу — ${list.length} поз. Количество можно ввести цифрами или кнопками. Остальное пришло полностью.</span>
            <div class="card" style="gap:0;padding:4px 14px">${list.map((x) => `<div class="drow miss" data-name="${esc((x.n + ". " + x.name).toLowerCase())}">
              <span class="t"><b>${x.n}. ${esc(x.name)}</b><span>норма ${x.norm}${x.note ? " (" + esc(x.note) + ")" : ""} · к довозу</span></span>${qty(x.n, short[x.n])}
              <button class="small ghost gotit" data-got="${x.n}" aria-label="Пришло полностью">✓</button></div>`).join("")}</div>`
          : `<div class="card" style="border-color:var(--ok)"><b style="color:var(--ok)">✓ Всё пришло по нормам</b><span class="sub">Если чего-то нет — отметьте недовоз</span></div>`}
          <button class="main" id="markMode">Отметить недовоз галочками</button>`;
      } else {
        body = `${surveyWarn}${search}
          <span class="sub">Снимите галочку с того, что не пришло — строка загорится и появится количество к довозу (по умолчанию вся норма). Потом «Подтвердить».</span>
          <div class="card" style="gap:0;padding:4px 14px">${rows.map((x) => { const miss = short[x.n] || 0;
            return `<div class="drow ${miss ? "miss" : ""}" data-name="${esc((x.n + ". " + x.name).toLowerCase())}" data-row="${x.n}" data-norm="${x.norm ?? ""}">
              <input type="checkbox" data-pick="${x.n}" ${miss ? "" : "checked"} ${x.norm === null ? "disabled" : ""} aria-label="Пришло">
              <span class="t"><b>${x.n}. ${esc(x.name)}</b><span>${x.norm === null ? "норма — по опросу" : "норма " + x.norm + (x.note ? " (" + esc(x.note) + ")" : "")}</span></span>
              ${x.norm === null ? "" : `<span class="pickq" ${miss ? "" : "hidden"}>${qty(x.n, miss || x.norm)}</span>`}</div>`; }).join("")}</div>
          <div class="bottom" style="display:grid;grid-template-columns:1fr 2fr;gap:8px"><button id="markCancel">Отмена</button><button class="main" id="markOk">Подтвердить</button></div>`;
      }
    } else if (S3.tab === "st") {
      const st = C.state || {}, lines = Object.fromEntries((C.lines || []).map((l) => [l.key, l]));
      const albums = (C.extras || {}).albums || {}, ac = (C.extras || {}).album_count || {};
      const people = (C.people || []);
      body = `<span class="sub">Как в письмах: предмет — чёрным, итог — <b style="color:#00B050">зелёным</b> (в порядке и «не предусмотрено») или <b style="color:#ED7D31">оранжевым</b> с датой устранения. «Убрать» — пункта нет в письме.</span>
        ${C.statuses.filter((x) => !x.needs || C.survey[x.needs]).map((x) => { const cur = st[x.key] || {};
          let state = cur.state || (x.na_if_not && C.survey[x.na_if_not] === false ? "na" : "ok");
          const opts = (state === "off" ? [] : (x[state] || [])), phrase = cur.phrase || opts[0] || "";
          const custom = phrase && !opts.includes(phrase);
          const L = lines[x.key];
          return `<div class="card stc ${state}" data-st="${x.key}">
            <div class="stprev">${L ? "● " + L.html : `<s>● ${esc(x.subject)}</s> <span class="sub">— не в письме</span>`}</div>
            <div class="seg">${[["ok", "В порядке"], ...((x.na || []).length ? [["na", "Не предусм."]] : []), ["bad", "Исправить"], ["off", "Убрать"]].map(([v, n]) => `<button data-sv="${v}" class="${state === v ? "on" : ""}">${n}</button>`).join("")}</div>
            ${state === "off" ? "" : `<div class="chips">${opts.map((o) => `<button class="chip ${o === phrase ? "on" : ""}" data-ph="${esc(o)}">${esc(o)}</button>`).join("")}
              <input class="chipin ${custom ? "on" : ""}" data-phc placeholder="свой вариант" value="${custom ? esc(phrase) : ""}"></div>
            <div class="strow">${x.count ? `<label class="f sm">Кол-во, шт<input inputmode="numeric" data-sf="count" value="${esc(cur.count || "")}" placeholder="—"></label>` : ""}
              ${state === "bad" ? `<label class="f sm">Устранение<input type="date" data-sf="deadline" value="${esc(cur.deadline || "")}"></label>` : ""}
              ${x.photo ? `<span class="f sm">Фото в письме<span class="row" style="gap:6px"><label class="btn small">📷${albums[x.key] ? " ещё" : ""}<input type="file" accept="image/*" multiple hidden data-album="${x.key}"></label>${albums[x.key] ? `<a class="btn small ghost" href="${esc(albums[x.key])}">открыть (${ac[x.key] || 1})</a>` : ""}</span></span>` : ""}</div>
            <details class="stmore" ${cur.note || cur.ask ? "open" : ""}><summary>Приписка или вопрос ответственному</summary>
              <label class="f sm">Приписка после итога<input data-sf="note" value="${esc(cur.note || "")}" placeholder="напр.: 1 ДОВЕЗУТ СЕГОДНЯ"></label>
              <div class="grid2"><label class="f sm">@ кого спросить<input data-sf="ask" list="stPeople" value="${esc(cur.ask || "")}" placeholder="ФИО"></label>
              <label class="f sm">Вопрос<input data-sf="question" value="${esc(cur.question || "")}" placeholder="подскажи, пожалуйста, срок устранения"></label></div></details>`}
          </div>`; }).join("")}
        <datalist id="stPeople">${people.map((p) => `<option value="${esc(p)}">`).join("")}</datalist>`;
    } else {
      const ex = C.extras || {};
      const bat = ex.batteries || [];
      const albums = ex.albums || {}, ac = ex.album_count || {};
      const m2 = ex.module2 || {};
      body = `<div class="card"><span class="title">Батареи и насосы</span>
          <div class="btns">${bat.map((g, i) => `<span class="chip info">${g.count} × ${g.sections} секц. <a href="#" data-delb="${i}" style="text-decoration:none">✕</a></span>`).join("")}</div>
          <div class="row"><input class="numin" inputmode="numeric" id="bc" placeholder="кол-во"><span>×</span><input class="numin" inputmode="numeric" id="bs" placeholder="секций"><button class="small" id="addb">+ группа</button></div>
          <span class="sub">В письмо уйдёт: ● КОЛИЧЕСТВО БАТАРЕЙ: ${esc(bat.map((g) => `${g.count}(${g.sections} СЕКЦ.)`).join("+") || "—")}</span>
          <div class="row"><span>Насосов (сололифтов)</span>${stepper(ex.pumps ?? 0, 'id="pumps"')}</div></div>
        <div class="card"><span class="title">Высоты</span><div class="grid2">
          <label class="f">Проём разгрузки, м<input id="hu" inputmode="decimal" value="${esc(ex.height_unloading || "")}" placeholder="2,38"></label>
          <label class="f">Пандус, м<input id="hr" inputmode="decimal" value="${esc(ex.height_ramp || "")}" placeholder="2,38"></label></div></div>
        <div class="card"><span class="title">Обязательные фото</span><span class="sub">Фото уходят на Яндекс Диск, ссылка на альбом сама встаёт в письмо</span>
          ${C.albums.map(([k, t]) => `<div class="row"><span><b style="font-size:14px">${esc(t)}</b><br><span class="sub">${albums[k] ? `фото: ${ac[k] || 1} · <a href="${esc(albums[k])}">открыть</a>` : "нет фото"}</span></span>
            <label class="btn small">📷<input type="file" accept="image/*" multiple hidden data-album="${k}"></label></div>`).join("")}</div>
        ${(() => { const two = +(C.survey.coffee || 1) === 2, list = (two ? C.module2.deliver : []).concat(C.module2.have);
          return `<div class="card"><span class="title">Кофестанция · ${two ? "2-й модуль" : "1 модуль"}</span><span class="sub">Галочка — есть в наличии (зелёным в письме). Снята — ${two ? "к довозу / " : ""}оранжевым «НЕ В НАЛИЧИИ»</span>
          ${list.map((x) => `<label class="tick" style="font-weight:500"><input type="checkbox" data-m2="${esc(x)}" ${m2[x] ?? C.module2.have.includes(x) ? "checked" : ""}> ${esc(x)}</label>`).join("")}</div>`; })()}
        ${ahchHtml(ex)}`;
    }
    render(tabsH + body + `<a class="btn main" href="#o/${id}/letter/first">К письму →</a>`);
    $app.querySelectorAll("[data-tab]").forEach((b) => (b.onclick = () => { S3.tab = b.dataset.tab; S3.mark = false; stage3(id); }));
    // поиск — мгновенно, без перерисовки экрана
    const q = document.getElementById("q");
    const filt = () => { const v = (q.value || "").toLowerCase().trim(); S3.q = q.value; $app.querySelectorAll("[data-name]").forEach((r) => (r.hidden = !!v && !r.dataset.name.includes(v))); };
    if (q) { q.oninput = filt; filt(); }
    // количество к довозу: цифрами или ±; сохраняется в фоне, экран не прыгает
    const saveMiss = (n, v) => api("PUT", `/api/objects/${id}/delivery`, { list: S3.tab, missing: { [n]: v } }).catch((e) => toast(e.message));
    $app.querySelectorAll(".qty").forEach((box) => {
      const inp = box.querySelector("input");
      const commit = () => { const v = Math.max(0, parseInt(inp.value, 10) || 0); inp.value = v; if (!S3.mark) { clearTimeout(inp.t); inp.t = setTimeout(() => saveMiss(inp.dataset.qn, v), 500); } };
      box.querySelectorAll("[data-q]").forEach((b) => (b.onclick = () => { inp.value = Math.max(0, (parseInt(inp.value, 10) || 0) + +b.dataset.q); commit(); }));
      inp.oninput = commit;
    });
    $app.querySelectorAll("[data-got]").forEach((b) => (b.onclick = async () => { const row = b.closest(".drow"); row.style.opacity = ".4"; await saveMiss(b.dataset.got, 0); row.remove(); toast("Отмечено: пришло"); }));
    const mm = document.getElementById("markMode"); if (mm) mm.onclick = () => { S3.mark = true; stage3(id); };
    $app.querySelectorAll("[data-pick]").forEach((c) => (c.onchange = () => {
      const row = c.closest(".drow"); row.classList.toggle("miss", !c.checked); row.querySelector(".pickq").hidden = c.checked;
    }));
    const mk = document.getElementById("markOk");
    if (mk) {
      document.getElementById("markCancel").onclick = () => { S3.mark = false; stage3(id); };
      mk.onclick = async () => {
        const missing = {};
        $app.querySelectorAll("[data-row]").forEach((row) => { if (!row.dataset.norm) return; const c = row.querySelector("[data-pick]");
          missing[row.dataset.row] = c.checked ? 0 : Math.max(0, parseInt(row.querySelector(".qty input").value, 10) || 0); });
        await api("PUT", `/api/objects/${id}/delivery`, { list: S3.tab, missing }); S3.mark = false; toast("Недовоз сохранён"); stage3(id);
      };
    }
    $app.querySelectorAll("[data-st]").forEach((card) => {
      const key = card.dataset.st;
      const save = async (d) => { try { const r = await api("PUT", `/api/objects/${id}/statuses`, { key, ...d }); C.state = r.statuses; C.lines = r.lines; stage3(id); } catch (e) { toast(e.message); } };
      card.querySelectorAll("[data-sv]").forEach((b) => (b.onclick = () => save({ state: b.dataset.sv })));
      card.querySelectorAll("[data-ph]").forEach((b) => (b.onclick = () => save({ state: card.className.split(" ").pop(), phrase: b.dataset.ph })));
      const pc = card.querySelector("[data-phc]"); if (pc) pc.onchange = () => save({ state: card.className.split(" ").pop(), phrase: pc.value.toUpperCase() });
      card.querySelectorAll("[data-sf]").forEach((inp) => (inp.onchange = () => save({ state: card.className.split(" ").pop(), [inp.dataset.sf]: inp.dataset.sf === "note" ? inp.value.toUpperCase() : inp.value })));
    });
    $app.querySelectorAll("[data-album]").forEach((inp) => (inp.onchange = async () => {
      for (const f of inp.files) { try { toast("Загружаю на Диск…"); await api("POST", `/api/objects/${id}/album/${inp.dataset.album}`, { image_b64: await shrink(f) }); } catch (e) { toast(e.message); } }
      toast("Фото на Диске — ссылка встала в письмо"); stage3(id);
    }));
    const ex = C.extras || {};
    const addb = document.getElementById("addb");
    if (addb) {
      addb.onclick = async () => { const c = +document.getElementById("bc").value, s = +document.getElementById("bs").value; if (!c || !s) return toast("Укажите количество и секции");
        await api("PUT", `/api/objects/${id}/extras`, { batteries: (ex.batteries || []).concat([{ count: c, sections: s }]) }); stage3(id); };
      $app.querySelectorAll("[data-delb]").forEach((a) => (a.onclick = async (e) => { e.preventDefault(); const b = (ex.batteries || []).slice(); b.splice(+a.dataset.delb, 1); await api("PUT", `/api/objects/${id}/extras`, { batteries: b }); stage3(id); }));
      const pm = document.getElementById("pumps");
      pm.querySelectorAll("button").forEach((b) => (b.onclick = async () => { const v = Math.max(0, +pm.querySelector("b").textContent + +b.dataset.d); pm.querySelector("b").textContent = v; await api("PUT", `/api/objects/${id}/extras`, { pumps: v }); }));
      document.getElementById("hu").onchange = (e) => api("PUT", `/api/objects/${id}/extras`, { height_unloading: e.target.value.trim() });
      document.getElementById("hr").onchange = (e) => api("PUT", `/api/objects/${id}/extras`, { height_ramp: e.target.value.trim() });
      bindAhch(id, ex, () => stage3(id));
      $app.querySelectorAll("[data-m2]").forEach((c) => (c.onchange = async () => { const m = { ...(ex.module2 || {}) }; m[c.dataset.m2] = c.checked; ex.module2 = m; await api("PUT", `/api/objects/${id}/extras`, { module2: m }); }));
    }
  }

  // ---------- опрос перед приёмкой ----------
  async function surveyScreen(id) {
    const [o, N] = await Promise.all([api("GET", `/api/objects/${id}`), api("GET", `/api/objects/${id}/norms`)]);
    const s = N.survey;
    const mto = Object.fromEntries(N.norms.mto.map((x) => [x.n, x.norm]));
    top({ back: [`#o/${id}/walk/1`, "Обход"], cap: objLine(o), title: "Опрос перед приёмкой", extra: `<span class="sub">От ответов считаются нормы недовоза и пункты письма</span>` });
    const num = (k, t, sub) => `<div class="row" style="padding:8px 0;border-top:1px solid var(--line2)"><span><b style="font-weight:500">${t}</b><br><span class="sub">${sub}</span></span><span class="qty" data-k="${k}"><button type="button" data-q="-1">−</button><input inputmode="numeric" pattern="[0-9]*" value="${s[k] ?? ""}" placeholder="0"><button type="button" data-q="1">+</button></span></div>`;
    const tog = (k, t) => `<label class="row" style="padding:10px 0;border-top:1px solid var(--line2)"><span>${t}</span><input type="checkbox" data-b="${k}" ${s[k] ? "checked" : ""} style="width:22px;height:22px;accent-color:var(--accent)"></label>`;
    const pas = (o.extras || {}).passport || {};
    render(`${(pas.discrepancies || []).length || pas.grids != null ? `<div class="card" style="background:var(--accent-soft);border:0"><b style="font-size:13px">Из плана Кайтена</b><span class="sub" style="color:var(--fg)">${esc([pas.date && "план от " + pas.date, pas.grids != null && "сетки " + pas.grids, pas.ends != null && "торцы " + (pas.ends_note || pas.ends), pas.coffee && "кофестанция " + (pas.coffee === 2 ? "двойная" : "одна"), pas.cash && "кассы " + pas.cash].filter(Boolean).join(" · "))} — проверьте</span>
        ${(pas.discrepancies || []).map((d) => `<span class="chip warn" style="white-space:normal">⚠ ${esc(d)}</span>`).join("")}</div>` : ""}
      <div class="card"><span class="title" style="font-size:14px">Кофемашин</span>${segHtml("coffee", ["1 · обычная КС", "2 · двойная КС"], +s.coffee === 2 ? "2 · двойная КС" : "1 · обычная КС")}</div>
      <div class="card" style="gap:0">${num("grids", "Сеток 250×1600", "по плану")}${num("ends", "Торцов", (pas.ends_note ? "вместе с торцом «Медицина»: " + pas.ends_note + " · " : "вместе с торцом «Медицина» · ") + "ограничители 500×60 — по 11")}${num("superstructures", "Суперструктур", "сетки 1100×500 — по 2")}</div>
      <div class="card" style="gap:0">${tog("fresh", "Фреш-полка и кулинария")}${tog("ramp", "Пандус разгрузки")}${tog("entrance_light", "Подсветка входной группы")}${tog("fire_cabinet", "Пожарный шкаф")}</div>
      <div class="card" style="background:var(--accent-soft);border:0"><b style="font-size:13px;color:var(--link)">Нормы пересчитаны</b>
        <span class="sub" style="color:var(--fg)">25. Сетка 250×1600 — ${mto[25] ?? "?"}<br>26. Сетка 1100×500 — ${mto[26] ?? "?"}<br>28. Ограничитель 500×60 — ${mto[28] ?? "?"}<br>76. Корзина для белья 40 л — ${mto[76]}<br>Расходники кофе — набор «${+s.coffee === 2 ? "двойная КС" : "одна КС"}»</span></div>
      <div class="bottom"><a class="btn main" href="#o/${id}/walk/1">Начать обход</a></div>`);
    const save = async (patch) => { await api("PUT", `/api/objects/${id}/survey`, patch); surveyScreen(id); };
    bindSeg("coffee", (v) => save({ coffee: v.startsWith("2") ? 2 : 1 }));
    $app.querySelectorAll(".qty[data-k]").forEach((box) => {
      const inp = box.querySelector("input");
      const commit = () => { const v = Math.max(0, parseInt(inp.value, 10) || 0); clearTimeout(box.t); box.t = setTimeout(() => save({ [box.dataset.k]: v }), 700); };
      box.querySelectorAll("[data-q]").forEach((b) => (b.onclick = () => { inp.value = Math.max(0, (parseInt(inp.value, 10) || 0) + +b.dataset.q); commit(); }));
      inp.oninput = commit;
    });
    $app.querySelectorAll("[data-b]").forEach((c) => (c.onchange = () => save({ [c.dataset.b]: c.checked })));
  }

  // ---------- письмо и редактор апдейта ----------
  function timerTo(hour, okrug) {
    const now = new Date();
    let t;
    if (okrug === "ЦФО") { const msk = new Date(now.getTime() + (now.getTimezoneOffset() + 180) * 6e4); t = new Date(now.getTime() + ((hour * 60) - (msk.getHours() * 60 + msk.getMinutes())) * 6e4); }
    else { t = new Date(now); t.setHours(hour, 0, 0, 0); }
    const m = Math.round((t - now) / 6e4);
    return m <= 0 ? `после ${hour}:00` : `до ${hour}:00 · ${Math.floor(m / 60) ? Math.floor(m / 60) + " ч " : ""}${m % 60} мин`;
  }
  async function copyHtml(html, text) {
    try {
      await navigator.clipboard.write([new ClipboardItem({ "text/html": new Blob([html], { type: "text/html" }), "text/plain": new Blob([text], { type: "text/plain" }) })]);
      toast("Письмо скопировано — вставьте в Outlook"); return;
    } catch (e) {}
    const d = document.createElement("div"); d.contentEditable = "true"; d.innerHTML = html;
    Object.assign(d.style, { position: "fixed", left: "-9999px", top: "0" }); document.body.appendChild(d);
    const r = document.createRange(); r.selectNodeContents(d); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
    let ok = false; try { ok = document.execCommand("copy"); } catch (e) {}
    sel.removeAllRanges(); d.remove();
    toast(ok ? "Письмо скопировано — вставьте в Outlook" : "Не удалось скопировать — нажмите и удерживайте текст письма");
  }
  const COMMENT_AUTHORS = ["Жихарева Анастасия", "Ахпашев Мурад", "Координатор строительства"];
  async function letterScreen(id, mode) {
    const [o, L, rs] = await Promise.all([api("GET", `/api/objects/${id}`), api("GET", `/api/objects/${id}/letter/${mode}`), api("GET", `/api/objects/${id}/remarks`)]);
    const ex = o.extras || {};
    const today = new Date().toISOString().slice(0, 10);
    const zhOk = ex.zh_ok === today;
    const warn = [];
    const noPhoto = rs.filter((r) => !r.photos.length && r.status !== "accepted").length;
    const noDl = rs.filter((r) => r.needs_deadline).length;
    if (noPhoto) warn.push(`без фото: ${noPhoto}`);
    if (noDl) warn.push(`срок уточняется: ${noDl}`);
    L.cc_missing.forEach((x) => warn.push(x));
    top({ back: ["#objects", "Объекты"], cap: objLine(o), title: mode === "first" ? "Письмо" : "Апдейт", tabs: [id, "letter"],
      right: `<span class="chip warn">${timerTo(mode === "first" ? 14 : 10, o.okrug)}</span>`,
      extra: `${segHtml("lmode", ["Первое письмо", "Апдейт"], mode === "first" ? "Первое письмо" : "Апдейт")}
        ${L.authors.length ? `<div class="row sub" style="justify-content:flex-start;flex-wrap:wrap;gap:6px">Авторы: ${L.authors.map((a) => `<span class="chip" style="background:${a.bg};color:#16181d">${esc(a.name)}</span>`).join("")}</div>` : ""}` });
    const open = rs.filter((r) => ["open", "fixed"].includes(r.status));
    const editor = mode === "update" ? `
      <div class="card ${zhOk ? "" : "warnc"}"><b>Анастасия Жихарева приняла фото исправлений в МАХ?</b><span class="sub">Без её ответа до 10:00 апдейт не отправляем</span>
        <div class="btns"><button class="small ${zhOk ? "main" : ""}" id="zhy">Да, приняла</button><button class="small ghost" id="zhn">Ждём ответа</button></div></div>
      <div class="group">Редактор апдейта</div>
      ${open.map((r) => `<div class="card upd" data-rid="${r.id}">
        <div class="row sub"><span>${r.section === "equip" ? "ОБОРУДОВАНИЕ" : "СТРОЙКА"} · №${r.n}${r.deadline ? " · срок " + fmtShort(r.deadline) : ""}</span><span class="chip ${r.status === "fixed" ? "warn" : "info"}">${r.status === "fixed" ? "исправлено" : "открыто"}</span></div>
        <a href="#o/${id}/r/${r.id}" style="color:inherit;text-decoration:none">${esc(r.text)}</a>
        ${r.comments.map((c) => `<span class="sub" style="color:${c.color || "var(--muted)"}">– ${esc(c.text)} <i>(${esc(c.author)})</i></span>`).join("")}
        <div class="actions2">${r.status === "open" ? `<button data-st="fixed">Исправлено</button>` : `<span></span>`}<button class="main" data-st="accepted" data-confirm="1">✓ Принято</button></div>
        <details><summary class="sub" style="cursor:pointer">+ комментарий из ветки</summary>
          <div style="display:flex;flex-direction:column;gap:6px;margin-top:6px"><select data-ca><option value="">Прогресс / новый срок — оранжевым</option>${COMMENT_AUTHORS.map((a) => `<option>${a}</option>`).join("")}${o.coordinator.name ? `<option>${esc(o.coordinator.name)}</option>` : ""}</select>
          <textarea rows="2" data-ct placeholder="(сегодня сделают)"></textarea><button class="small" data-cadd>Добавить</button></div></details></div>`).join("") || `<div class="empty">Открытых пунктов нет</div>`}
      <label class="tick" style="font-weight:500;font-size:14px"><input type="checkbox" id="noch" ${ex.nochange ? "checked" : ""}> За сутки ничего не изменилось (оранжевая строка «Замечания по строительной части»)</label>` : "";
    render(`${warn.length ? `<div class="card warnc"><b>Проверьте перед отправкой</b><span class="sub">${esc(warn.join(" · "))}</span></div>` : ""}
      ${editor}
      <div class="group">${mode === "first" ? "Письмо в вёрстке шаблона" : "Апдейт — предпросмотр"}</div>
      <div class="paper" id="paper">${L.html_app}</div>
      ${mode === "first" || ex.ahch_scan ? ahchHtml(ex) : ""}
      <details class="card"><summary class="title" style="cursor:pointer">Получатели · ${1 + L.cc.length}</summary>
        <span class="sub"><b>Кому:</b> ${L.to.map(([n, e]) => esc(n) + " &lt;" + esc(e) + "&gt;").join(", ")}</span>
        <span class="sub"><b>Копия:</b> ${L.cc.map(([n, e]) => esc(n) + " &lt;" + esc(e) + "&gt;").join(", ")}</span>
        <span class="sub"><b>Тема:</b> ${esc(L.subject)}</span>
        <div class="btns"><button class="small ghost" id="cpTo">Скопировать адреса</button><button class="small ghost" id="cpSubj">Скопировать тему</button></div></details>
      <label class="tick" style="font-weight:500;font-size:14px"><input type="checkbox" id="shg" ${ex.show_received ? "checked" : ""}> В недовозах писать «(вместо N пришло M)»</label>
      <div class="bottom" style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><button class="main" id="copyL">Скопировать письмо</button><button id="mail">Открыть почту</button></div>`);
    bindSeg("lmode", (v) => (location.hash = `#o/${id}/letter/${v === "Апдейт" ? "update" : "first"}`));
    document.getElementById("copyL").onclick = () => copyHtml(L.html, L.text);
    document.getElementById("mail").onclick = () => { copyHtml(L.html, L.text); setTimeout(() => go(L.mailto), 400); };
    document.getElementById("cpTo").onclick = () => copy(L.to.concat(L.cc).map((x) => x[1]).join("; "));
    document.getElementById("cpSubj").onclick = () => copy(L.subject);
    document.getElementById("shg").onchange = async (e) => { await api("PUT", `/api/objects/${id}/extras`, { show_received: e.target.checked }); letterScreen(id, mode); };
    bindAhch(id, ex, () => letterScreen(id, mode));
    // фото-разделы и строки статусов с фото: нажатие — открыть фото или догрузить прямо отсюда
    const cnt = ex.album_count || {};
    document.getElementById("paper").addEventListener("click", (e) => {
      const a = e.target.closest("[data-album]"); if (!a) return;
      e.preventDefault(); e.stopPropagation();
      const key = a.dataset.album, url = (ex.albums || {})[key];
      let sh = document.getElementById("lsheet"); if (!sh) { sh = document.createElement("div"); sh.id = "lsheet"; sh.className = "sheet"; document.body.appendChild(sh); }
      sh.innerHTML = `<b>${esc(a.dataset.title)}</b><span class="sub">${url ? `фото: ${cnt[key] || 1} · ссылка уже в письме` : "фото ещё нет — после загрузки название станет ссылкой в письме"}</span>
        <div class="btns">${url ? `<button class="main" id="lsOpen">Открыть фото</button>` : ""}<label class="btn ${url ? "" : "main"}">📷 ${url ? "Добавить ещё" : "Загрузить фото"}<input type="file" accept="image/*" multiple hidden id="lsFile"></label></div>
        <button class="small ghost" id="lsClose">Закрыть</button>`;
      sh.hidden = false;
      document.getElementById("lsClose").onclick = () => (sh.hidden = true);
      const op = document.getElementById("lsOpen"); if (op) op.onclick = () => go(url);
      document.getElementById("lsFile").onchange = async (ev) => {
        for (const f of ev.target.files) { try { toast("Загружаю на Диск…"); await api("POST", `/api/objects/${id}/album/${key}`, { image_b64: await shrink(f) }); } catch (er) { toast(er.message); } }
        sh.hidden = true; toast("Фото на Диске — ссылка в письме"); letterScreen(id, mode);
      };
    });
    $app.querySelectorAll("#paper [data-rid]").forEach((el) => (el.onclick = () => (location.hash = `#o/${id}/r/${el.dataset.rid}`)));
    if (mode === "update") {
      document.getElementById("zhy").onclick = async () => { await api("PUT", `/api/objects/${id}/extras`, { zh_ok: today }); letterScreen(id, mode); };
      document.getElementById("zhn").onclick = async () => { await api("PUT", `/api/objects/${id}/extras`, { zh_ok: "" }); letterScreen(id, mode); };
      document.getElementById("noch").onchange = async (e) => { await api("PUT", `/api/objects/${id}/extras`, { nochange: e.target.checked }); letterScreen(id, mode); };
      $app.querySelectorAll(".upd").forEach((card) => {
        const rid = card.dataset.rid;
        card.querySelectorAll("[data-st]").forEach((b) => (b.onclick = async () => {
          if (b.dataset.confirm === "1") { b.dataset.confirm = "2"; b.textContent = "Точно принято? Нажмите ещё раз"; b.classList.add("confirm"); setTimeout(() => { if (b.isConnected) { b.dataset.confirm = "1"; b.textContent = "✓ Принято"; b.classList.remove("confirm"); } }, 3500); return; }
          try { await api("POST", `/api/objects/${id}/remarks/${rid}/status`, { status: b.dataset.st }); letterScreen(id, mode); } catch (e) { toast(e.message); }
        }));
        card.querySelector("[data-cadd]").onclick = async () => {
          const a = card.querySelector("[data-ca]").value, t = card.querySelector("[data-ct]").value.trim(); if (!t) return;
          await api("POST", `/api/objects/${id}/remarks/${rid}/comment`, a ? { author: a, text: t } : { text: t, progress: true }); letterScreen(id, mode);
        };
      });
    }
  }

  // ---------- замечание ----------
  function statusChip(s) {
    return { open: "", fixed: `<span class="chip warn">исправлено, ждёт подтверждения</span>`, accepted: `<span class="chip ok">принято</span>`, fixed_on_site: `<span class="chip ok">устранено в ходе приёмки</span>` }[s] || "";
  }
  async function remarkForm(id, stage, zi, rid) {
    const [o, people, all] = await Promise.all([api("GET", `/api/objects/${id}`), api("GET", `/api/objects/${id}/people`), rid ? api("GET", `/api/objects/${id}/remarks`) : []]);
    let pre = {}; if (!rid) { try { pre = JSON.parse(sessionStorage.getItem("newRemark") || "{}"); sessionStorage.removeItem("newRemark"); } catch (e) {} }
    const r = rid ? all.find((x) => x.id === rid) : { section: pre.section || (stage == 2 ? "equip" : "build"), zone: pre.zone || ZONES[zi] || ZONES[0], text: pre.text || "", phrase: "", deadline: "", deadline_ask: "", deadline_text: "", photos: [], stage, comments: [], deadline_history: [], status: "open", item_ref: pre.item_ref || "" };
    if (!r) throw new Error("замечание не найдено");
    const back = pre.plan_mark ? `#o/${id}/plan/${pre.plan_mark.plan}/${pre.plan_mark.page}` : `#o/${id}/walk/${r.stage || 1}`;
    const opt = (sel) => people.map((p) => `<option value="${esc(p.name)}" data-e="${esc(p.email)}" ${p.name === sel ? "selected" : ""}>${esc(p.name)} — ${esc(p.role)}</option>`).join("");
    const iso = (d) => d.toISOString().slice(0, 10), td = new Date(), tm = new Date(td.getTime() + 864e5);
    top({ back: [back, "Обход"], cap: objLine(o), title: rid ? `Замечание №${r.n}` : "Новое замечание" });
    render(`${segHtml("sec", ["Стройка", "Оборудование"], r.section === "equip" ? "Оборудование" : "Стройка")}
      <label class="f">Зона<select id="zone">${ZONES.map((z) => `<option ${z === r.zone ? "selected" : ""}>${z}</option>`).join("")}</select></label>
      ${pre.hint ? `<div class="note">Пункт чек-листа: ${esc(pre.hint)}</div>` : ""}
      ${(pre.plan_mark || r.plan_mark || {}).plan ? `<a class="chip info" id="onPlan" href="#o/${id}/plan/${(pre.plan_mark || r.plan_mark).plan}/${(pre.plan_mark || r.plan_mark).page || 1}" style="align-self:flex-start">◎ на плане</a>` : rid ? `<a class="chip" href="#o/${id}/plan" style="align-self:flex-start;border:1px solid var(--line)">◎ отметить на плане — откройте «План»</a>` : ""}
      <div class="card"><span class="kicker">Что сделать / где</span><textarea id="text" rows="3" placeholder="Подкрасить плитку армстронг в тамбуре">${esc(r.text)}</textarea>
        <span class="kicker">Ссылка на фото — коснитесь начала и конца фразы</span><div class="words" id="words"></div></div>
      <div class="card"><span class="title">Фото · ${r.photos.length}</span>
        ${r.photos.length ? `<div class="btns">${r.photos.map((p, i) => `<a class="chip ok" href="${esc(p.url)}">фото ${i + 1}</a>`).join("")}</div>` : ""}
        ${rid ? `<label class="btn">📷 Добавить фото<input type="file" accept="image/*" id="photo" hidden multiple></label>` : `<span class="sub">Фото — сразу после сохранения (камера или галерея), они уйдут на Яндекс Диск</span>`}</div>
      <div class="card ${r.deadline || r.deadline_text || r.question ? "" : "warnc"}"><span class="kicker" style="color:var(--warn)">Срок устранения · обязательно</span>
        <div class="btns"><button class="small ghost" data-day="${iso(td)}">Сегодня</button><button class="small ghost" data-day="${iso(tm)}">Завтра ${fmtShort(iso(tm))}</button><button class="small ghost" id="pmp">По мере поступления</button></div>
        <label class="f">Дата<input type="date" id="deadline" value="${r.deadline || ""}"></label>
        <input id="dtext" type="hidden" value="${esc(r.deadline_text || "")}">${r.deadline_text ? `<span class="chip info">${esc(r.deadline_text)}</span>` : ""}
        <label class="f">или срок уточняется у<select id="ask"><option value="">—</option>${opt(r.deadline_ask)}</select></label>
        ${rid && r.deadline ? `<label class="f">Причина переноса (если меняете дату)<input id="reason" placeholder="без причины — даты пойдут в строку"></label>` : ""}
        ${r.deadline_history.length ? `<span class="sub" style="color:var(--warn)">Переносы: ${r.deadline_history.map((h) => fmt(h.date) + (h.reason ? " — " + esc(h.reason) : "")).join("; ")}</span>` : ""}
        <label class="tick" style="font-weight:500;font-size:14px"><input type="checkbox" id="q" ${r.question ? "checked" : ""}>Вопрос на согласование (срок не обязателен)</label></div>
      <label class="f">Ответственный${r.section === "equip" ? "" : " (если нужен)"}<select id="resp"><option value="">—</option>${opt(r.responsible)}</select></label>
      ${rid ? "" : `<label class="tick" style="font-weight:500;font-size:14px"><input type="checkbox" id="fos">Устранено в ходе приёмки (в первое письмо — зелёным, в апдейты не идёт)</label>`}
      ${rid ? `<div class="card"><span class="title">Статус</span>${statusChip(r.status)}<div class="btns">
        <button class="small" data-st="fixed">Исправлено</button><button class="small main" data-st="accepted">✓ Принято</button><button class="small ghost" data-st="open">Открыть снова</button></div></div>
        <div class="card"><span class="title">Комментарии</span>
        ${r.comments.map((c) => `<div class="sub" style="color:${c.color || "inherit"}"><b>${esc(c.author)}</b> · ${fmt(c.date)}: ${esc(c.text)}</div>`).join("")}
        <select id="ca"><option value="">Прогресс / новый срок — оранжевым</option>${COMMENT_AUTHORS.map((a) => `<option>${a}</option>`).join("")}${o.coordinator.name ? `<option>${esc(o.coordinator.name)}</option>` : ""}</select>
        <textarea id="cm" rows="2" placeholder="Ответ из ветки, прогресс («сегодня сделают»)"></textarea><button class="small" id="addc">Добавить</button></div>` : ""}
      <div class="bottom"><button class="main" id="save">${rid ? "Сохранить" : "Сохранить и добавить фото"}</button></div>`);
    bindSeg("sec");
    // фраза-ссылка плашками: первое касание — начало, второе — конец
    let phrase = r.phrase || "", startI = null;
    const words = () => document.getElementById("text").value.split(/\s+/).filter(Boolean);
    function drawWords() {
      const w = words(); const ph = phrase.split(/\s+/).filter(Boolean);
      let s = -1; for (let i = 0; i + ph.length <= w.length && ph.length; i++) if (w.slice(i, i + ph.length).join(" ").toLowerCase() === ph.join(" ").toLowerCase()) { s = i; break; }
      document.getElementById("words").innerHTML = w.map((x, i) => `<button type="button" class="w ${s >= 0 && i >= s && i < s + ph.length ? "on" : ""} ${startI === i ? "start" : ""}" data-w="${i}">${esc(x)}</button>`).join("") || `<span class="sub">Сначала напишите текст</span>`;
      document.querySelectorAll("[data-w]").forEach((b) => (b.onclick = () => {
        const i = +b.dataset.w;
        if (startI === null) { startI = i; phrase = w[i]; } else { const a = Math.min(startI, i), z = Math.max(startI, i); phrase = w.slice(a, z + 1).join(" "); startI = null; }
        drawWords();
      }));
    }
    const ta = document.getElementById("text");
    // по умолчанию — от первого глагола до «;» (как в ТЗ), пока руководитель не выбрал плашками сам
    let manual = !!r.phrase;
    const defPhrase = () => { const v = ta.value, m = v.match(/[А-Яа-яЁё]+(?:ть|ти|чь)(?:ся)?(?=[\s,.;]|$)/); return m ? v.slice(m.index).split(";")[0].trim().replace(/[.,]$/, "") : v.split(";")[0].trim(); };
    ta.addEventListener("input", () => { if (!manual) phrase = defPhrase(); drawWords(); });
    document.getElementById("words").addEventListener("click", () => (manual = true));
    if (!phrase && ta.value) phrase = defPhrase();
    drawWords();
    $app.querySelectorAll("[data-day]").forEach((b) => (b.onclick = () => { document.getElementById("deadline").value = b.dataset.day; document.getElementById("dtext").value = ""; }));
    document.getElementById("pmp").onclick = () => { document.getElementById("dtext").value = "по мере поступления"; document.getElementById("deadline").value = ""; toast("Срок: по мере поступления"); };
    const respSel = document.getElementById("resp");
    document.getElementById("save").onclick = async () => {
      const ask = document.getElementById("ask"), rs = respSel.selectedOptions[0], dl = document.getElementById("deadline").value, dt = document.getElementById("dtext").value;
      const body = { section: segVal("sec") === "Оборудование" ? "equip" : "build", zone: document.getElementById("zone").value, stage: r.stage || stage, text: ta.value,
        phrase, deadline: dl, deadline_text: dl ? "" : dt, deadline_ask: dl || dt ? "" : ask.value, question: document.getElementById("q").checked,
        responsible: respSel.value, responsible_email: rs ? rs.dataset.e || "" : "", item_ref: r.item_ref || "" };
      if (pre.plan_mark) body.plan_mark = pre.plan_mark;
      const rsn = document.getElementById("reason"); if (rsn) body.reason = rsn.value;
      const fos = document.getElementById("fos"); if (fos && fos.checked) body.fixed_on_site = true;
      try {
        const saved = rid ? await api("PUT", `/api/objects/${id}/remarks/${rid}`, body) : await api("POST", `/api/objects/${id}/remarks`, body);
        toast("Сохранено"); location.hash = `#o/${id}/r/${saved.id}`;
      } catch (e) { toast(e.message); }
    };
    const ph = document.getElementById("photo");
    if (ph) ph.onchange = async () => {
      for (const f of ph.files) { try { toast("Загружаю фото на Диск…"); await api("POST", `/api/objects/${id}/remarks/${rid}/photo`, { image_b64: await shrink(f) }); } catch (e) { toast(e.message); } }
      remarkForm(id, stage, zi, rid);
    };
    $app.querySelectorAll("[data-st]").forEach((b) => (b.onclick = async () => { try { await api("POST", `/api/objects/${id}/remarks/${rid}/status`, { status: b.dataset.st }); remarkForm(id, stage, zi, rid); } catch (e) { toast(e.message); } }));
    const addc = document.getElementById("addc");
    if (addc) addc.onclick = async () => { const a = document.getElementById("ca").value; await api("POST", `/api/objects/${id}/remarks/${rid}/comment`, a ? { author: a, text: document.getElementById("cm").value } : { text: document.getElementById("cm").value, progress: true }); remarkForm(id, stage, zi, rid); };
  }
  function shrink(file, max = 1800) {
    return new Promise((res, rej) => {
      const img = new Image(); img.onerror = rej;
      img.onload = () => { const k = Math.min(1, max / Math.max(img.width, img.height)); const c = document.createElement("canvas");
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        res(c.toDataURL("image/jpeg", 0.82).split(",")[1]); URL.revokeObjectURL(img.src); };
      img.src = URL.createObjectURL(file);
    });
  }

  // ---------- план магазина: листы, метки замечаний, контрольные точки ----------
  const IMG = {};
  async function planImage(id, file) {
    if (IMG[file]) return IMG[file];
    const r = await fetch(`/api/objects/${id}/plan-image/${file}`, { headers: { "X-Telegram-Init-Data": tg ? tg.initData : "" } });
    if (!r.ok) throw new Error("лист не загрузился");
    return (IMG[file] = URL.createObjectURL(await r.blob()));
  }
  const MARK_COLORS = { open: "#dc2626", fixed: "#eab308", accepted: "#16a34a", fixed_on_site: "#16a34a" };
  let PLANMODE = "remark";
  async function planScreen(id, pid, page) {
    const [o, P] = await Promise.all([api("GET", `/api/objects/${id}`), api("GET", `/api/objects/${id}/plans`)]);
    const plans = P.plans;
    const plan = plans.find((x) => x.id === pid) || plans[0];
    top({ back: ["#objects", "Объекты"], cap: objLine(o), title: "План", tabs: [id, "plan"],
      right: `<label class="btn small main">+ PDF<input type="file" accept="application/pdf" id="planFile" hidden></label>` });
    if (!plan) {
      render(`<div class="empty"><b>Планов пока нет</b><span>Загрузите PDF из Кайтена: план монтажа, план категорий, световой план, ТЗ на фасад. DWG сначала сохраните в PDF.</span>
        <label class="btn main">Загрузить PDF<input type="file" accept="application/pdf" id="planFile2" hidden></label></div>`);
      bindPlanUpload(id); return;
    }
    page = Math.min(Math.max(1, page || 1), plan.pages.length);
    const pg = plan.pages[page - 1];
    const marks = P.marks.filter((m) => m.plan === plan.id && m.page === page);
    const points = P.points.filter((m) => m.plan === plan.id && m.page === page);
    const cnt = (st) => P.marks.filter((m) => m.plan === plan.id && (st === "accepted" ? ["accepted", "fixed_on_site"].includes(m.status) : m.status === st)).length;
    render(`<div class="chips">${plans.map((p) => `<a class="chipb ${p.id === plan.id ? "on" : ""}" href="#o/${id}/plan/${p.id}">${esc(p.title)}${p.pages.length > 1 ? " · " + p.pages.length + " л." : ""}</a>`).join("")}</div>
      <div class="row">
        ${plan.pages.length > 1 ? `<span class="row" style="gap:6px"><a class="btn small ghost" href="#o/${id}/plan/${plan.id}/${Math.max(1, page - 1)}">‹</a><b>Лист ${page} из ${plan.pages.length}</b><a class="btn small ghost" href="#o/${id}/plan/${plan.id}/${Math.min(plan.pages.length, page + 1)}">›</a></span>` : `<span class="sub">${esc(P.kinds[plan.kind] || "")}</span>`}
        <button class="small ghost" id="planEdit">⋯</button></div>
      ${plan.parsed && (plan.parsed.luminaires_total || Object.keys(plan.parsed.passport || {}).length) ? (() => { const pr = plan.parsed, pa = pr.passport || {};
        const facts = [pr.luminaires_total ? `светильников ${pr.luminaires_total} (${pr.luminaires.length} типов)` : "", pr.emergency ? `аварийных «А» ${pr.emergency}` : "",
          pa.cash ? `кассы ${pa.cash}` : "", pa.grids != null ? `сетки ${pa.grids}` : "", pa.ends != null ? `торцы ${pa.ends_note || pa.ends}` : "", pa.coffee ? `кофестанция ${pa.coffee === 2 ? "двойная" : "одна"}${pa.coffee_size ? " (" + pa.coffee_size + ")" : ""}` : "",
          pa.s_hall ? `S зала ${String(pa.s_hall).replace(".", ",")} м²` : ""].filter(Boolean);
        return `<div class="card" style="background:var(--accent-soft);border:0"><b style="font-size:14px">Прочитано из файла</b><span class="sub" style="color:var(--fg)">${esc(facts.join(" · "))}</span>
          ${(pr.discrepancies || []).map((d) => `<span class="chip warn" style="white-space:normal">⚠ ${esc(d)}</span>`).join("")}
          <button class="small main" id="papply">Подставить в опрос и световой план</button></div>`; })() : ""}
      <div id="planEditBox" hidden class="card"><label class="f">Название<input id="pt" value="${esc(plan.title)}"></label>
        <label class="f">Что это<select id="pk">${Object.entries(P.kinds).map(([k, n]) => `<option value="${k}" ${k === plan.kind ? "selected" : ""}>${n}</option>`).join("")}</select></label>
        <div class="btns"><button class="small main" id="psave">Сохранить</button><button class="small ghost" id="pdel">Удалить план</button></div></div>
      ${segHtml("pmode", ["Метка замечания", "Контрольная точка"], PLANMODE === "point" ? "Контрольная точка" : "Метка замечания")}
      <div class="planview" id="pv"><div class="stage" id="stage" style="width:${pg.w}px;height:${pg.h}px">
        <img id="pimg" alt="План" draggable="false" style="width:${pg.w}px;height:${pg.h}px">
        ${marks.map((m) => `<button class="pmark" data-rid="${m.rid}" style="left:${m.x * 100}%;top:${m.y * 100}%;--c:${MARK_COLORS[m.status] || "#dc2626"}" title="${esc(m.text)}"></button>`).join("")}
        ${points.map((m) => { const d = m.fact !== "" && m.fact != null && m.plan_cm ? +m.fact - +m.plan_cm : null; return `<button class="ppoint ${d === null ? "" : Math.abs(d) > 15 ? "bad" : "ok"}" data-pi="${m.i}" style="left:${m.x * 100}%;top:${m.y * 100}%">${m.i + 1}</button>`; }).join("")}
      </div><div class="pv-hint">Два пальца — масштаб · касание — ${PLANMODE === "point" ? "контрольная точка" : "метка замечания"}</div></div>
      <div class="legend"><span><i style="background:#dc2626"></i>открыто ${cnt("open")}</span><span><i style="background:#eab308"></i>исправлено ${cnt("fixed")}</span><span><i style="background:#16a34a"></i>принято ${cnt("accepted")}</span></div>
      <div id="sheet" class="sheet" hidden></div>`);
    bindPlanUpload(id);
    bindSeg("pmode", (v) => { PLANMODE = v === "Контрольная точка" ? "point" : "remark"; document.querySelector(".pv-hint").textContent = "Два пальца — масштаб · касание — " + (PLANMODE === "point" ? "контрольная точка" : "метка замечания"); });
    const pap = document.getElementById("papply"); if (pap) pap.onclick = async () => { await api("POST", `/api/objects/${id}/plans/${plan.id}/apply`); toast("Подставлено: опрос и световой план (этап 2)"); };
    document.getElementById("planEdit").onclick = () => { const b = document.getElementById("planEditBox"); b.hidden = !b.hidden; };
    document.getElementById("psave").onclick = async () => { await api("PUT", `/api/objects/${id}/plans/${plan.id}`, { title: document.getElementById("pt").value, kind: document.getElementById("pk").value }); toast("Сохранено"); planScreen(id, plan.id, page); };
    const del = document.getElementById("pdel");
    del.onclick = async () => { if (del.dataset.c !== "1") { del.dataset.c = "1"; del.textContent = "Точно удалить? Метки с него снимутся"; return; } await api("POST", `/api/objects/${id}/plans/${plan.id}/delete`); toast("План удалён"); location.hash = `#o/${id}/plan`; };
    const img = document.getElementById("pimg");
    try { img.src = await planImage(id, pg.file); } catch (e) { toast(e.message); }
    const sheet = document.getElementById("sheet");
    const showSheet = (html) => { sheet.innerHTML = html + `<button class="small ghost" id="shClose">Закрыть</button>`; sheet.hidden = false; document.getElementById("shClose").onclick = () => (sheet.hidden = true); };
    planViewer(document.getElementById("pv"), document.getElementById("stage"), pg, (x, y) => {
      if (PLANMODE === "point") {
        showSheet(`<b>Контрольная точка ${(o.extras.measures || []).length + 1}</b><span class="sub">Зелёная цифра на плане: проектная ширина прохода и замер рулеткой</span>
          <div class="grid2"><label class="f">По плану, см<input id="ppl" inputmode="numeric"></label><label class="f">Факт, см<input id="pfa" inputmode="numeric"></label></div>
          <button class="main" id="ppSave">Сохранить точку</button>`);
        document.getElementById("ppSave").onclick = async () => {
          const ms = (o.extras.measures || []).slice(); const pl = document.getElementById("ppl").value.trim(), fa = document.getElementById("pfa").value.trim();
          ms.push({ plan: plan.id, page, x, y, plan_cm: pl, fact: fa }); await api("PUT", `/api/objects/${id}/extras`, { measures: ms });
          const d = fa && pl ? +fa - +pl : null; toast(d !== null && Math.abs(d) > 15 ? `Отклонение ${d > 0 ? "+" : ""}${d} см — больше допуска` : "Точка сохранена"); planScreen(id, plan.id, page);
        };
        return;
      }
      showSheet(`<b>Новое замечание в этой точке</b><span class="sub">Зона и текст — на следующем экране</span>
        <div class="btns"><button class="main" id="nrB">Стройка</button><button class="main" id="nrE">Оборудование</button></div>`);
      const go2 = (section) => { try { sessionStorage.setItem("newRemark", JSON.stringify({ section, plan_mark: { plan: plan.id, page, x, y } })); } catch (e) {} location.hash = `#o/${id}/rnew/${section === "equip" ? 2 : 1}/0`; };
      document.getElementById("nrB").onclick = () => go2("build"); document.getElementById("nrE").onclick = () => go2("equip");
    });
    $app.querySelectorAll(".pmark").forEach((b) => b.addEventListener("click", (e) => {
      e.stopPropagation(); const m = P.marks.find((x) => x.rid === b.dataset.rid);
      showSheet(`<span class="row"><b>${esc(m.zone)} · ${m.section === "equip" ? "оборудование" : "стройка"}</b>${statusChip(m.status) || `<span class="chip bad">открыто</span>`}</span>
        <span>${esc(m.text)}</span><span class="sub">${m.deadline ? "срок " + fmt(m.deadline) : "срок не указан"} · фото: ${m.photos} · ${esc(m.author)}</span>
        <a class="btn main" href="#o/${id}/r/${m.rid}">Открыть замечание</a>`);
    }));
    $app.querySelectorAll(".ppoint").forEach((b) => b.addEventListener("click", (e) => {
      e.stopPropagation(); const m = (o.extras.measures || [])[+b.dataset.pi] || {};
      const pl = m.plan_cm ?? "", fa = m.fact ?? "", d = fa !== "" && pl !== "" ? +fa - +pl : null;
      showSheet(`<b>Точка ${+b.dataset.pi + 1}</b><span class="sub">${d === null ? "не замерено" : Math.abs(d) > 15 ? `отклонение ${d > 0 ? "+" : ""}${d} см — больше ±15` : "в допуске"}</span>
        <div class="grid2"><label class="f">По плану, см<input id="ppl" inputmode="numeric" value="${esc(pl)}"></label><label class="f">Факт, см<input id="pfa" inputmode="numeric" value="${esc(fa)}"></label></div>
        <div class="btns"><button class="main" id="ppUpd">Сохранить</button>${d !== null && Math.abs(d) > 15 ? `<button id="ppRem">В замечание</button>` : ""}</div>`);
      document.getElementById("ppUpd").onclick = async () => { const ms = (o.extras.measures || []).slice(); ms[+b.dataset.pi] = { ...m, plan_cm: document.getElementById("ppl").value.trim(), fact: document.getElementById("pfa").value.trim() }; await api("PUT", `/api/objects/${id}/extras`, { measures: ms }); toast("Сохранено"); planScreen(id, plan.id, page); };
      const rr = document.getElementById("ppRem"); if (rr) rr.onclick = () => { try { sessionStorage.setItem("newRemark", JSON.stringify({ section: "equip", zone: "Стеллажка", plan_mark: { plan: plan.id, page, x: m.x, y: m.y }, text: `Проход у точки ${+b.dataset.pi + 1}: по плану ${pl} см, по факту ${fa} см — привести в соответствие с планировкой` })); } catch (_) {} location.hash = `#o/${id}/rnew/2/5`; };
    }));
    const focus = sessionStorage.getItem("planFocus"); if (focus) { sessionStorage.removeItem("planFocus"); const b = $app.querySelector(`.pmark[data-rid="${focus}"]`); if (b) { b.classList.add("pulse"); setTimeout(() => b.click(), 300); } }
  }
  function bindPlanUpload(id) {
    ["planFile", "planFile2"].forEach((fid) => { const inp = document.getElementById(fid); if (!inp) return;
      inp.onchange = async () => { const f = inp.files[0]; if (!f) return;
        if (f.size > 22 * 1024 * 1024) return toast("Файл больше 22 МБ — сохраните PDF поменьше");
        toast("Загружаю план…");
        const b64 = await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result.split(",")[1]); fr.readAsDataURL(f); });
        try { const P = await api("POST", `/api/objects/${id}/plans`, { file_b64: b64, title: f.name.replace(/\.pdf$/i, "") }); toast("План загружен"); location.hash = `#o/${id}/plan/${P.plans[P.plans.length - 1].id}`; } catch (e) { toast(e.message); }
      }; });
  }
  /** Масштаб двумя пальцами, перетаскивание, двойное касание — увеличить; одиночное касание — onTap(x, y) в долях листа. */
  function planViewer(view, stage, pg, onTap) {
    const st = { s: 1, x: 0, y: 0 };
    const fit = () => { const w = view.clientWidth, h = view.clientHeight; st.s = Math.min(w / pg.w, h / pg.h); st.x = (w - pg.w * st.s) / 2; st.y = (h - pg.h * st.s) / 2; apply(); };
    const apply = () => { stage.style.transform = `translate(${st.x}px,${st.y}px) scale(${st.s})`; stage.style.setProperty("--inv", 1 / st.s); };
    const zoomAt = (cx, cy, k) => { const r = view.getBoundingClientRect(), px = cx - r.left, py = cy - r.top; const ns = Math.min(Math.max(st.s * k, 0.05), 6); st.x = px - (px - st.x) * (ns / st.s); st.y = py - (py - st.y) * (ns / st.s); st.s = ns; apply(); };
    const pts = new Map(); let start = null, moved = false, pinch = null, lastTap = 0;
    view.addEventListener("pointerdown", (e) => { if (e.target.closest(".pmark,.ppoint")) return; view.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 1) { start = { x: e.clientX, y: e.clientY, sx: st.x, sy: st.y, t: Date.now() }; moved = false; }
      if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), s: st.s }; moved = true; } });
    view.addEventListener("pointermove", (e) => { if (!pts.has(e.pointerId)) return; pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2 && pinch) { const [a, b] = [...pts.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, (pinch.s * d / pinch.d) / st.s); }
      else if (pts.size === 1 && start) { const dx = e.clientX - start.x, dy = e.clientY - start.y; if (Math.hypot(dx, dy) > 6) moved = true; if (moved) { st.x = start.sx + dx; st.y = start.sy + dy; apply(); } } });
    const end = (e) => { if (!pts.has(e.pointerId)) return; pts.delete(e.pointerId); if (pts.size < 2) pinch = null;
      if (pts.size === 0 && start && !moved && Date.now() - start.t < 400) {
        const now = Date.now();
        if (now - lastTap < 300) { zoomAt(e.clientX, e.clientY, 2); lastTap = 0; clearTimeout(view.tt); return; }
        lastTap = now; const cx = e.clientX, cy = e.clientY;
        view.tt = setTimeout(() => { const r = view.getBoundingClientRect(); const x = (cx - r.left - st.x) / st.s / pg.w, y = (cy - r.top - st.y) / st.s / pg.h; if (x >= 0 && x <= 1 && y >= 0 && y <= 1) onTap(+x.toFixed(5), +y.toFixed(5)); }, 280);
      }
      if (pts.size === 0) start = null;
      if (pts.size === 1) { const p = [...pts.values()][0]; start = { x: p.x, y: p.y, sx: st.x, sy: st.y, t: 0 }; } };
    view.addEventListener("pointerup", end); view.addEventListener("pointercancel", end);
    view.addEventListener("wheel", (e) => { e.preventDefault(); zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.15 : 1 / 1.15); }, { passive: false });
    requestAnimationFrame(fit);
  }

  // ---------- инструкция внутри приложения ----------
  function docScreen(path) {
    $top.innerHTML = ""; $top.hidden = true;          // своя стеклянная панель страницы сверху — без нашей шапки
    $app.innerHTML = `<iframe id="doc" src="${esc(path)}" title="Инструкция" allow="clipboard-write; web-share"></iframe>
      ${tg && tg.BackButton && inTg ? "" : `<a class="docback" href="javascript:history.back()">← Назад</a>`}`;
    lastRoute = location.hash;
    const fr = document.getElementById("doc");
    fr.onload = () => {
      try {
        const d = fr.contentDocument;
        d.addEventListener("click", (e) => {
          const a = e.target.closest("a[href]"); if (!a) return;
          const href = a.getAttribute("href");
          if (href.startsWith("#")) return;                    // оглавление внутри страницы
          const abs = new URL(href, fr.contentWindow.location.href).href;
          if (abs.startsWith(location.origin + "/") && /\.html?$/i.test(abs.split(/[?#]/)[0])) return;   // другая инструкция — в этом же окне
          e.preventDefault(); go(abs);                         // PDF, сайты, почта — наружу
        });
      } catch (e) {}
    };
    if (tg && tg.BackButton) { tg.BackButton.show(); tg.BackButton.onClick(back); }
    function back() { if (tg && tg.BackButton) { tg.BackButton.hide(); tg.BackButton.offClick(back); } history.back(); }
    window.addEventListener("hashchange", function off() { if (tg && tg.BackButton) { tg.BackButton.hide(); tg.BackButton.offClick(back); } window.removeEventListener("hashchange", off); });
  }

  // ---------- маршруты ----------
  async function route() {
    const h = location.hash.replace(/^#/, "") || "objects";
    const m = h.match(/^o\/([0-9a-f]{12})(?:\/(\w+))?(?:\/(\w+))?(?:\/(\d+))?/);
    if (m && m[2] === "plan" && m[3] && /^\d+$/.test(m[3])) { m[4] = m[3]; m[3] = ""; }
    try {
      if (h.startsWith("doc/")) return docScreen(decodeURIComponent(h.slice(4)));
      if (h === "objects") return await objects();
      if (h === "new") return await newObject();
      if (h === "instr" || h === "memo") return await instrScreen(null);
      if (m && !m[2]) return await prep(m[1]);
      if (m && m[2] === "data") return await dataScreen(m[1]);
      if (m && m[2] === "survey") return await surveyScreen(m[1]);
      if (m && m[2] === "plan") return await planScreen(m[1], m[3] || "", +(m[4] || 1));
      if (m && m[2] === "instr") return await instrScreen(m[1]);
      if (m && m[2] === "contracts") return await contractsScreen(m[1]);
      if (m && m[2] === "docs") return await docsScreen(m[1]);
      if (m && m[2] === "ahch") return await ahchScreen(m[1]);
      if (m && m[2] === "dvornik") return await dvornikScreen(m[1]);
      if (m && m[2] === "letter") return await letterScreen(m[1], m[3] === "update" ? "update" : "first");
      if (m && m[2] === "walk") { const s = +(m[3] || 1); return await (s === 3 ? stage3 : s === 2 ? stage2 : stage1)(m[1]); }
      if (m && m[2] === "zone") return await stage1(m[1]);
      if (m && m[2] === "rnew") return await remarkForm(m[1], +m[3], +m[4], null);
      if (m && m[2] === "r") return await remarkForm(m[1], 1, 0, m[3]);
      await objects();
    } catch (e) { fail(e); }
  }
  window.addEventListener("hashchange", () => { fx.nav(); route(); });
  route();
})();
