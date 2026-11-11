// Puri buyurtmalar bazasi: Google Sheets → Kengaytmalar → Apps Script ga qo'yiladi.
// KEY o'rniga Cloudflare'dagi SETUP_KEY yoziladi.
const KEY = "SETUP_KEY_SHU_YERGA";
const HEAD = ["Sana", "№", "Filial", "Turi", "Taomlar", "Jami (so'm)", "To'lov", "Holat", "Mijoz", "Telefon", "Manzil", "Izoh", "Telegram"];

function doPost(e) {
  const d = JSON.parse(e.postData.contents);
  if (d.key !== KEY) return out({ ok: false });
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  if (sh.getLastRow() === 0) { sh.appendRow(HEAD); sh.setFrozenRows(1); sh.getRange(1, 1, 1, HEAD.length).setFontWeight("bold"); }
  if (d.action === "add") {
    sh.appendRow([d.date, d.number, d.branch, d.type, d.items, d.total, d.pay, d.status, d.name, "'" + d.phone, d.address, d.note, d.telegram]);
  } else if (d.action === "paid") {
    const nums = sh.getRange(1, 2, sh.getLastRow(), 1).getValues();
    for (let i = nums.length - 1; i >= 0; i--) {
      if (String(nums[i][0]) === String(d.number)) { sh.getRange(i + 1, 8).setValue(d.status); break; }
    }
  }
  return out({ ok: true });
}
const out = o => ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
