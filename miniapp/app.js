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
    const t = [["prep", "Подготовка", `#o/${id}`], ["walk", "Обход", `#o/${id}/walk/1`], ["letter", "Письмо", `#o/${id}/letter/first`], ["data", "Данные", `#o/${id}/data`], ["instr", "Инструкции", `#o/${id}/instr`]];
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

  // ---------- обход: общие куски ----------
  const ZONES = ["Фасад", "Входная группа", "Тамбур", "Торговый зал", "Касса", "Стеллажка", "Пекарня", "Кофестанция",
    "Санузел", "Кабинет", "Склад", "Разгрузка", "Агрегатная", "Конденсаторная опора"];
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
            ${ref.length ? ref.map((r) => `<a class="who" href="#o/${id}/r/${r.id}" title="${esc(r.author)}">${esc(initials(r.author))}</a>`).join("") : ch ? `<span class="who ok" title="${esc(ch.by)}">${esc(initials(ch.by))}</span>` : ""}
            <button class="addr" data-add="${k}" data-zone="${esc(z.zone)}" data-text="${esc(t)}" aria-label="Замечание по пункту">+!</button></div>`;
        }).join("")}
        ${zrs.map((r) => `<a class="it rem" href="#o/${id}/r/${r.id}"><span class="mark bad">!</span><span class="txt">${esc(r.text)}</span><span class="who">${esc(initials(r.author_name))}</span></a>`).join("")}
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
      <span class="sub">Касание пункта — «в порядке» ✓. «+!» — замечание по пункту. Непроверенные подсвечены.</span>
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
    render(`<div class="note"><b>Замерьте проходы рулеткой</b> по зелёным цифрам на плане. Допуск ±15 см.</div>
      <div class="card" style="gap:0"><div class="mrow head"><span>ТОЧКА</span><span></span><span>ПЛАН, см</span><span>ФАКТ, см</span></div>
        ${ms.map((m, i) => { const d = m.fact !== "" && m.fact != null && m.plan ? +m.fact - +m.plan : null; const bad = d !== null && Math.abs(d) > 15;
          return `<div class="mrow"><span class="pt ${d === null ? "" : bad ? "bad" : "ok"}">${i + 1}</span>
            <span class="${bad ? "badt" : d === null ? "sub" : "okt"}">${d === null ? "не замерено" : bad ? `${d > 0 ? "+" : ""}${d} · <a href="#" data-mrem="${i}">в замечание →</a>` : "✓ в допуске"}</span>
            <input inputmode="numeric" data-m="${i}" data-f="plan" value="${m.plan ?? ""}" placeholder="—"><input inputmode="numeric" data-m="${i}" data-f="fact" value="${m.fact ?? ""}" placeholder="—"></div>`; }).join("")}
        <button class="small ghost" id="addm" style="margin-top:8px">+ точка</button></div>
      <div class="card" style="flex-direction:row;align-items:center;justify-content:space-between"><span><b>Световой план · зал</b><br><span class="sub">светильников по плану / по факту</span></span>
        <span class="row" style="gap:6px"><input class="num" inputmode="numeric" id="lp" value="${light.plan ?? ""}" placeholder="план"><input class="num" inputmode="numeric" id="lf" value="${light.fact ?? ""}" placeholder="факт"></span></div>
      <div class="row sub"><b style="color:var(--fg)">Оборудование: ${s.done} из ${s.total}</b></div>
      ${zonesHtml(id, 2, "s2", C.stage2.map((z) => z.key === "e3" && +(C.survey.coffee || 1) === 2 ? { ...z, title: "Кофестанция · 2 модуля" } : z), C, rs)}
      <a class="btn main" href="#o/${id}/walk/3">Дальше: этап 3 — наличие</a>
      ${fab(`#o/${id}/rnew/2/7`)}`);
    bindZones(id, 2, C, () => stage2(id));
    const saveM = async () => { await api("PUT", `/api/objects/${id}/extras`, { measures: ms }); };
    $app.querySelectorAll("[data-m]").forEach((inp) => (inp.onchange = async () => { ms[inp.dataset.m][inp.dataset.f] = inp.value.trim(); await saveM(); stage2(id); }));
    document.getElementById("addm").onclick = async () => { ms.push({ plan: "", fact: "" }); await saveM(); stage2(id); };
    $app.querySelectorAll("[data-mrem]").forEach((a) => (a.onclick = (e) => {
      e.preventDefault(); const m = ms[a.dataset.mrem];
      try { sessionStorage.setItem("newRemark", JSON.stringify({ zone: "Стеллажка", section: "equip", text: `Проход у точки ${+a.dataset.mrem + 1}: по плану ${m.plan} см, по факту ${m.fact} см — привести в соответствие с планировкой` })); } catch (_) {}
      location.hash = `#o/${id}/rnew/2/5`;
    }));
    const saveL = async () => api("PUT", `/api/objects/${id}/extras`, { light: { plan: document.getElementById("lp").value, fact: document.getElementById("lf").value } });
    document.getElementById("lp").onchange = saveL; document.getElementById("lf").onchange = saveL;
  }

  // ---------- этап 3: недовозы, статусы, батареи, фото ----------
  const LISTS = { mto: "МТО", hoz: "Хоз", coffee: "Кофе" };
  let S3 = { tab: "mto", q: "", onlyMiss: false };
  async function stage3(id) {
    const [o, N, C] = await Promise.all([api("GET", `/api/objects/${id}`), api("GET", `/api/objects/${id}/norms`), api("GET", `/api/objects/${id}/checklists`)]);
    const cnt = (l) => (N.shortages[l] || []).length;
    walkTop(o, id, 3);
    const tabsH = `<div class="chips">${Object.entries(LISTS).map(([k, n]) => `<button class="chipb ${S3.tab === k ? "on" : ""}" data-tab="${k}">${n} · ${cnt(k)}</button>`).join("")}
      <button class="chipb ${S3.tab === "st" ? "on" : ""}" data-tab="st">Статусы ●</button><button class="chipb ${S3.tab === "more" ? "on" : ""}" data-tab="more">Батареи и фото</button></div>`;
    let body = "";
    if (LISTS[S3.tab]) {
      const got = N.delivery[S3.tab] || {};
      let rows = N.norms[S3.tab];
      if (S3.q) rows = rows.filter((x) => (x.n + ". " + x.name).toLowerCase().includes(S3.q.toLowerCase()));
      if (S3.onlyMiss) rows = rows.filter((x) => x.norm !== null && (+got[x.n] || 0) < x.norm);
      body = `${N.survey_missing.length && S3.tab === "mto" ? `<a class="card warnc" href="#o/${id}/survey"><b>Нет данных опроса:</b> ${esc(N.survey_missing.join(", "))} — нормы по этим позициям не посчитаны</a>` : ""}
        <input id="q" placeholder="Поиск: сетка, ограничитель, 76…" value="${esc(S3.q)}">
        <div class="row"><label class="tick" style="font-weight:500;font-size:14px"><input type="checkbox" id="om" ${S3.onlyMiss ? "checked" : ""}> Только недовоз</label>
          <span class="btns"><button class="small" id="all1">Всё пришло</button><button class="small ghost" id="all0">Сбросить</button></span></div>
        <div class="card" style="gap:0;padding:4px 14px">${rows.map((x) => {
          const have = +got[x.n] || 0, miss = x.norm === null ? null : Math.max(0, x.norm - have);
          return `<div class="drow ${miss ? "miss" : miss === 0 ? "full" : ""}">
            <input type="checkbox" data-full="${x.n}" ${miss === 0 ? "checked" : ""} ${x.norm === null ? "disabled" : ""} aria-label="Пришло полностью">
            <span class="t"><b>${x.n}. ${esc(x.name)}</b><span>${x.norm === null ? "норма — по опросу" : `норма ${x.norm}${x.note ? " (" + esc(x.note) + ")" : ""} · ${miss ? `<span style="color:var(--warn);font-weight:600">недовоз ${miss}</span>` : "всё на месте"}`}</span></span>
            ${x.norm === null ? "" : stepper(have, `data-n="${x.n}" data-norm="${x.norm}"`)}</div>`; }).join("") || `<div class="empty">Ничего не найдено</div>`}</div>
        <span class="sub">Галочка — пришло полностью. Если пришло частично — укажите сколько, недовоз посчитается сам.</span>`;
    } else if (S3.tab === "st") {
      const st = C.state || {};
      body = `<span class="sub">Зелёным — в порядке, оранжевым — критично исправить. «Нет» — пункт не актуален для помещения, в письмо не идёт.</span>
        ${C.statuses.filter((x) => !x.needs || C.survey[x.needs]).map((x) => { const cur = st[x.key] || {}, state = cur.state || "ok";
          return `<div class="card stc ${state}" data-st="${x.key}"><textarea rows="1" data-stt="${x.key}" placeholder="${esc(state === "bad" ? x.bad : x.ok)}">${esc(cur.text || (state === "bad" ? x.bad : x.ok))}</textarea>
          <div class="seg">${[["ok", "В порядке"], ["bad", "Исправить"], ["off", "Нет"]].map(([v, n]) => `<button data-sv="${v}" class="${state === v ? "on" : ""}">${n}</button>`).join("")}</div></div>`; }).join("")}`;
    } else {
      const ex = C.extras || {};
      const bat = ex.batteries || [];
      const albums = ex.albums || {}, ac = ex.album_count || {};
      const m2 = ex.module2 || {};
      body = `<div class="card"><span class="title">Батареи и насосы</span>
          <div class="btns">${bat.map((g, i) => `<span class="chip info">${g.count} × ${g.sections} секц. <a href="#" data-delb="${i}" style="text-decoration:none">✕</a></span>`).join("")}</div>
          <div class="row"><input class="num" inputmode="numeric" id="bc" placeholder="кол-во"><span>×</span><input class="num" inputmode="numeric" id="bs" placeholder="секций"><button class="small" id="addb">+ группа</button></div>
          <span class="sub">В письмо уйдёт: ● КОЛИЧЕСТВО БАТАРЕЙ: ${esc(bat.map((g) => `${g.count}(${g.sections} СЕКЦ.)`).join("+") || "—")}</span>
          <div class="row"><span>Насосов (сололифтов)</span>${stepper(ex.pumps ?? 0, 'id="pumps"')}</div></div>
        <div class="card"><span class="title">Высоты</span><div class="grid2">
          <label class="f">Проём разгрузки, м<input id="hu" inputmode="decimal" value="${esc(ex.height_unloading || "")}" placeholder="2,38"></label>
          <label class="f">Пандус, м<input id="hr" inputmode="decimal" value="${esc(ex.height_ramp || "")}" placeholder="2,38"></label></div></div>
        <div class="card"><span class="title">Обязательные фото</span><span class="sub">Фото уходят на Яндекс Диск, ссылка на альбом сама встаёт в письмо</span>
          ${C.albums.map(([k, t]) => `<div class="row"><span><b style="font-size:14px">${esc(t)}</b><br><span class="sub">${albums[k] ? `фото: ${ac[k] || 1} · <a href="${esc(albums[k])}">открыть</a>` : "нет фото"}</span></span>
            <label class="btn small">📷<input type="file" accept="image/*" multiple hidden data-album="${k}"></label></div>`).join("")}</div>
        ${+(C.survey.coffee || 1) === 2 ? `<div class="card"><span class="title">Кофестанция, 2-й модуль</span><span class="sub">Отметьте, что уже есть — остальное уйдёт в «К ДОВОЗУ»</span>
          ${C.module2.deliver.concat(C.module2.have).map((x) => `<label class="tick" style="font-weight:500"><input type="checkbox" data-m2="${esc(x)}" ${m2[x] ?? C.module2.have.includes(x) ? "checked" : ""}> ${esc(x)}</label>`).join("")}</div>` : ""}
        <div class="card"><span class="title">Лист готовности (АХЧ)</span><span class="sub">Ссылка на скан — для первого письма</span><input id="ahs" value="${esc(ex.ahch_scan || "")}" placeholder="https://disk.yandex.ru/…"></div>`;
    }
    render(tabsH + body + `<a class="btn main" href="#o/${id}/letter/first">К письму →</a>`);
    $app.querySelectorAll("[data-tab]").forEach((b) => (b.onclick = () => { S3.tab = b.dataset.tab; stage3(id); }));
    const q = document.getElementById("q"); if (q) q.oninput = () => { S3.q = q.value; clearTimeout(q.t); q.t = setTimeout(() => stage3(id).then(() => { const x = document.getElementById("q"); x.focus(); x.setSelectionRange(99, 99); }), 400); };
    const om = document.getElementById("om"); if (om) om.onchange = () => { S3.onlyMiss = om.checked; stage3(id); };
    const setAll = async (v) => { await api("PUT", `/api/objects/${id}/delivery`, { list: S3.tab, all: v }); stage3(id); };
    if (document.getElementById("all1")) { document.getElementById("all1").onclick = () => setAll(true); document.getElementById("all0").onclick = () => setAll(false); }
    $app.querySelectorAll("[data-full]").forEach((c) => (c.onchange = async () => {
      const row = c.closest(".drow"), st = row.querySelector(".stepper");
      await api("PUT", `/api/objects/${id}/delivery`, { list: S3.tab, n: c.dataset.full, have: c.checked ? +st.dataset.norm : 0 }); stage3(id);
    }));
    $app.querySelectorAll(".stepper[data-n]").forEach((st) => st.querySelectorAll("button").forEach((b) => (b.onclick = async () => {
      const v = Math.max(0, +st.querySelector("b").textContent + +b.dataset.d); st.querySelector("b").textContent = v;
      clearTimeout(st.t); st.t = setTimeout(async () => { await api("PUT", `/api/objects/${id}/delivery`, { list: S3.tab, n: st.dataset.n, have: v }); stage3(id); }, 600);
    })));
    $app.querySelectorAll("[data-st]").forEach((card) => {
      const key = card.dataset.st, ta = card.querySelector("textarea");
      const fit = () => { ta.style.height = "auto"; ta.style.height = ta.scrollHeight + "px"; }; fit();
      ta.oninput = fit; ta.onchange = () => api("PUT", `/api/objects/${id}/statuses`, { key, text: ta.value });
      card.querySelectorAll("[data-sv]").forEach((b) => (b.onclick = async () => { await api("PUT", `/api/objects/${id}/statuses`, { key, state: b.dataset.sv, text: "" }); stage3(id); }));
    });
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
      document.getElementById("ahs").onchange = (e) => api("PUT", `/api/objects/${id}/extras`, { ahch_scan: e.target.value.trim() });
      $app.querySelectorAll("[data-m2]").forEach((c) => (c.onchange = async () => { const m = { ...(ex.module2 || {}) }; m[c.dataset.m2] = c.checked; ex.module2 = m; await api("PUT", `/api/objects/${id}/extras`, { module2: m }); }));
      $app.querySelectorAll("[data-album]").forEach((inp) => (inp.onchange = async () => {
        for (const f of inp.files) { try { toast("Загружаю на Диск…"); await api("POST", `/api/objects/${id}/album/${inp.dataset.album}`, { image_b64: await shrink(f) }); } catch (e) { toast(e.message); } }
        toast("Фото на Диске"); stage3(id);
      }));
    }
  }

  // ---------- опрос перед приёмкой ----------
  async function surveyScreen(id) {
    const [o, N] = await Promise.all([api("GET", `/api/objects/${id}`), api("GET", `/api/objects/${id}/norms`)]);
    const s = N.survey;
    const mto = Object.fromEntries(N.norms.mto.map((x) => [x.n, x.norm]));
    top({ back: [`#o/${id}/walk/1`, "Обход"], cap: objLine(o), title: "Опрос перед приёмкой", extra: `<span class="sub">От ответов считаются нормы недовоза и пункты письма</span>` });
    const num = (k, t, sub) => `<div class="row" style="padding:8px 0;border-top:1px solid var(--line2)"><span><b style="font-weight:500">${t}</b><br><span class="sub">${sub}</span></span>${stepper(s[k] ?? 0, `data-k="${k}"`)}</div>`;
    const tog = (k, t) => `<label class="row" style="padding:10px 0;border-top:1px solid var(--line2)"><span>${t}</span><input type="checkbox" data-b="${k}" ${s[k] ? "checked" : ""} style="width:22px;height:22px;accent-color:var(--accent)"></label>`;
    render(`<div class="card"><span class="title" style="font-size:14px">Кофемашин</span>${segHtml("coffee", ["1 · обычная КС", "2 · двойная КС"], +s.coffee === 2 ? "2 · двойная КС" : "1 · обычная КС")}</div>
      <div class="card" style="gap:0">${num("grids", "Сеток 250×1600", "по плану")}${num("ends", "Торцов", "ограничители 500×60 — по 11")}${num("superstructures", "Суперструктур", "сетки 1100×500 — по 2")}</div>
      <div class="card" style="gap:0">${tog("fresh", "Фреш-полка и кулинария")}${tog("ramp", "Пандус разгрузки")}${tog("entrance_light", "Подсветка входной группы")}${tog("fire_cabinet", "Пожарный шкаф")}</div>
      <div class="card" style="background:var(--accent-soft);border:0"><b style="font-size:13px;color:var(--link)">Нормы пересчитаны</b>
        <span class="sub" style="color:var(--fg)">25. Сетка 250×1600 — ${mto[25] ?? "?"}<br>26. Сетка 1100×500 — ${mto[26] ?? "?"}<br>28. Ограничитель 500×60 — ${mto[28] ?? "?"}<br>76. Корзина для белья 40 л — ${mto[76]}<br>Расходники кофе — набор «${+s.coffee === 2 ? "двойная КС" : "одна КС"}»</span></div>
      <div class="bottom"><a class="btn main" href="#o/${id}/walk/1">Начать обход</a></div>`);
    const save = async (patch) => { await api("PUT", `/api/objects/${id}/survey`, patch); surveyScreen(id); };
    bindSeg("coffee", (v) => save({ coffee: v.startsWith("2") ? 2 : 1 }));
    $app.querySelectorAll(".stepper[data-k]").forEach((st) => st.querySelectorAll("button").forEach((b) => (b.onclick = () => {
      const v = Math.max(0, +st.querySelector("b").textContent + +b.dataset.d); st.querySelector("b").textContent = v;
      clearTimeout(st.t); st.t = setTimeout(() => save({ [st.dataset.k]: v }), 500);
    })));
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
        <div class="btns">${r.status === "open" ? `<button class="small" data-st="fixed">Исправлено</button>` : ""}<button class="small main" data-st="accepted">✓ Принято</button></div>
        <details><summary class="sub" style="cursor:pointer">+ комментарий из ветки</summary>
          <div style="display:flex;flex-direction:column;gap:6px;margin-top:6px"><select data-ca><option value="">Прогресс / новый срок — оранжевым</option>${COMMENT_AUTHORS.map((a) => `<option>${a}</option>`).join("")}${o.coordinator.name ? `<option>${esc(o.coordinator.name)}</option>` : ""}</select>
          <textarea rows="2" data-ct placeholder="(сегодня сделают)"></textarea><button class="small" data-cadd>Добавить</button></div></details></div>`).join("") || `<div class="empty">Открытых пунктов нет</div>`}
      <label class="tick" style="font-weight:500;font-size:14px"><input type="checkbox" id="noch" ${ex.nochange ? "checked" : ""}> За сутки ничего не изменилось (оранжевая строка «Замечания по строительной части»)</label>` : "";
    render(`${warn.length ? `<div class="card warnc"><b>Проверьте перед отправкой</b><span class="sub">${esc(warn.join(" · "))}</span></div>` : ""}
      ${editor}
      <div class="group">${mode === "first" ? "Письмо в вёрстке шаблона" : "Апдейт — предпросмотр"}</div>
      <div class="paper" id="paper">${L.html_app}</div>
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
    $app.querySelectorAll("#paper [data-rid]").forEach((el) => (el.onclick = () => (location.hash = `#o/${id}/r/${el.dataset.rid}`)));
    if (mode === "update") {
      document.getElementById("zhy").onclick = async () => { await api("PUT", `/api/objects/${id}/extras`, { zh_ok: today }); letterScreen(id, mode); };
      document.getElementById("zhn").onclick = async () => { await api("PUT", `/api/objects/${id}/extras`, { zh_ok: "" }); letterScreen(id, mode); };
      document.getElementById("noch").onchange = async (e) => { await api("PUT", `/api/objects/${id}/extras`, { nochange: e.target.checked }); letterScreen(id, mode); };
      $app.querySelectorAll(".upd").forEach((card) => {
        const rid = card.dataset.rid;
        card.querySelectorAll("[data-st]").forEach((b) => (b.onclick = async () => { try { await api("POST", `/api/objects/${id}/remarks/${rid}/status`, { status: b.dataset.st }); letterScreen(id, mode); } catch (e) { toast(e.message); } }));
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
    const back = `#o/${id}/walk/${r.stage || 1}`;
    const opt = (sel) => people.map((p) => `<option value="${esc(p.name)}" data-e="${esc(p.email)}" ${p.name === sel ? "selected" : ""}>${esc(p.name)} — ${esc(p.role)}</option>`).join("");
    const iso = (d) => d.toISOString().slice(0, 10), td = new Date(), tm = new Date(td.getTime() + 864e5);
    top({ back: [back, "Обход"], cap: objLine(o), title: rid ? `Замечание №${r.n}` : "Новое замечание" });
    render(`${segHtml("sec", ["Стройка", "Оборудование"], r.section === "equip" ? "Оборудование" : "Стройка")}
      <label class="f">Зона<select id="zone">${ZONES.map((z) => `<option ${z === r.zone ? "selected" : ""}>${z}</option>`).join("")}</select></label>
      ${pre.hint ? `<div class="note">Пункт чек-листа: ${esc(pre.hint)}</div>` : ""}
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
      if (m && m[2] === "survey") return await surveyScreen(m[1]);
      if (m && m[2] === "instr") return await instrScreen(m[1]);
      if (m && m[2] === "contracts") return await contractsScreen(m[1]);
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
  window.addEventListener("hashchange", route);
  route();
})();
