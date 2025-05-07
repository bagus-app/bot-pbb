from flask import Flask, request, jsonify
import pandas as pd

app = Flask(__name__)

GOOGLE_SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQFY2Wtm-eAJ72LOHANHlFEQqNBpHi3-NJAXHJOuM6sxNxDnuykY86DuL-pmUnFCX6DDrEWG4EElOF7/pub?gid=0&single=true&output=csv"


def cari_data_pbb(nop_cari):
    try:
        df = pd.read_csv(GOOGLE_SHEET_CSV_URL)
        for _, row in df.iterrows():
            nop = str(row["NOP"]).strip()
            if nop == nop_cari:
                return {
                    "nop": nop,
                    "tahun_pajak": row["TAHUN PAJAK"],
                    "nama": row["NAMA WAJIB PAJAK"],
                    "alamat": row["ALAMAT OBJEK PAJAK"],
                    "luas_bumi": row["LUAS BUMI"],
                    "luas_bangunan": row["LUAS BANGUNAN"],
                    "pokok_pajak": row["POKOK PAJAK"],
                    "denda": row["DENDA"],
                    "pajak_terhutang": row["PAJAK TERHUTANG"]
                }
        return None
    except Exception as e:
        print("Error:", e)
        return None


@app.route('/cek-pbb', methods=['POST'])
def cek_pbb():
    msg = request.json.get('message', '')
    sender = request.json.get('sender', 'unknown')

    print(f"Pesan dari {sender}: {msg}")

    if not msg.lower().startswith("pbb "):
        return jsonify({"reply": "Format salah. Gunakan: PBB 35.06.191.015.xxx.xxxx.0"}), 200

    try:
        nop = msg.split(" ", 1)[1].strip()
        data = cari_data_pbb(nop)

        if data:
            reply = (
                f"🔍 Hasil pencarian PBB:\n\n"
                f"NOP              : {data['nop']}\n"
                f"Tahun Pajak      : {data['tahun_pajak']}\n"
                f"Nama             : {data['nama']}\n"
                f"Alamat           : {data['alamat']}\n"
                f"Luas Bumi        : {data['luas_bumi']} m²\n"
                f"Luas Bangunan    : {data['luas_bangunan']} m²\n"
                f" Pokok Pajak     : Rp {int(data['pokok_pajak']):,}\n"
                f" Denda           : Rp {int(data['denda']):,}\n"
                f"➡️ Total Terhutang: Rp {int(data['pajak_terhutang']):,}\n"
                f"*Ini adalah Data NOP yang belum terbayar. data di upadate berkala. untuk lebih jelasnya bisa hubungi Pamong Blok Masing - Masing"
            )
        else:
            reply = "❌ NOP tidak ditemukan dalam Data Tunggakan Tahun 2025."

    except Exception as e:
        reply = f"Terjadi kesalahan: {str(e)}"

    return jsonify({"reply": reply})


@app.route('/')
def index():
    return "Bot PBB Berjalan!"


if __name__ == '__main__':
    app.run(debug=True)