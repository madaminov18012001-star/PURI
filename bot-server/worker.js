// Puri Telegram bot: Cloudflare Worker.
// Sozlamalar (Settings → Variables and Secrets):
//   BOT_TOKEN       @BotFather bergan token (Secret)
//   ORDERS_CHAT_ID  buyurtmalar tushadigan guruh ID raqami (masalan -1001234567890)
//   WEBAPP_URL      menyu sahifasi manzili (masalan https://.../bot/)
//   SETUP_KEY       /setup uchun istalgan maxfiy so'z (Secret)
//   CLICK_TOKEN     @BotFather → Payments → Click ulanganda beriladigan token (Secret)
//   PAYME_TOKEN     @BotFather → Payments → Payme ulanganda beriladigan token (Secret)

const BRANCHES = {
  Yunusobod: "Yunusobod filiali",
  Chimgan: "Chimgan savdo markazi filiali",
};

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

const menuButton = env => ({ inline_keyboard: [[{ text: "🍽 Menyu va buyurtma", web_app: { url: env.WEBAPP_URL } }]] });

// Bir marta ochiladi: https://<worker>/setup?key=SETUP_KEY
async function setup(url, env) {
  const hook = `${url.origin}/webhook`;
  const out = {
    webhook: await tg(env, "setWebhook", { url: hook, secret_token: env.SETUP_KEY, allowed_updates: ["message", "pre_checkout_query"] }),
    menu: await tg(env, "setChatMenuButton", { menu_button: { type: "web_app", text: "Menyu", web_app: { url: env.WEBAPP_URL } } }),
    commands: await tg(env, "setMyCommands", { commands: [{ command: "start", description: "Boshlash" }, { command: "menu", description: "Menyu" }] }),
  };
  return json(out);
}

async function onUpdate(u, env) {
  if (u.pre_checkout_query) return tg(env, "answerPreCheckoutQuery", { pre_checkout_query_id: u.pre_checkout_query.id, ok: true });
  const m = u.message;
  if (m && m.successful_payment) return onPaid(m, env);
  if (!m || !m.text) return;
  const chat = m.chat.id, text = m.text.trim();
  if (text.startsWith("/id")) return tg(env, "sendMessage", { chat_id: chat, text: `Chat ID: ${chat}` });
  if (m.chat.type !== "private") return;
  if (text.startsWith("/start") || text.startsWith("/menu") || /menyu/i.test(text)) {
    return tg(env, "sendMessage", {
      chat_id: chat, parse_mode: "HTML", reply_markup: menuButton(env),
      text: "Puri'ga xush kelibsiz! 🇬🇪\n\nXinkali, xachapuri va gruzin taomlari.\n📍 Yunusobod | Chimgan savdo markazi\n🕙 Har kuni 10:00–22:00\n\nPastdagi tugmani bosing, menyudan taom tanlang va buyurtma bering 👇",
    });
  }
  return tg(env, "sendMessage", { chat_id: chat, text: "Buyurtma berish uchun menyuni oching 👇", reply_markup: menuButton(env) });
}

// ---------- Buyurtma ----------
const PAY = { click: "Click", payme: "Payme", cash: "Naqd yoki karta (qabul qilishda)" };

async function order(req, env) {
  const { initData, order } = await req.json();
  const user = await checkInitData(initData, env.BOT_TOKEN);
  if (!user) return json({ ok: false, error: "auth" }, 401);

  // Narxlarni menyu faylidan qayta hisoblaymiz (sahifadagi narxga ishonmaymiz)
  const menu = await (await fetch(new URL("menu.json", env.WEBAPP_URL), { cf: { cacheTtl: 300 } })).json();
  const byId = Object.fromEntries(menu.items.map(i => [i.id, i]));
  const lines = []; let total = 0;
  for (const { id, qty } of order.items || []) {
    const it = byId[id], q = Math.min(99, Math.max(0, parseInt(qty) || 0));
    if (!it || !q) continue;
    total += it.price * q;
    lines.push(`• ${esc(it.name)} × ${q} = ${money(it.price * q)}`);
  }
  if (!lines.length) return json({ ok: false, error: "empty" }, 400);

  const pay = PAY[order.pay] ? order.pay : "cash";
  const providerToken = pay === "click" ? env.CLICK_TOKEN : pay === "payme" ? env.PAYME_TOKEN : "";
  if (pay !== "cash" && !providerToken) return json({ ok: false, error: "pay_off" }, 400);

  const delivery = order.type === "delivery";
  const branch = BRANCHES[order.branch] || BRANCHES.Yunusobod;
  const number = String(Date.now()).slice(-6);
  const who = user.username ? `@${user.username}` : `<a href="tg://user?id=${user.id}">${esc(user.first_name || "mijoz")}</a>`;
  const msg = [
    `🧾 <b>Buyurtma №${number}</b>`,
    `${delivery ? "🚗 Yetkazib berish" : "🏃 Olib ketish"} · ${branch}`,
    "",
    ...lines,
    `<b>Jami: ${money(total)}</b>${delivery ? " (yetkazish narxi alohida)" : ""}`,
    `${pay === "cash" ? "💵" : "💳"} To'lov: ${PAY[pay]}`,
    "",
    `👤 ${esc(clip(order.name, 60))} (${who})`,
    `📞 ${esc(clip(order.phone, 30))}`,
    delivery ? `📍 ${esc(clip(order.address, 300))}` : "",
    order.note ? `💬 ${esc(clip(order.note, 300))}` : "",
  ].filter((l, i, a) => l !== "" || a[i - 1] !== "").join("\n").trim();

  if (pay === "cash") {
    const sent = await tg(env, "sendMessage", { chat_id: env.ORDERS_CHAT_ID, text: "🆕 " + msg, parse_mode: "HTML", disable_web_page_preview: true });
    if (!sent.ok) return json({ ok: false, error: "send" }, 502);
    await tg(env, "sendMessage", {
      chat_id: user.id, parse_mode: "HTML",
      text: `✅ <b>Buyurtmangiz qabul qilindi!</b>\n\n${msg}\n\nOperatorimiz tez orada qo'ng'iroq qiladi.`,
    });
    return json({ ok: true, number });
  }

  // Onlayn to'lov: buyurtma mijoz chatiga yoziladi, to'lov o'tgach shu xabar guruhga nusxalanadi
  const draft = await tg(env, "sendMessage", { chat_id: user.id, text: msg, parse_mode: "HTML", disable_web_page_preview: true });
  if (!draft.ok) return json({ ok: false, error: "send" }, 502);
  const inv = await tg(env, "createInvoiceLink", {
    title: `Puri buyurtma №${number}`,
    description: clip(`${lines.length} xil taom, ${branch}.${delivery ? " Yetkazish narxi alohida." : ""}`, 255),
    payload: `${number}:${draft.result.message_id}:${pay}`,
    provider_token: providerToken,
    currency: "UZS",
    prices: [{ label: `Buyurtma №${number}`, amount: total * 100 }],
  });
  if (!inv.ok) return json({ ok: false, error: "invoice" }, 502);
  return json({ ok: true, number, invoice: inv.result });
}

async function onPaid(m, env) {
  const p = m.successful_payment;
  const [number, msgId, pay] = p.invoice_payload.split(":");
  const copy = await tg(env, "copyMessage", { chat_id: env.ORDERS_CHAT_ID, from_chat_id: m.chat.id, message_id: Number(msgId) });
  await tg(env, "sendMessage", {
    chat_id: env.ORDERS_CHAT_ID, parse_mode: "HTML",
    reply_parameters: copy.ok ? { message_id: copy.result.message_id } : undefined,
    text: `🆕✅ <b>№${number} TO'LANDI</b> · ${PAY[pay] || pay} · ${money(p.total_amount / 100)}`,
  });
  await tg(env, "sendMessage", { chat_id: m.chat.id, text: `✅ To'lov qabul qilindi! Buyurtma №${number} tayyorlanmoqda. Operatorimiz tez orada qo'ng'iroq qiladi.` });
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

const money = n => n.toLocaleString("ru-RU").replace(/ |,/g, " ") + " so'm";
const esc = s => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const clip = (s, n) => String(s || "").slice(0, n);
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json" } });
function cors(r) {
  r.headers.set("Access-Control-Allow-Origin", "*");
  r.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  r.headers.set("Access-Control-Allow-Headers", "Content-Type");
  return r;
}
