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
  function toast(t) { const el = document.getElementById("toast"); el.textContent = t; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => (el.hidden = true), 2400); }
  async function copy(t) {
    try { await navigator.clipboard.writeText(t); toast("Скопировано"); }
    catch (e) { const ta = document.createElement("textarea"); ta.value = t; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); toast("Скопировано"); } catch (_) { toast("Выделите текст и скопируйте"); } ta.remove(); }
  }
  const absUrl = (u) => new URL(u, location.href).href;
  /** Внешние ссылки, файлы, почта и звонки. В Telegram mailto:/tel: идут через go.html (в браузере телефона они открывают почту/звонилку). */
  function go(u) {
    if (/^(mailto|tel):/i.test(u)) {
      if (inTg) tg.openLink(absUrl("go.html") + "#" + encodeURIComponent(u)); else location.href = u;
      return;
    }
    if (inTg) tg.openLink(absUrl(u)); else window.open(absUrl(u), "_blank");
  }
  document.addEventListener("click", (e) => {
    const a = e.target.closest("a[href]");
    if (!a) return;
    const h = a.getAttribute("href");
    if (!h || h.startsWith("#") || h.startsWith("javascript")) return;
    e.preventDefault(); go(h);
  });

  function top(o) {
    // o: {back:[href,text], cap, title, right, tabs:[id,active], extra}
    $top.innerHTML = `<div class="in ${o.tabs ? "" : "pad"}">
      ${o.back ? `<a class="back" href="${o.back[0]}">← ${esc(o.back[1])}</a>` : ""}
      ${o.cap ? `<span class="cap">${esc(o.cap)}</span>` : ""}
      <div class="hrow"><h1>${esc(o.title)}</h1>${o.right || ""}</div>
      ${o.extra || ""}
      ${o.tabs ? tabs(o.tabs[0], o.tabs[1]) : ""}</div>`;
  }
  function tabs(id, on) {
    const t = [["prep", "Подготовка", `#o/${id}`], ["walk", "Обход", `#o/${id}/walk/1`], ["data", "Данные", `#o/${id}/data`], ["instr", "Инструкции", `#o/${id}/instr`]];
    return `<nav class="tabs">${t.map(([k, n, h]) => `<a href="${h}" class="${k === on ? "on" : ""}">${n}</a>`).join("")}</nav>`;
  }
  const objLine = (o) => `${o.code}${o.city ? " · " + o.city : ""}${o.address ? ", " + o.address : ""}`;
  function render(html) { $app.innerHTML = html; window.scrollTo(0, 0); }
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
      <label class="f">Открытие<input type="date" name="open_date" value="${o.open_date || ""}"></label></div>
      <label class="f">День заказа размена, печати, доверенности<input type="date" name="razmen_date" value="${(o.flags || {}).razmen_date || ""}"></label>
      <label class="f">Почта магазина<input name="store_email" type="email" value="${esc(o.store_email)}" placeholder="PR22@ya-retail.ru"></label>
      <datalist id="dl-cities">${(d.cities || []).map((c) => `<option value="${esc(c)}">`).join("")}</datalist></div>`;
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
      <div class="card"><span class="title">Люди объекта</span>${personBlock("director", {}, d, {})}</div>
      <div class="bottom"><button class="main" id="save">Создать объект</button></div>`);
    bindSeg("okrug"); bindStoreHint(); bindPeople(d);
    document.getElementById("save").onclick = async () => {
      const f = readForm(); if (!f.code) return toast("Укажите код магазина");
      try { const o = await api("POST", "/api/objects", f); toast("Объект создан"); location.hash = `#o/${o.id}/data`; } catch (e) { toast(e.message); }
    };
  }

  async function dataScreen(id) {
    const [o, d] = await Promise.all([api("GET", `/api/objects/${id}`), directory()]);
    top({ back: ["#objects", "Объекты"], cap: objLine(o), title: "Данные объекта", tabs: [id, "data"] });
    const keys = ["director", "coordinator", "dev_manager"].concat(o.okrug === "ЦФО" ? ["mops_contractor"] : []);
    render(`${o.missing_people.length ? `<div class="card warnc"><b>Не заполнено: ${o.missing_people.length}</b><span class="sub">${esc(o.missing_people.join(", "))}</span></div>` : ""}
      ${storeCard(o, d)}
      <div class="card"><span class="title">Люди объекта</span><span class="sub">Подсказки — из справочника; ответственного выбираете вы</span>
        ${keys.map((k) => personBlock(k, o[k] || {}, d, o)).join("")}</div>
      <label class="card tick"><input type="checkbox" id="dv" ${o.flags.dvornik_hired ? "checked" : ""}> Дворник оформлен — напоминать про акт в конце месяца</label>
      <div class="card" style="background:var(--accent-soft);border:0"><span class="title" style="font-size:14px">Региональные — ${esc(o.okrug)}</span><span class="sub">${REGIONAL[o.okrug] || ""}</span></div>
      <button id="vcf">Контакты объекта в чат (.vcf)</button>
      <div class="bottom"><button class="main" id="save">Сохранить</button></div>`);
    bindSeg("okrug"); bindStoreHint(); bindPeople(d);
    document.getElementById("save").onclick = async () => {
      try { await api("PUT", `/api/objects/${id}`, { ...readForm(), dvornik_hired: document.getElementById("dv").checked }); DIR = null; toast("Сохранено"); location.hash = `#o/${id}`; } catch (e) { toast(e.message); }
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
    // 1 — размен: доступ к кассе отдельной галкой (на неё смотрят напоминания бота)
    before(1, `<label class="done"><input type="checkbox" data-k="cash"> Доступ к кассе получен</label>`);
    // 3 — кнопки «На печать» пока нет
    if (body(3)) body(3).querySelectorAll(".note").forEach((x) => x.remove());
    // 14 — договоры: статус и экран договоров вместо шаблона
    const c = o.contracts || {}, got = Object.values(c).filter((x) => x.status === "received").length;
    const tpl = wrap.querySelector("#dogTpl"); if (tpl) { const bb = tpl.nextElementSibling; tpl.remove(); if (bb && bb.classList.contains("btns")) bb.remove(); }
    before(14, `<div class="row"><span class="chip ${got === 4 ? "ok" : "warn"}">получено ${got} из 4</span><a class="btn main" href="#o/${id}/contracts">Договоры и запрос</a></div>`);
    // 15 — АХЧ в приложении
    const ah = body(15) && body(15).querySelector('a[href*="instr/ahch"]'); if (ah) { ah.setAttribute("href", `#o/${id}/ahch`); ah.textContent = "Собрать заявку"; }
    // 16 — МОПы: контакт подрядчика в данных
    if (body(16)) before(16, `<div class="btns"><a class="btn" href="#o/${id}/data">Контакт подрядчика</a></div>`);
    // 17 — дворник: объявление и вкладыш с данными объекта
    const dv = body(17) && body(17).querySelector(".btns"); if (dv) dv.insertAdjacentHTML("afterbegin", `<a class="btn main" href="#o/${id}/dvornik">Объявление и конверт</a>`);
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
    render(wrap.innerHTML);
    const live = [...$app.querySelectorAll("details.item")];
    const upd = () => { const n = live.filter((d) => d.dataset.done === "1").length; document.getElementById("prog").textContent = `${n} из ${live.length}`; document.getElementById("barI").style.width = (n / live.length) * 100 + "%"; };
    $app.querySelectorAll("input[data-k]").forEach((cb) => (cb.onchange = async () => {
      const dt = cb.closest("details");
      if (cb.dataset.k.startsWith("m")) { dt.dataset.done = cb.checked ? "1" : "0"; upd(); }
      try { await api("POST", `/api/objects/${id}/firstday/${cb.dataset.k}`, { done: cb.checked }); } catch (e) { toast(e.message); }
    }));
    $app.querySelectorAll("[data-copy]").forEach((b) => (b.onclick = () => copy(document.getElementById(b.dataset.copy).textContent)));
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
    ["Касса", [["Покупюрник и кассовая дисциплина", "СФО/УФО от 01.07.2026 · ЦФО от 02.07.2025", MEMO + "instr/pokup/pokupyurnik.html"]]],
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
  async function printToChat(id, kind) {
    try { await api("POST", `/api/objects/${id}/print/${kind}`); toast("Файл отправлен в чат с ботом"); if (tg) setTimeout(() => tg.close(), 1200); }
    catch (e) { toast(e.message); }
  }

  // ---------- обход ----------
  const ZONES = ["Фасад", "Входная группа", "Тамбур", "Торговый зал", "Касса", "Стеллажка", "Пекарня", "Кофестанция",
    "Санузел", "Кабинет", "Склад", "Разгрузка", "Агрегатная", "Конденсаторная опора"];
  const STAGES = { 1: ["Этап 1", "Ремонт"], 2: ["Этап 2", "Оборудование"], 3: ["Этап 3", "Наличие"] };
  async function walkScreen(id, stage) {
    const [o, zones] = await Promise.all([api("GET", `/api/objects/${id}`), api("GET", `/api/objects/${id}/zones/${stage}`)]);
    const done = zones.filter((z) => z.checked).length;
    top({ back: ["#objects", "Объекты"], cap: objLine(o), title: "Обход", tabs: [id, "walk"],
      extra: `<div class="stages">${[1, 2, 3].map((s) => `<a href="#o/${id}/walk/${s}" class="${s == stage ? "on" : ""}"><b>${STAGES[s][0].toUpperCase()}</b><span>${STAGES[s][1]}</span></a>`).join("")}</div>
        <div class="row sub"><b style="color:var(--fg)">Проверено ${done} из ${zones.length} зон</b>${zones.length - done ? `<span style="color:var(--warn);font-weight:600">${zones.length - done} не проверено</span>` : ""}</div>
        <div class="bar"><i style="width:${(done / zones.length) * 100}%"></i></div>` });
    render(zones.map((z, i) => `<a class="card ${z.checked ? "" : "warnc"}" href="#o/${id}/zone/${stage}/${i}" style="flex-direction:row;align-items:center;justify-content:space-between">
        <span style="display:flex;flex-direction:column;gap:2px"><span class="title">${esc(z.zone)}</span>
        <span class="sub" style="${z.checked ? "" : "color:var(--warn)"}">${z.remarks ? `${z.remarks} замеч.` : "без замечаний"}${z.no_deadline ? ` · без срока: ${z.no_deadline}` : ""}${z.authors.length ? " · " + esc(z.authors.join(", ")) : ""}${z.checked ? "" : " · не проверено"}</span></span>
        ${z.checked ? `<span class="chip ok">✓</span>` : `<span class="chip warn">›</span>`}</a>`).join(""));
  }
  async function zoneScreen(id, stage, zi) {
    const zone = ZONES[zi];
    const [o, zs, all] = await Promise.all([api("GET", `/api/objects/${id}`), api("GET", `/api/objects/${id}/zones/${stage}`), api("GET", `/api/objects/${id}/remarks`)]);
    const z = zs[zi];
    const rs = all.filter((r) => r.zone === zone && String(r.stage) === String(stage));
    top({ back: [`#o/${id}/walk/${stage}`, "Обход · " + STAGES[stage][1]], cap: objLine(o), title: zone });
    render(`${rs.length ? "" : `<div class="empty">Замечаний нет</div>`}
      ${rs.map((r) => `<a class="card ${r.needs_deadline ? "warnc" : ""}" href="#o/${id}/r/${r.id}">
        <span class="title">${r.n}. ${esc(r.text)}</span>
        <span class="sub">${r.section === "equip" ? "оборудование" : "стройка"} · ${r.deadline ? "срок " + fmt(r.deadline) : r.question ? "вопрос" : "срок уточняется у " + esc(r.deadline_ask)} · фото: ${r.photos.length} · ${esc(r.author_name)}</span>
        ${statusChip(r.status)}</a>`).join("")}
      <button id="chk">${z.checked ? "Снять отметку «проверено»" : "Зона проверена ✓"}</button>
      <div class="bottom"><a class="btn main" href="#o/${id}/rnew/${stage}/${zi}">+ Замечание</a></div>`);
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
    const today = new Date(), iso = (d) => d.toISOString().slice(0, 10), tmr = new Date(today.getTime() + 864e5);
    top({ back: [back, r.zone], cap: objLine(o), title: rid ? "Замечание " + r.n : "Новое замечание" });
    render(`${segHtml("sec", ["Стройка", "Оборудование"], r.section === "equip" ? "Оборудование" : "Стройка")}
      <div class="card"><label class="f">ЧТО СДЕЛАТЬ / ГДЕ<textarea id="text" rows="3" placeholder="Утопить грязезащитную решётку в тамбуре">${esc(r.text)}</textarea></label>
      <label class="f">Фраза-ссылка на фото<input id="phrase" value="${esc(r.phrase || "")}" placeholder="по умолчанию — от первого глагола"></label></div>
      <div class="card"><span class="title">Фото · ${r.photos.length}</span>
        ${r.photos.length ? `<div class="btns">${r.photos.map((p, i) => `<a class="chip ok" href="${esc(p.url)}">фото ${i + 1}</a>`).join("")}</div>` : ""}
        ${rid ? `<label class="btn">📷 Добавить фото<input type="file" accept="image/*" capture="environment" id="photo" hidden multiple></label>` : `<span class="sub">Фото — сразу после сохранения</span>`}</div>
      <div class="card warnc"><span class="kicker" style="color:var(--warn)">Срок устранения · обязательно</span>
        <div class="btns"><button class="small ghost" data-day="${iso(today)}">Сегодня</button><button class="small ghost" data-day="${iso(tmr)}">Завтра ${fmtShort(iso(tmr))}</button></div>
        <div class="grid2"><label class="f">Дата<input type="date" id="deadline" value="${r.deadline || ""}"></label>
        <label class="f">или уточняется у<select id="ask"><option value="">—</option>${opt(r.deadline_ask)}</select></label></div>
        ${rid && r.deadline ? `<label class="f">Причина переноса (если меняете дату)<input id="reason"></label>` : ""}
        ${r.deadline_history.length ? `<span class="sub" style="color:var(--warn)">Переносы: ${r.deadline_history.map((h) => fmt(h.date) + (h.reason ? " — " + esc(h.reason) : "")).join("; ")}</span>` : ""}
        <label class="tick" style="font-weight:500;font-size:14px"><input type="checkbox" id="q" ${r.question ? "checked" : ""}>Вопрос на согласование (без срока)</label></div>
      <label class="f">Ответственный (оборудование)<select id="resp"><option value="">—</option>${opt(r.responsible)}</select></label>
      ${rid ? "" : `<label class="tick" style="font-weight:500;font-size:14px"><input type="checkbox" id="fos">Устранено в ходе приёмки</label>`}
      ${rid ? `<div class="card"><span class="title">Статус</span><div class="btns">
        <button class="small" data-st="fixed">Исправлено</button><button class="small" data-st="accepted">Принято</button><button class="small ghost" data-st="open">Открыть снова</button></div>
        ${statusChip(r.status)}</div>
        <div class="card"><span class="title">Комментарии</span>
        ${r.comments.map((c) => `<div class="sub"><b>${esc(c.author)}</b> · ${fmt(c.date)}: ${esc(c.text)}</div>`).join("")}
        <textarea id="cm" rows="2" placeholder="Ответ из ветки, прогресс («сегодня сделают»)"></textarea><button class="small" id="addc">Добавить</button></div>` : ""}
      <div class="bottom"><button class="main" id="save">${rid ? "Сохранить" : "Сохранить и добавить фото"}</button></div>`);
    bindSeg("sec");
    $app.querySelectorAll("[data-day]").forEach((b) => (b.onclick = () => { document.getElementById("deadline").value = b.dataset.day; }));
    const respSel = document.getElementById("resp");
    document.getElementById("save").onclick = async () => {
      const ask = document.getElementById("ask"), rs = respSel.selectedOptions[0];
      const body = { section: segVal("sec") === "Оборудование" ? "equip" : "build", zone: r.zone, stage: r.stage, text: document.getElementById("text").value,
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
        try { toast("Загружаю фото на Диск…"); await api("POST", `/api/objects/${id}/remarks/${rid}/photo`, { image_b64: await shrink(f) }); } catch (e) { toast(e.message); }
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
      if (h === "instr" || h === "memo") return await instrScreen(null);
      if (m && !m[2]) return await prep(m[1]);
      if (m && m[2] === "data") return await dataScreen(m[1]);
      if (m && m[2] === "instr") return await instrScreen(m[1]);
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
  route();
})();
