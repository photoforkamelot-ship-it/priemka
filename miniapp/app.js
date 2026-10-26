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
      <nav class="tabs"><a href="#o/${o.id}/walk/1" class="${tab === "walk" ? "on" : ""}">Обход</a><a href="#o/${o.id}" class="${tab === "day" ? "on" : ""}">Первый день</a>
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


  // ---------- обход по зонам ----------
  const ZONES = ["Фасад", "Входная группа", "Тамбур", "Торговый зал", "Касса", "Стеллажка", "Пекарня", "Кофестанция",
    "Санузел", "Кабинет", "Склад", "Разгрузка", "Агрегатная", "Конденсаторная опора"];
  const STAGES = { 1: "Этап 1 — ремонт", 2: "Этап 2 — оборудование", 3: "Этап 3 — наличие" };
  async function walkScreen(id, stage) {
    const [o, zones] = await Promise.all([api("GET", `/api/objects/${id}`), api("GET", `/api/objects/${id}/zones/${stage}`)]);
    const left = zones.filter((z) => !z.checked).length;
    render(`${head(o, "walk")}
      <div class="seg">${[1, 2, 3].map((s) => `<button data-s="${s}" class="${s == stage ? "on" : ""}">Этап ${s}</button>`).join("")}</div>
      <span class="sub">${STAGES[stage]} · не проверено зон: ${left}</span>
      ${zones.map((z, i) => `<a class="card ${z.checked ? "" : "warnc"}" href="#o/${id}/zone/${stage}/${i}"><div class="row">
        <span class="title">${esc(z.zone)}</span>
        <span>${z.no_deadline ? `<span class="chip warn">без срока: ${z.no_deadline}</span> ` : ""}${z.remarks ? `<span class="chip bad">${z.remarks}</span>` : ""} ${z.checked ? `<span class="chip ok">проверено</span>` : ""}</span></div>
        ${z.authors.length ? `<span class="sub">${esc(z.authors.join(", "))}</span>` : ""}</a>`).join("")}`);
    $app.querySelectorAll("[data-s]").forEach((b) => (b.onclick = () => (location.hash = `#o/${id}/walk/${b.dataset.s}`)));
  }

  async function zoneScreen(id, stage, zi) {
    const zone = ZONES[zi];
    const [zs, all] = await Promise.all([api("GET", `/api/objects/${id}/zones/${stage}`), api("GET", `/api/objects/${id}/remarks`)]);
    const z = zs[zi];
    const rs = all.filter((r) => r.zone === zone && String(r.stage) === String(stage));
    render(`<a class="back" href="#o/${id}/walk/${stage}">← ${STAGES[stage]}</a><h1>${esc(zone)}</h1>
      ${rs.length ? "" : `<div class="empty">Замечаний нет</div>`}
      ${rs.map((r) => `<a class="card ${r.needs_deadline ? "warnc" : ""}" href="#o/${id}/r/${r.id}">
        <div class="row"><span class="title">${r.n}. ${esc(r.text)}</span></div>
        <span class="sub">${r.section === "equip" ? "оборудование" : "стройка"} · ${r.deadline ? "срок " + fmt(r.deadline) : r.question ? "вопрос" : "срок уточняется у " + esc(r.deadline_ask)} · фото: ${r.photos.length} · ${esc(r.author_name)}</span>
        ${statusChip(r.status)}</a>`).join("")}
      <a class="btn main" href="#o/${id}/rnew/${stage}/${zi}">+ Замечание</a>
      <button id="chk">${z.checked ? "Снять отметку «проверено»" : "Зона проверена"}</button>`);
    document.getElementById("chk").onclick = async () => { await api("POST", `/api/objects/${id}/zones/${stage}`, { zone, checked: !z.checked }); location.hash = `#o/${id}/walk/${stage}`; };
  }
  function statusChip(s) {
    return { open: "", fixed: `<span class="chip warn">исправлено, ждёт подтверждения</span>`, accepted: `<span class="chip ok">принято</span>`, fixed_on_site: `<span class="chip ok">устранено в ходе приёмки</span>` }[s] || "";
  }

  async function remarkForm(id, stage, zi, rid) {
    const [o, people, all] = await Promise.all([api("GET", `/api/objects/${id}`), api("GET", `/api/objects/${id}/people`), rid ? api("GET", `/api/objects/${id}/remarks`) : []]);
    const r = rid ? all.find((x) => x.id === rid) : { section: "build", zone: ZONES[zi], text: "", deadline: "", deadline_ask: "", photos: [], stage, comments: [], deadline_history: [], status: "open" };
    if (!r) throw new Error("замечание не найдено");
    const back = `#o/${id}/zone/${r.stage}/${ZONES.indexOf(r.zone)}`;
    const opt = (sel) => people.map((p) => `<option value="${esc(p.name)}" data-e="${esc(p.email)}" ${p.name === sel ? "selected" : ""}>${esc(p.name)} — ${esc(p.role)}</option>`).join("");
    render(`<a class="back" href="${back}">← ${esc(r.zone)}</a><h1>${rid ? "Замечание " + r.n : "Новое замечание"}</h1>
      <div class="seg" id="sec"><button data-v="build" class="${r.section === "build" ? "on" : ""}">Стройка</button><button data-v="equip" class="${r.section === "equip" ? "on" : ""}">Оборудование</button></div>
      <label class="f">Что сделать / где<textarea id="text" rows="3" placeholder="Утопить грязезащитную решётку в тамбуре">${esc(r.text)}</textarea></label>
      <label class="f">Фраза-ссылка на фото<input id="phrase" value="${esc(r.phrase || "")}" placeholder="по умолчанию — от первого глагола"></label>
      <div class="card"><span class="title">Фото · ${r.photos.length}</span>
        <div class="btns">${r.photos.map((p, i) => `<a class="chip ok" target="_blank" href="${esc(p.url)}">фото ${i + 1}</a>`).join("")}</div>
        ${rid ? `<label class="btn">📷 Добавить фото<input type="file" accept="image/*" capture="environment" id="photo" hidden multiple></label>` : `<span class="sub">Фото — после сохранения</span>`}</div>
      <div class="card"><span class="title">Срок</span>
        <div class="grid2"><label class="f">Дата<input type="date" id="deadline" value="${r.deadline || ""}"></label>
        <label class="f">или уточняется у<select id="ask"><option value="">—</option>${opt(r.deadline_ask)}</select></label></div>
        ${rid && r.deadline ? `<label class="f">Причина переноса (если меняете дату)<input id="reason"></label>` : ""}
        ${r.deadline_history.length ? `<span class="sub" style="color:var(--warn)">Переносы: ${r.deadline_history.map((h) => fmt(h.date) + (h.reason ? " — " + esc(h.reason) : "")).join("; ")}</span>` : ""}
        <label style="display:flex;gap:8px;align-items:center;font-size:14px"><input type="checkbox" id="q" ${r.question ? "checked" : ""} style="width:20px;height:20px">Вопрос на согласование (без срока)</label></div>
      <label class="f" id="respWrap">Ответственный (оборудование)<select id="resp"><option value="">—</option>${opt(r.responsible)}</select></label>
      ${rid ? "" : `<label style="display:flex;gap:8px;align-items:center;font-size:14px"><input type="checkbox" id="fos" style="width:20px;height:20px">Устранено в ходе приёмки</label>`}
      <button class="main" id="save">${rid ? "Сохранить" : "Сохранить и добавить фото"}</button>
      ${rid ? `<div class="card"><span class="title">Статус</span><div class="btns">
        <button class="small" data-st="fixed">Исправлено</button><button class="small" data-st="accepted">Принято</button><button class="small" data-st="open">Открыть снова</button></div>
        ${statusChip(r.status)}</div>
        <div class="card"><span class="title">Комментарии</span>
        ${r.comments.map((c) => `<div class="sub"><b>${esc(c.author)}</b> · ${fmt(c.date)}: ${esc(c.text)}</div>`).join("")}
        <textarea id="cm" rows="2" placeholder="Ответ из ветки, прогресс («сегодня сделают»)"></textarea><button class="small" id="addc">Добавить</button></div>` : ""}`);
    $app.querySelectorAll("#sec button").forEach((b) => (b.onclick = () => { $app.querySelectorAll("#sec button").forEach((x) => x.classList.remove("on")); b.classList.add("on"); }));
    const respSel = document.getElementById("resp");
    document.getElementById("save").onclick = async () => {
      const ask = document.getElementById("ask"), rs = respSel.selectedOptions[0];
      const body = { section: $app.querySelector("#sec .on").dataset.v, zone: r.zone, stage: r.stage, text: document.getElementById("text").value,
        phrase: document.getElementById("phrase").value, deadline: document.getElementById("deadline").value,
        deadline_ask: document.getElementById("deadline").value ? "" : ask.value, question: document.getElementById("q").checked,
        responsible: respSel.value, responsible_email: rs ? rs.dataset.e || "" : "" };
      const rsn = document.getElementById("reason"); if (rsn) body.reason = rsn.value;
      const fos = document.getElementById("fos"); if (fos && fos.checked) body.fixed_on_site = true;
      try {
        const saved = rid ? await api("PUT", `/api/objects/${id}/remarks/${rid}`, body) : await api("POST", `/api/objects/${id}/remarks`, body);
        toast("Сохранено"); location.hash = `#o/${id}/r/${saved.id}`;
      } catch (e) { toast(e.message); }
    };
    const ph = document.getElementById("photo");
    if (ph) ph.onchange = async () => {
      for (const f of ph.files) {
        try { toast("Загружаю фото…"); await api("POST", `/api/objects/${id}/remarks/${rid}/photo`, { image_b64: await shrink(f) }); } catch (e) { toast(e.message); }
      }
      remarkForm(id, stage, zi, rid);
    };
    $app.querySelectorAll("[data-st]").forEach((b) => (b.onclick = async () => { try { await api("POST", `/api/objects/${id}/remarks/${rid}/status`, { status: b.dataset.st }); remarkForm(id, stage, zi, rid); } catch (e) { toast(e.message); } }));
    const addc = document.getElementById("addc");
    if (addc) addc.onclick = async () => { await api("POST", `/api/objects/${id}/remarks/${rid}/comment`, { text: document.getElementById("cm").value }); remarkForm(id, stage, zi, rid); };
  }
  function shrink(file, max = 1600) {
    return new Promise((res, rej) => {
      const img = new Image(); img.onerror = rej;
      img.onload = () => { const k = Math.min(1, max / Math.max(img.width, img.height)); const c = document.createElement("canvas");
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        res(c.toDataURL("image/jpeg", 0.82).split(",")[1]); URL.revokeObjectURL(img.src); };
      img.src = URL.createObjectURL(file);
    });
  }

  // ---------- маршруты ----------
  async function route() {
    const h = location.hash.replace(/^#/, "") || "objects";
    const m = h.match(/^o\/([0-9a-f]{12})(?:\/(\w+))?(?:\/(\w+))?(?:\/(\d+))?/);
    try {
      if (h === "objects") return await objects();
      if (h === "new") return await newObject();
      if (h === "memo") return memo();
      if (m && !m[2]) return await firstDay(m[1]);
      if (m && m[2] === "data") return await dataScreen(m[1]);
      if (m && m[2] === "contracts") return await contractsScreen(m[1]);
      if (m && m[2] === "ahch") return await ahchScreen(m[1]);
      if (m && m[2] === "dvornik") return await dvornikScreen(m[1]);
      if (m && m[2] === "walk") return await walkScreen(m[1], m[3] || 1);
      if (m && m[2] === "zone") return await zoneScreen(m[1], m[3], +m[4]);
      if (m && m[2] === "rnew") return await remarkForm(m[1], +m[3], +m[4], null);
      if (m && m[2] === "r") return await remarkForm(m[1], 1, 0, m[3]);
      await objects();
    } catch (e) { fail(e); }
  }
  window.addEventListener("hashchange", route);
  window.MEMO_LINKS = window.MEMO_LINKS || [
    { title: "Памятка открытия — все инструкции", sub: "МК, ЯК, ЛМК, приём, спецодежда, дворник, покупюрник", url: "https://claude.ai/artifact/N5bsUNL7yrZvr75TMv3gBN" },
  ];
  route();
})();
