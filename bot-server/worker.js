// Puri Telegram bot: Cloudflare Worker.
// Sozlamalar (Settings → Variables and Secrets):
//   BOT_TOKEN       @BotFather bergan token (Secret)
//   ORDERS_CHAT_ID  buyurtmalar tushadigan guruh ID raqami (masalan -1001234567890)
//   WEBAPP_URL      menyu sahifasi manzili (masalan https://.../bot/)
//   SETUP_KEY       /setup uchun istalgan maxfiy soʻz (Secret)
//   SHEET_URL       (ixtiyoriy) Google Sheets bazasi uchun Apps Script manzili
//   CLICK_TOKEN     @BotFather → Payments → Click ulanganda beriladigan token (Secret)
//   PAYME_TOKEN     @BotFather → Payments → Payme ulanganda beriladigan token (Secret)

// Filiallar. Manzil ("addr") Timur bergach yoziladi.
const BRANCHES = {
  Yunusobod: { uz: "Yunusobod Gallery savdo markazi", ru: "ТЦ Yunusobod Gallery", addr: { uz: "", ru: "" }, phone: "+998 99 899 69 88" },
  Chimgan: { uz: "Çimgan savdo markazi", ru: "ТЦ Chimgan", addr: { uz: "", ru: "" }, phone: "+998 99 437 95 29" },
};
const branchLine = (b, l) => b[l] + (b.addr[l] ? ` (${b.addr[l]})` : "") + `\n📞 ${b.phone}`;

const TXT = {
  uz: {
    welcome: () => `Puriʼga xuş kelibsiz! 🇬🇪\n\nXinkali, xaçapuri va gruzin taomlari.\n\n📍 ${branchLine(BRANCHES.Yunusobod, "uz")}\n\n📍 ${branchLine(BRANCHES.Chimgan, "uz")}\n\n🕙 Har kuni 10:00–22:00\n\nPastdagi tugmani bosiñ, menyudan taom tanlañ va buyurtma beriñ 👇`,
    open: "🍽 Menyu va buyurtma", menu: "Menyu", other: "Buyurtma beriş uçun menyuni oçiñ 👇",
    accepted: "✅ <b>Buyurtmañiz qabul qilindi!</b>", call: "Operatorimiz tez orada qõnğiroq qiladi.", ask: "Savollar uçun filial telefoni",
    paid: n => `✅ Tõlov qabul qilindi! Buyurtma №${n} tayyorlanmoqda. Operatorimiz tez orada qõnğiroq qiladi.`,
    order: "Buyurtma", total: "Jami", del: "🚗 Yetkazib beriş", pick: "🏃 Olib ketiş", fee: " (yetkaziş narxi alohida)", payw: "Tõlov",
    pay: { click: "Click", payme: "Payme", cash: "Naqd yoki karta (qabul qilişda)" }, sum: "sõm",
  },
  ru: {
    welcome: () => `Добро пожаловать в Puri! 🇬🇪\n\nХинкали, хачапури и блюда грузинской кухни.\n\n📍 ${branchLine(BRANCHES.Yunusobod, "ru")}\n\n📍 ${branchLine(BRANCHES.Chimgan, "ru")}\n\n🕙 Ежедневно 10:00–22:00\n\nНажмите кнопку ниже, выберите блюда в меню и оформите заказ 👇`,
    open: "🍽 Меню и заказ", menu: "Меню", other: "Чтобы сделать заказ, откройте меню 👇",
    accepted: "✅ <b>Ваш заказ принят!</b>", call: "Наш оператор скоро вам позвонит.", ask: "Телефон филиала",
    paid: n => `✅ Оплата получена! Заказ №${n} готовится. Наш оператор скоро вам позвонит.`,
    order: "Заказ", total: "Итого", del: "🚗 Доставка", pick: "🏃 Самовывоз", fee: " (доставка оплачивается отдельно)", payw: "Оплата",
    pay: { click: "Click", payme: "Payme", cash: "Наличные или карта (при получении)" }, sum: "сум",
  },
};
const langOf = u => (u && u.language_code === "ru" ? "ru" : "uz");
const appUrl = (env, l) => { const u = new URL(env.WEBAPP_URL); u.searchParams.set("lang", l); return u.toString(); };
const langRow = [{ text: "🇺🇿 Õzbekça", callback_data: "lang:uz" }, { text: "🇷🇺 Русский", callback_data: "lang:ru" }];

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === "OPTIONS") return cors(new Response(null, { status: 204 }));
    try {
      if (url.pathname === "/order" && req.method === "POST") return cors(await order(req, env));
      if (url.pathname === "/webhook" && req.method === "POST") {
        if (req.headers.get("X-Telegram-Bot-Api-Secret-Token") !== env.SETUP_KEY) return new Response("no", { status: 403 });
        await onUpdate(await req.json(), env);
        return new Response("ok");
      }
      if (url.pathname === "/setup" && url.searchParams.get("key") === env.SETUP_KEY) return setup(url, env);
      return new Response("Puri bot ishlayapti");
    } catch (e) {
      console.log(e.stack || e);
      return cors(json({ ok: false, error: "server" }, 500));
    }
  },
};

// ---------- Telegram API ----------
async function tg(env, method, body) {
  const r = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const j = await r.json();
  if (!j.ok) console.log(method, JSON.stringify(j));
  return j;
}

const startKb = (env, l) => ({ inline_keyboard: [[{ text: TXT[l].open, web_app: { url: appUrl(env, l) } }], langRow] });

// Bir marta ochiladi: https://<worker>/setup?key=SETUP_KEY
async function setup(url, env) {
  const hook = `${url.origin}/webhook`;
  const out = {
    webhook: await tg(env, "setWebhook", { url: hook, secret_token: env.SETUP_KEY, allowed_updates: ["message", "pre_checkout_query", "callback_query"] }),
    menu: await tg(env, "setChatMenuButton", { menu_button: { type: "web_app", text: "Menyu", web_app: { url: appUrl(env, "uz") } } }),
    commands: await tg(env, "setMyCommands", { commands: [{ command: "start", description: "Boşlaş" }, { command: "menu", description: "Menyu" }] }),
    commands_ru: await tg(env, "setMyCommands", { language_code: "ru", commands: [{ command: "start", description: "Начать" }, { command: "menu", description: "Меню" }] }),
  };
  return json(out);
}

async function sendStart(env, chat, l) {
  await tg(env, "setChatMenuButton", { chat_id: chat, menu_button: { type: "web_app", text: TXT[l].menu, web_app: { url: appUrl(env, l) } } });
  return tg(env, "sendMessage", { chat_id: chat, text: TXT[l].welcome(), reply_markup: startKb(env, l) });
}

async function onUpdate(u, env) {
  if (u.pre_checkout_query) return tg(env, "answerPreCheckoutQuery", { pre_checkout_query_id: u.pre_checkout_query.id, ok: true });
  if (u.callback_query) {
    const cq = u.callback_query, l = cq.data === "lang:ru" ? "ru" : "uz";
    await tg(env, "answerCallbackQuery", { callback_query_id: cq.id });
    if (cq.message) await tg(env, "deleteMessage", { chat_id: cq.message.chat.id, message_id: cq.message.message_id });
    return sendStart(env, cq.from.id, l);
  }
  const m = u.message;
  if (m && m.successful_payment) return onPaid(m, env);
  if (!m || !m.text) return;
  const chat = m.chat.id, text = m.text.trim(), l = langOf(m.from);
  if (text.startsWith("/id")) return tg(env, "sendMessage", { chat_id: chat, text: `Chat ID: ${chat}` });
  if (m.chat.type !== "private") return;
  if (text.startsWith("/start") || text.startsWith("/menu") || /menyu|меню/i.test(text)) return sendStart(env, chat, l);
  return tg(env, "sendMessage", { chat_id: chat, text: TXT[l].other, reply_markup: startKb(env, l) });
}

// ---------- Buyurtma ----------
const PAY = TXT.uz.pay;

async function order(req, env) {
  const { initData, order } = await req.json();
  const user = await checkInitData(initData, env.BOT_TOKEN);
  if (!user) return json({ ok: false, error: "auth" }, 401);
  const L = order.lang === "ru" ? "ru" : "uz";

  // Narxlarni menyu faylidan qayta hisoblaymiz (sahifadagi narxga ishonmaymiz)
  const menu = await (await fetch(new URL("menu.json", env.WEBAPP_URL), { cf: { cacheTtl: 300 } })).json();
  const byId = Object.fromEntries(menu.items.map(i => [i.id, i]));
  const picked = [], plain = []; let total = 0;
  for (const { id, qty } of order.items || []) {
    const it = byId[id], q = Math.min(99, Math.max(0, parseInt(qty) || 0));
    if (!it || !q) continue;
    total += it.price * q;
    picked.push([it, q]);
    plain.push(`${it.name} × ${q}`);
  }
  if (!picked.length) return json({ ok: false, error: "empty" }, 400);

  const pay = PAY[order.pay] ? order.pay : "cash";
  const providerToken = pay === "click" ? env.CLICK_TOKEN : pay === "payme" ? env.PAYME_TOKEN : "";
  if (pay !== "cash" && !providerToken) return json({ ok: false, error: "pay_off" }, 400);

  const delivery = order.type === "delivery";
  const br = BRANCHES[order.branch] || BRANCHES.Yunusobod;
  const number = String(Date.now()).slice(-6);
  const who = user.username ? `@${user.username}` : `<a href="tg://user?id=${user.id}">${esc(user.first_name || "mijoz")}</a>`;
  const lines = l => picked.map(([it, q]) => `• ${esc(l === "ru" ? it.ru : it.name)} × ${q} = ${money(it.price * q, l)}`);
  const mk = l => [
    `🧾 <b>${TXT[l].order} №${number}</b>`,
    `${delivery ? TXT[l].del : TXT[l].pick} · ${br[l]}`,
    "",
    ...lines(l),
    `<b>${TXT[l].total}: ${money(total, l)}</b>${delivery ? TXT[l].fee : ""}`,
    `${pay === "cash" ? "💵" : "💳"} ${TXT[l].payw}: ${TXT[l].pay[pay]}`,
    "",
    `👤 ${esc(clip(order.name, 60))} (${who})${L === "ru" ? " 🇷🇺" : ""}`,
    `📞 ${esc(clip(order.phone, 30))}`,
    delivery ? `📍 ${esc(clip(order.address, 300))}` : "",
    order.note ? `💬 ${esc(clip(order.note, 300))}` : "",
  ].filter((x, i, a) => x !== "" || a[i - 1] !== "").join("\n").trim();
  const msg = mk("uz");

  const row = {
    action: "add", number, date: new Date().toLocaleString("ru-RU", { timeZone: "Asia/Tashkent" }),
    branch: br.uz, type: delivery ? "Yetkazib berish" : "Olib ketiş",
    items: plain.join(", "), total, pay: PAY[pay], status: pay === "cash" ? "Yañi" : "Tõlov kutilmoqda",
    name: clip(order.name, 60), phone: clip(order.phone, 30), address: delivery ? clip(order.address, 300) : "",
    note: clip(order.note, 300), telegram: user.username ? "@" + user.username : String(user.id),
  };

  if (pay === "cash") {
    await sheet(env, row);
    const sent = await tg(env, "sendMessage", { chat_id: env.ORDERS_CHAT_ID, text: "🆕 " + msg, parse_mode: "HTML", disable_web_page_preview: true });
    if (!sent.ok) return json({ ok: false, error: "send" }, 502);
    await tg(env, "sendMessage", {
      chat_id: user.id, parse_mode: "HTML",
      text: `${TXT[L].accepted}\n\n${mk(L)}\n\n${TXT[L].call}\n📞 ${TXT[L].ask}: ${br.phone}`,
    });
    return json({ ok: true, number });
  }

  // Onlayn toʻlov: buyurtma mijoz chatiga yoziladi, toʻlov oʻtgach shu xabar guruhga nusxalanadi
  const draft = await tg(env, "sendMessage", { chat_id: user.id, text: mk(L), parse_mode: "HTML", disable_web_page_preview: true });
  if (!draft.ok) return json({ ok: false, error: "send" }, 502);
  const inv = await tg(env, "createInvoiceLink", {
    title: `Puri ${TXT[L].order.toLowerCase()} №${number}`,
    description: clip(`${picked.length} ${L === "ru" ? "поз." : "xil taom"}, ${br[L]}.${delivery ? TXT[L].fee : ""}`, 255),
    payload: `${number}:${draft.result.message_id}:${pay}:${L}`,
    provider_token: providerToken,
    currency: "UZS",
    prices: [{ label: `${TXT[L].order} №${number}`, amount: total * 100 }],
  });
  if (!inv.ok) return json({ ok: false, error: "invoice" }, 502);
  await sheet(env, row);
  return json({ ok: true, number, invoice: inv.result });
}

async function onPaid(m, env) {
  const p = m.successful_payment;
  const [number, msgId, pay, lp] = p.invoice_payload.split(":");
  const L = lp === "ru" ? "ru" : "uz";
  const copy = await tg(env, "copyMessage", { chat_id: env.ORDERS_CHAT_ID, from_chat_id: m.chat.id, message_id: Number(msgId) });
  await tg(env, "sendMessage", {
    chat_id: env.ORDERS_CHAT_ID, parse_mode: "HTML",
    reply_parameters: copy.ok ? { message_id: copy.result.message_id } : undefined,
    text: `🆕✅ <b>№${number} TÕLANDI</b> · ${PAY[pay] || pay} · ${money(p.total_amount / 100)}`,
  });
  await sheet(env, { action: "paid", number, status: `Tõlandi (${PAY[pay] || pay})` });
  await tg(env, "sendMessage", { chat_id: m.chat.id, text: TXT[L].paid(number) });
}

// Google Sheets bazasiga yozish (SHEET_URL boʻlsa). Xato boʻlsa ham buyurtma toʻxtamaydi.
async function sheet(env, data) {
  if (!env.SHEET_URL) return;
  try {
    await fetch(env.SHEET_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: env.SETUP_KEY, ...data }) });
  } catch (e) { console.log("sheet", e); }
}

// Telegram initData imzosini tekshirish: buyurtma haqiqatan bot ichidan kelganini bildiradi
async function checkInitData(initData, token) {
  if (!initData) return null;
  const p = new URLSearchParams(initData);
  const hash = p.get("hash"); p.delete("hash");
  const dcs = [...p.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join("\n");
  const enc = new TextEncoder();
  const k1 = await crypto.subtle.importKey("raw", enc.encode("WebAppData"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const secret = await crypto.subtle.sign("HMAC", k1, enc.encode(token));
  const k2 = await crypto.subtle.importKey("raw", secret, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = [...new Uint8Array(await crypto.subtle.sign("HMAC", k2, enc.encode(dcs)))].map(b => b.toString(16).padStart(2, "0")).join("");
  if (sig !== hash) return null;
  if (Date.now() / 1000 - Number(p.get("auth_date")) > 86400) return null;
  try { return JSON.parse(p.get("user")); } catch { return null; }
}

const money = (n, l = "uz") => n.toLocaleString("ru-RU").replace(/\u00a0|,/g, " ") + " " + TXT[l].sum;
const esc = s => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const clip = (s, n) => String(s || "").slice(0, n);
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json" } });
function cors(r) {
  r.headers.set("Access-Control-Allow-Origin", "*");
  r.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  r.headers.set("Access-Control-Allow-Headers", "Content-Type");
  return r;
}
