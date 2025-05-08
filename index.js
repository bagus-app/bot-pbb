const fs = require("fs");
const path = require("path");
const axios = require("axios");
const { parse } = require("papaparse");
const qrcode = require("qrcode-terminal");
const pino = require("pino");
const crypto = require("crypto-browserify");  // Tambahkan crypto-browserify

// Global crypto fix for Railway or environments that don't support crypto natively
global.crypto = crypto;

// Import Baileys
const {
  makeWASocket,
  Browsers,
  useMultiFileAuthState,
  makeInMemoryStore,
} = require("@whiskeysockets/baileys");

// Folder untuk menyimpan session
const SESSION_DIR = "./session";
const sessionPath = path.resolve(SESSION_DIR);

if (!fs.existsSync(sessionPath)) {
  fs.mkdirSync(sessionPath);
}

// Baca data dari Google Sheet (CSV)
async function cariDataPBB(nopCari) {
  try {
    const res = await axios.get(
      "https://docs.google.com/spreadsheets/d/e/2PACX-1vQFY2Wtm-eAJ72LOHANHlFEQqNBpHi3-NJAXHJOuM6sxNxDnuykY86DuL-pmUnFCX6DDrEWG4EElOF7/pub?gid=0&single=true&output=csv"
    );
    const csv = res.data;

    return new Promise((resolve) => {
      parse(csv, { header: true }, (results) => {
        resolve(results.data.find((row) => row.NOP === nopCari));
      });
    });
  } catch (e) {
    console.error("Error baca data:", e);
    return null;
  }
}

// Fungsi utama bot
async function connectToWhatsApp() {
  const store = makeInMemoryStore({});
  if (fs.existsSync("./baileys_store.json")) {
    store.readFromFile("./baileys_store.json");
  }

  const { state, saveCreds } = await useMultiFileAuthState(sessionPath);

  const sock = makeWASocket({
    auth: state,
    browser: {
      name: "Chrome",
      version: "120.0.0",
      userAgent:
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
    logger: pino({ level: "silent" }),
    version: [2, 2406],
    appStateMacKeysDisabled: true, // 🔥 Ini yang menghentikan error
  });

  store.bind(sock.ev); // Binding store ke events socket

  setInterval(() => {
    store.writeToFile("./baileys_store.json");
  }, 10_000);

  // Event handler
  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log("Silakan scan QR Code:");
      qrcode.generate(qr, { small: true });
    }

    if (connection === "close") {
      console.error("Penyebab disconnect:", lastDisconnect);
      const shouldReconnect = lastDisconnect.error?.output?.statusCode !== 401;
      if (shouldReconnect) {
        console.log("Mencoba reconnect...");
        connectToWhatsApp();
      }
    }
  });

  // Terima pesan masuk
  sock.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages[0];
    if (!msg.message) return;

    const text =
      msg.message.conversation || msg.message.extendedTextMessage?.text;
    const from = msg.key.remoteJid;

    console.log(`Pesan dari ${from}: ${text}`);

    if (text && text.toLowerCase().startsWith("pbb ")) {
      const nop = text.split(" ")[1]?.trim(); // Tambahkan null check

      if (!nop) {
        await sock.sendMessage(from, {
          text: "⚠️ Format perintah salah. Gunakan: pbb <nomor objek pajak>",
        });
        return;
      }

      try {
        const data = await cariDataPBB(nop);

        if (data) {
          await sock.sendMessage(from, {
            text: `
🔍 Hasil pencarian PBB untuk NOP: ${data.NOP}
Nama Wajib Pajak : ${data["NAMA WAJIB PAJAK"]}
Alamat Objek Pajak: ${data["ALAMAT OBJEK PAJAK"]}
Pokok Pajak     : Rp ${parseInt(data["POKOK PAJAK"]).toLocaleString()}
➡️ Total Terhutang: Rp ${parseInt(data["PAJAK TERHUTANG"]).toLocaleString()}
                        `,
          });
        } else {
          await sock.sendMessage(from, {
            text: `❌ NOP "${nop}" tidak ditemukan dalam database.`,
          });
        }
      } catch (e) {
        console.error("Error saat mencari data:", e);
        await sock.sendMessage(from, {
          text: "⚠️ Terjadi kesalahan saat mencari data.",
        });
      }
    }
  });
}

connectToWhatsApp();
