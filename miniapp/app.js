/* Приёмка магазина — Mini App (без сборки, чистый JS).
   Экраны: #objects · #new · #o/<id> (первый день) · #o/<id>/data · #o/<id>/contracts · #o/<id>/ahch · #o/<id>/dvornik */
(function () {
  "use strict";
  const tg = window.Telegram && Telegram.WebApp;
  if (tg) { tg.ready(); tg.expand(); }
  const API = window.API_BASE || "";
  const $app = document.getElementById("app");
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt = (d) => (d ? d.split("-").reverse().join(".") : "—");

  async function api(method, path, body) {
    const r = await fetch(API + path, {
      method, headers: { "Content-Type": "application/json", "X-Telegram-Init-Data": tg ? tg.initData : "" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const ct = r.headers.get("Content-Type") || "";
    const data = ct.includes("json") ? await r.json() : await r.blob();
    if (!r.ok) throw new Error((data && data.error) || "ошибка " + r.status);
    return data;
  }
  function toast(t) { const el = document.getElementById("toast"); el.textContent = t; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => (el.hidden = true), 2200); }
  async function copy(t) { try { await navigator.clipboard.writeText(t); toast("Скопировано"); } catch (e) { toast("Не удалось скопировать — выделите текст"); } }
  function openLink(u) { if (tg && /^https?:/.test(u)) tg.openLink(u); else location.href = u; }
  function render(html) { $app.innerHTML = html; window.scrollTo(0, 0); }
  function fail(e) { render(`<div class="card"><b>Не получилось</b><span class="sub">${esc(e.message)}</span><button onclick="location.reload()">Обновить</button></div>`); }

  // ---------- экраны ----------
  async function objects() {
    const list = await api("GET", "/api/objects");
    render(`<h1>Мои объекты</h1>
      ${list.length ? "" : `<div class="empty">Объектов пока нет</div>`}
      ${list.map((o) => `<a class="card" href="#o/${o.id}">
        <div class="row"><span class="title">${esc(o.code)}</span><span class="sub">${esc(o.okrug)}</span></div>
        <span class="sub">${esc(o.address)}</span>
        <div class="row"><span class="sub">приёмка ${fmt(o.accept_date)} · открытие ${fmt(o.open_date)}</span>
        ${o.missing_people ? `<span class="chip bad">контакты: ${o.missing_people}</span>` : ""}</div>
        <div class="bar"><i style="width:${(o.firstday_done / o.firstday_total) * 100}%"></i></div></a>`).join("")}
      <a class="btn main" href="#new">+ Новый объект</a>`);
  }

  function objectForm(o) {
    const p = (k) => o[k] || {};
    const okr = o.okrug || "СФО";
    return `
      <div class="card">
        <div class="grid2"><label class="f">Код магазина<input name="code" value="${esc(o.code)}" placeholder="ПР22" required></label>
        <label class="f">Город<input name="city" value="${esc(o.city)}" placeholder="Пермь"></label></div>
        <label class="f">Улица, дом<input name="address" value="${esc(o.address)}" placeholder="Комсомольский пр-т, 36"></label>
        <div class="f" style="font-size:12px;color:var(--muted);font-weight:600">Округ</div>
        <div class="seg" id="okrug">${["СФО", "УФО", "ЦФО"].map((x) => `<button type="button" data-v="${x}" class="${x === okr ? "on" : ""}">${x}</button>`).join("")}</div>
        <div class="grid2"><label class="f">Приёмка<input type="date" name="accept_date" value="${o.accept_date || ""}"></label>
        <label class="f">Открытие<input type="date" name="open_date" value="${o.open_date || ""}"></label></div>
        <label class="f">День заказа размена, печати, доверенности<input type="date" name="razmen_date" value="${(o.flags || {}).razmen_date || ""}"></label>
      </div>
      <div class="card"><span class="title">Люди объекта</span>
        <span class="sub">Вводятся для каждого объекта заново — из других объектов не переносятся</span>
        <label class="f">Почта магазина<input name="store_email" type="email" value="${esc(o.store_email)}"></label>
        ${person("director", "Директор магазина", p("director"), true)}
        ${person("coordinator", "Координатор строительства", p("coordinator"))}
        ${person("dev_manager", "Менеджер по развитию региона", p("dev_manager"))}
        ${okr === "ЦФО" ? person("mops_contractor", "Подрядчик МОПы (ЦФО)", p("mops_contractor"), true) : ""}
      </div>`;
  }
  function person(key, label, v, phone) {
    return `<fieldset style="border:0;padding:0;margin:0;display:flex;flex-direction:column;gap:6px" data-person="${key}">
      <span class="sub" style="font-weight:650">${label}</span>
      <input data-f="name" placeholder="Фамилия Имя Отчество" value="${esc(v.name)}">
      <div class="grid2"><input data-f="phone" type="tel" placeholder="Телефон" value="${esc(v.phone)}">
      <input data-f="email" type="email" placeholder="Почта" value="${esc(v.email)}"></div></fieldset>`;
  }
  function readForm() {
    const d = {};
    $app.querySelectorAll("input[name]").forEach((i) => (d[i.name] = i.value));
    d.okrug = ($app.querySelector("#okrug .on") || {}).dataset?.v || "СФО";
    $app.querySelectorAll("[data-person]").forEach((f) => {
      d[f.dataset.person] = {}; f.querySelectorAll("[data-f]").forEach((i) => (d[f.dataset.person][i.dataset.f] = i.value.trim()));
    });
    return d;
  }
  function bindSeg() { $app.querySelectorAll("#okrug button").forEach((b) => (b.onclick = () => { $app.querySelectorAll("#okrug button").forEach((x) => x.classList.remove("on")); b.classList.add("on"); })); }

  async function newObject() {
    render(`<a class="back" href="#objects">← Объекты</a><h1>Новый объект</h1>${objectForm({})}<button class="main" id="save">Создать</button>`);
    bindSeg();
    document.getElementById("save").onclick = async () => {
      try { const o = await api("POST", "/api/objects", readForm()); location.hash = "#o/" + o.id; } catch (e) { toast(e.message); }
    };
  }

  function head(o, tab) {
    return `<a class="back" href="#objects">← Объекты</a>
      <h1>${esc(o.code)}</h1><span class="sub">${esc(o.full_address || (o.city ? "г. " + o.city + ", " : "") + o.address)}</span>
      <nav class="tabs"><a href="#o/${o.id}" class="${tab === "day" ? "on" : ""}">Первый день</a>
      <a href="#o/${o.id}/data" class="${tab === "data" ? "on" : ""}">Данные</a>
      <a href="#memo" class="${tab === "memo" ? "on" : ""}">Памятка</a></nav>`;
  }

  async function firstDay(id) {
    const [o, steps] = await Promise.all([api("GET", `/api/objects/${id}`), api("GET", `/api/objects/${id}/firstday`)]);
    const done = steps.filter((s) => s.state === "done").length;
    render(`${head(o, "day")}
      <div class="row"><span class="sub">Сделано ${done} из ${steps.length}</span>${o.missing_people.length ? `<a class="chip bad" href="#o/${id}/data">не заполнено: ${o.missing_people.length}</a>` : ""}</div>
      <div class="bar"><i style="width:${(done / steps.length) * 100}%"></i></div>
      ${steps.map((s) => `<div class="card ${s.state}"><div class="step">
        <button class="dot" data-k="${s.key}" data-d="${s.state === "done" ? 0 : 1}" aria-label="Отметить" ${s.key === "contracts" ? "disabled" : ""}>${s.state === "done" ? "✓" : ""}</button>
        <div class="grow"><div class="title">${esc(s.title)}</div><div class="sub">${esc(s.hint)}</div></div>
        ${actionBtn(id, s)}</div></div>`).join("")}`);
    $app.querySelectorAll(".dot[data-k]").forEach((b) => (b.onclick = async () => { await api("POST", `/api/objects/${id}/firstday/${b.dataset.k}`, { done: b.dataset.d === "1" }); firstDay(id); }));
    $app.querySelectorAll("[data-print]").forEach((b) => (b.onclick = () => printToChat(id, b.dataset.print)));
  }
  function actionBtn(id, s) {
    const a = s.action;
    if (!a || s.state === "blocked") return "";
    if (["ahch", "contracts", "dvornik"].includes(a)) return `<a class="btn small" href="#o/${id}/${a}">Открыть</a>`;
    if (a === "mops") return `<a class="btn small" href="#o/${id}/data">Контакт</a>`;
    return "";
  }

  async function dataScreen(id) {
    const o = await api("GET", `/api/objects/${id}`);
    render(`${head(o, "data")}${o.missing_people.length ? `<div class="card alert"><b>Не заполнено:</b> ${esc(o.missing_people.join(", "))}</div>` : ""}
      ${objectForm(o)}
      <label class="card" style="flex-direction:row;align-items:center"><input type="checkbox" id="dv" ${o.flags.dvornik_hired ? "checked" : ""} style="width:20px;height:20px"> Дворник оформлен — напоминать про акт в конце месяца</label>
      <button class="main" id="save">Сохранить</button>
      <button id="vcf">Контакты объекта в чат (.vcf)</button>`);
    bindSeg();
    document.getElementById("save").onclick = async () => {
      try { await api("PUT", `/api/objects/${id}`, { ...readForm(), dvornik_hired: document.getElementById("dv").checked }); toast("Сохранено"); dataScreen(id); } catch (e) { toast(e.message); }
    };
    document.getElementById("vcf").onclick = () => printToChat(id, "vcf");
  }

  const TITLES = { arenda: "Аренда", tko: "ТКО", dez: "Дезинфекция", ops: "ОПС и охрана" };
  async function contractsScreen(id) {
    const o = await api("GET", `/api/objects/${id}`);
    const c = o.contracts;
    render(`<a class="back" href="#o/${id}">← Первый день</a><h1>Договоры</h1>
      <span class="sub">Файл узнаётся по тексту и засчитывается, если в нём есть адрес магазина</span>
      ${Object.keys(TITLES).map((k) => `<div class="card ${c[k].status === "received" ? "" : "alert"}"><div class="row">
        <span class="title">${c[k].status === "received" ? "✅" : "🔴"} ${TITLES[k]}</span>
        <span class="sub">${c[k].status === "received" ? esc([c[k].number && "№ " + c[k].number, c[k].doc_date].filter(Boolean).join(" · ")) : "нет файла"}</span></div></div>`).join("")}
      <label class="btn">+ Загрузить PDF<input type="file" accept="application/pdf" id="file" hidden></label>
      <div class="card"><label class="f">Ответственный
        <select id="to"><option value="dev_manager">${o.dev_manager.name ? esc(o.dev_manager.name) + " · менеджер по развитию" : "— выберите —"}</option><option value="custom">Свой вариант</option></select></label>
        <div id="custom" hidden class="grid2"><input id="cn" placeholder="Имя Фамилия"><input id="ce" type="email" placeholder="Почта"></div>
        <button class="main" id="req" ${o.dev_manager.name ? "" : "disabled"}>${o.dev_manager.name ? "Запросить" : "Выберите, у кого запросить"}</button>
        <pre class="tpl" id="preview" hidden></pre></div>`);
    const sel = document.getElementById("to"), req = document.getElementById("req");
    sel.onchange = () => { document.getElementById("custom").hidden = sel.value !== "custom"; req.disabled = false; req.textContent = "Запросить"; };
    req.onclick = async () => {
      const body = sel.value === "custom" ? { to: "custom", custom: { name: document.getElementById("cn").value, email: document.getElementById("ce").value } } : { to: "dev_manager" };
      try {
        const r = await api("POST", `/api/objects/${id}/contracts/request`, body);
        if (r.all_received) return toast("Все договоры получены");
        const pv = document.getElementById("preview"); pv.hidden = false;
        pv.textContent = `Кому: ${r.to}\nКопия: ${r.cc}\nТема: ${r.subject}\n\n${r.body}`;
        req.textContent = r.button; req.onclick = () => openLink(r.mailto);
      } catch (e) { toast(e.message); }
    };
    document.getElementById("file").onchange = async (ev) => {
      const f = ev.target.files[0]; if (!f) return;
      const b64 = await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result.split(",")[1]); fr.readAsDataURL(f); });
      try {
        let r = await api("POST", `/api/objects/${id}/contracts/upload`, { file_b64: b64 });
        if (r.need_manual || r.warn_address) {
          const pick = prompt((r.reason || "") + "\nВведите: arenda, tko, dez или ops (через запятую)", (r.slots || []).join(","));
          if (!pick) return;
          r = await api("POST", `/api/objects/${id}/contracts/upload`, { file_b64: b64, slots: pick.split(",").map((s) => s.trim()), force: true });
        }
        toast("Засчитано: " + r.slots.map((s) => TITLES[s]).join(", ")); contractsScreen(id);
      } catch (e) { toast(e.message); }
    };
  }

  async function ahchScreen(id) {
    const o = await api("GET", `/api/objects/${id}`);
    const base = await api("POST", `/api/objects/${id}/ahch`, {});
    let items = base.defaults.map((t) => ({ t, on: true }));
    const where = { yk: "Ярче Коммуникации → Помощь → Заявки по АХЧ → Создать", whatsapp: "ЦФО — отправьте в WhatsApp" }[base.channel.kind] || "";
    function draw() {
      render(`<a class="back" href="#o/${id}">← Первый день</a><h1>Заявка АХЧ</h1><span class="sub">${esc(o.okrug)} · ${esc(where)}</span>
        <div class="card">${items.map((it, i) => `<label class="check"><input type="checkbox" data-i="${i}" ${it.on ? "checked" : ""}><textarea data-t="${i}" rows="1">${esc(it.t)}</textarea></label>`).join("")}</div>
        <div class="row"><input id="new" placeholder="Свой пункт"><button class="small" id="add">Добавить</button></div>
        <label class="f">Просьба приехать<input type="date" id="visit" value="${o.accept_date || ""}"></label>
        <button class="main" id="copy">Скопировать текст</button><pre class="tpl" id="out"></pre>`);
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

  async function dvornikScreen(id) {
    const o = await api("GET", `/api/objects/${id}`);
    const ok = o.director.name && o.director.phone;
    render(`<a class="back" href="#o/${id}">← Первый день</a><h1>Дворник</h1>
      <span class="sub">Адрес и телефон директора — из данных объекта</span>
      ${ok ? "" : `<div class="card alert">Укажите ФИО и телефон директора в <a href="#o/${id}/data">данных объекта</a></div>`}
      <div class="card"><span class="title">Объявление «Требуется дворник»</span><div class="btns">
        <button class="main" data-print="dvornik" ${ok ? "" : "disabled"}>На печать</button></div></div>
      <div class="card"><span class="title">Вкладыш на конверт — Светлане Калько</span><span class="sub">договор: 3 экз. (Калько, «Уставные документы», дворнику); акт: 2 экз.</span>
        <div class="btns"><button class="main" data-print="konvert" ${ok ? "" : "disabled"}>На печать</button></div></div>`);
    $app.querySelectorAll("[data-print]").forEach((b) => (b.onclick = () => printToChat(id, b.dataset.print)));
  }

  async function printToChat(id, kind) {
    try { await api("POST", `/api/objects/${id}/print/${kind}`); toast("Файл в чате с ботом"); if (tg) setTimeout(() => tg.close(), 900); }
    catch (e) { toast(e.message); }
  }

  function memo() {
    render(`<a class="back" href="javascript:history.back()">← Назад</a><h1>Памятка</h1>
      <span class="sub">Инструкции с исходниками и PDF</span>
      ${(window.MEMO_LINKS || []).map((m) => `<a class="card" href="${esc(m.url)}" target="_blank"><span class="title">${esc(m.title)}</span><span class="sub">${esc(m.sub)}</span></a>`).join("")}`);
    $app.querySelectorAll("a.card").forEach((a) => (a.onclick = (e) => { e.preventDefault(); openLink(a.href); }));
  }

  // ---------- маршруты ----------
  async function route() {
    const h = location.hash.replace(/^#/, "") || "objects";
    const m = h.match(/^o\/([0-9a-f]{12})(?:\/(\w+))?/);
    try {
      if (h === "objects") return await objects();
      if (h === "new") return await newObject();
      if (h === "memo") return memo();
      if (m && !m[2]) return await firstDay(m[1]);
      if (m && m[2] === "data") return await dataScreen(m[1]);
      if (m && m[2] === "contracts") return await contractsScreen(m[1]);
      if (m && m[2] === "ahch") return await ahchScreen(m[1]);
      if (m && m[2] === "dvornik") return await dvornikScreen(m[1]);
      await objects();
    } catch (e) { fail(e); }
  }
  window.addEventListener("hashchange", route);
  window.MEMO_LINKS = window.MEMO_LINKS || [
    { title: "Памятка открытия — все инструкции", sub: "МК, ЯК, ЛМК, приём, спецодежда, дворник, покупюрник", url: "https://claude.ai/artifact/N5bsUNL7yrZvr75TMv3gBN" },
  ];
  route();
})();
