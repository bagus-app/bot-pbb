//https://docs.google.com/spreadsheets/d/e/2PACX-1vQFY2Wtm-eAJ72LOHANHlFEQqNBpHi3-NJAXHJOuM6sxNxDnuykY86DuL-pmUnFCX6DDrEWG4EElOF7/pub?gid=0&single=true&output=csv
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const { parse } = require("papaparse");
const qrcode = require("qrcode-terminal");
const pino = require("pino");
const crypto = require('crypto-browserify');

const {
  makeWASocket,
  Browsers,
  useMultiFileAuthState,
  makeInMemoryStore,
} = require("@whiskeysockets/baileys");

// === Konfigurasi Session ===
const SESSION_DIR = "./session";
const sessionPath = path.resolve(SESSION_DIR);

if (!fs.existsSync(sessionPath)) {
  fs.mkdirSync(sessionPath);
}

// === Versi WhatsApp Web Stabil ===
const WA_VERSION = [2, 2412, 51]; // versi aman Mei 2025

// === Baca data dari Google Sheet (CSV) ===
async function cariDataPBB(nopCari) {
  try {
    const res = await axios.get(
      "https://docs.google.com/spreadsheets/d/e/2PACX-1vQFY2Wtm-eAJ72LOHANHlFEQqNBpHi3-NJAXHJOuM6sxNxDnuykY86DuL-pmUnFCX6DDrEWG4EElOF7/pub?gid=0&single=true&output=csv",
    );
    const csv = res.data;

    return new Promise((resolve) => {
      parse(csv, { header: true }, (results) => {
        resolve(results.data.find((row) => row.NOP === nopCari));
      });
    });
  } catch (e) {
    console.error("❌ Gagal baca data dari Google Sheet:", e);
    return null;
  }
}

// === Koneksi WhatsApp ===
async function connectToWhatsApp() {
  const store = makeInMemoryStore({});
  if (fs.existsSync("./baileys_store.json")) {
    store.readFromFile("./baileys_store.json");
  }

  const { state, saveCreds } = await useMultiFileAuthState(sessionPath);

  const sock = makeWASocket({
    version: WA_VERSION,
    auth: state,
    browser: Browsers.macOS("Safari"), // Lebih aman daripada Chrome Ubuntu
    logger: pino({ level: "silent" }),
    appStateMacKeysDisabled: true,
  });

  store.bind(sock.ev);

  setInterval(() => {
    store.writeToFile("./baileys_store.json");
  }, 10_000);

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log("📲 Silakan scan QR Code:");
      qrcode.generate(qr, { small: true });
    }

    if (connection === "close") {
      console.error("❌ Penyebab disconnect:", lastDisconnect?.error?.message);
      const code = lastDisconnect?.error?.output?.statusCode;

      const shouldReconnect = code !== 401 && code !== 515;
      if (shouldReconnect) {
        console.log("🔄 Mencoba reconnect...");
        connectToWhatsApp();
      } else {
        console.log("🚫 Sesi diblokir / tidak bisa lanjut. Hapus session lalu coba lagi.");
      }
    }

    if (connection === "open") {
      console.log("✅ Terhubung ke WhatsApp!");
    }
  });

  // === Terima pesan ===
  sock.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages[0];
    if (!msg.message) return;

    const text =
      msg.message.conversation || msg.message.extendedTextMessage?.text;
    const from = msg.key.remoteJid;

    console.log(`📩 Pesan dari ${from}: ${text}`);

    if (text && text.toLowerCase().startsWith("pbb ")) {
      const nop = text.split(" ")[1]?.trim();

      if (!nop) {
        await sock.sendMessage(from, {
          text: "⚠️ Format salah. Contoh: *pbb 32.11.080.001.001.0010.0*",
        });
        return;
      }

      try {
        const data = await cariDataPBB(nop);

        if (data) {
          await sock.sendMessage(from, {
            text: `
🔍 *Data PBB untuk NOP: ${data.NOP}*
• Nama WP     : ${data["NAMA WAJIB PAJAK"]}
• Alamat OP   : ${data["ALAMAT OBJEK PAJAK"]}
• Pokok Pajak : Rp ${parseInt(data["POKOK PAJAK"]).toLocaleString()}
➡️ Pajak Terhutang: Rp ${parseInt(data["PAJAK TERHUTANG"]).toLocaleString()}
            `,
          });
        } else {
          await sock.sendMessage(from, {
            text: `❌ NOP *${nop}* tidak ditemukan.`,
          });
        }
      } catch (e) {
        console.error("❌ Error saat mencari data:", e);
        await sock.sendMessage(from, {
          text: "⚠️ Terjadi kesalahan saat mengakses data.",
        });
      }
    }
  });
}

connectToWhatsApp();
