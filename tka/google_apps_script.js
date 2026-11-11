/**
 * =========================================================================
 * GOOGLE APPS SCRIPT - SISTEM TKA LENGKAP & MANDIRI (STANDALONE)
 * MTs MUHAMMADIYAH DONOREJO (Future Leaders School)
 * =========================================================================
 * - Langsung memuat halaman pendaftaran, ujian, & leaderboard tanpa muter-muter!
 * - Mendukung akses langsung lewat link Apps Script DAN lewat domain sekolah.
 * =========================================================================
 */

const SPREADSHEET = SpreadsheetApp.getActiveSpreadsheet();
const ADMIN_PIN_SECRET = "1912";
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwnlTp7bp3lGVFDAp0JUAcHWQbiC45leHYNX4dxcY6HyuzlH7YIYR8T3v8UYAO2krjc/exec";

// -------------------------------------------------------------------------
// 1. ENDPOINT GET (API DATA ATAU TAMPILAN WEB PENUH)
// -------------------------------------------------------------------------
function doGet(e) {
  try {
    const p = e.parameter || {};
    const action = p.action;
    const now = new Date();

    // JIKA TIDAK ADA ACTION -> TAMPILKAN HALAMAN FORM PENDAFTARAN / UJIAN / ADMIN
    if (!action) {
      const page = p.p || p.page || '';
      return renderHalamanUtama(page);
    }

    // A. AMBIL PENGATURAN WEB UNTUK HALAMAN DEPAN
    if (action === 'get_pengaturan_web') {
      const config = bacaPengaturanWeb();
      return jsonResponse({ ok: true, data: config });
    }

    // B. AMBIL SOAL & CEK JADWAL BUKA/TUTUP TRYOUT
    if (action === 'get_tryout') {
      const sheetT = SPREADSHEET.getSheetByName('tryout');
      if (!sheetT) return jsonResponse({ ok: false, msg: 'Tab tryout tidak ditemukan di Google Sheets.' });
      
      const dataT = sheetT.getDataRange().getValues().slice(1);
      const t = dataT.find(r => r[5] === true || String(r[5]).toUpperCase() === 'TRUE');
      
      if (!t) return jsonResponse({ ok: false, msg: 'Saat ini belum ada tryout yang diaktifkan oleh admin.' });

      const waktuBuka = t[3] ? new Date(t[3]) : null;
      const waktuTutup = t[4] ? new Date(t[4]) : null;

      if (waktuBuka && !isNaN(waktuBuka.getTime()) && now < waktuBuka) {
        return jsonResponse({
          ok: false,
          status_kode: 'BELUM_BUKA',
          msg: 'Tryout baru dibuka pada: ' + Utilities.formatDate(waktuBuka, "GMT+7", "dd MMM yyyy, HH:mm") + ' WIB'
        });
      }
      if (waktuTutup && !isNaN(waktuTutup.getTime()) && now > waktuTutup) {
        return jsonResponse({
          ok: false,
          status_kode: 'SUDAH_TUTUP',
          msg: 'Periode tryout telah berakhir pada: ' + Utilities.formatDate(waktuTutup, "GMT+7", "dd MMM yyyy, HH:mm") + ' WIB'
        });
      }

      const tryoutId = String(t[0]);
      const sheetS = SPREADSHEET.getSheetByName('soal');
      const rowsS = sheetS ? sheetS.getDataRange().getValues().slice(1) : [];

      const soalList = rowsS
        .filter(r => String(r[1]) === tryoutId)
        .sort((a, b) => Number(a[2]) - Number(b[2]))
        .map(r => ({
          id: String(r[0]),
          nomor: Number(r[2]),
          pertanyaan: String(r[3] || ''),
          gambar: String(r[4] || ''),
          opsi: {
            A: String(r[5] || ''),
            B: String(r[6] || ''),
            C: String(r[7] || ''),
            D: String(r[8] || '')
          }
        }));

      return jsonResponse({
        ok: true,
        data: {
          id: tryoutId,
          judul: t[1],
          durasi_menit: Number(t[2]) || 60,
          waktu_buka: t[3],
          waktu_tutup: t[4],
          soal: soalList,
          server_time: now.toISOString()
        }
      });
    }

    // C. LEADERBOARD PERINGKAT TOP 50
    if (action === 'get_leaderboard') {
      const sheetP = SPREADSHEET.getSheetByName('percobaan');
      const sheetU = SPREADSHEET.getSheetByName('peserta');
      if (!sheetP || !sheetU) return jsonResponse({ ok: false, msg: 'Tabel database belum siap.' });

      const dataP = sheetP.getDataRange().getValues().slice(1);
      const dataU = sheetU.getDataRange().getValues().slice(1);

      const userMap = {};
      dataU.forEach(u => {
        userMap[String(u[0])] = {
          nama: String(u[3] || 'Peserta'),
          sekolah: String(u[7] || '-')
        };
      });

      const leaderboard = dataP
        .filter(r => r[4] !== '')
        .map(r => {
          const u = userMap[String(r[1])] || { nama: 'Peserta', sekolah: '-' };
          return {
            nama: u.nama,
            sekolah: u.sekolah,
            skor: Number(r[8]) || 0,
            benar: Number(r[7]) || 0,
            total: Number(r[9]) || 0,
            durasi_detik: Number(r[5]) || 0,
            selesai_at: r[4]
          };
        })
        .sort((a, b) => {
          if (b.skor !== a.skor) return b.skor - a.skor;
          return a.durasi_detik - b.durasi_detik;
        })
        .slice(0, 50);

      return jsonResponse({ ok: true, data: leaderboard });
    }

    // D. DASHBOARD ADMIN
    if (action === 'get_admin_data') {
      if (p.pin !== ADMIN_PIN_SECRET) {
        return jsonResponse({ ok: false, msg: 'PIN akses tidak sah!' });
      }

      const sheetT = SPREADSHEET.getSheetByName('tryout');
      const sheetU = SPREADSHEET.getSheetByName('peserta');
      const sheetP = SPREADSHEET.getSheetByName('percobaan');

      const dataT = sheetT ? sheetT.getDataRange().getValues().slice(1) : [];
      const dataU = sheetU ? sheetU.getDataRange().getValues().slice(1) : [];
      const dataP = sheetP ? sheetP.getDataRange().getValues().slice(1) : [];

      const tryoutAktif = dataT.find(r => r[5] === true || String(r[5]).toUpperCase() === 'TRUE') || dataT[0] || [];

      const attemptMap = {};
      dataP.forEach(r => {
        attemptMap[String(r[1])] = {
          selesai_at: r[4],
          durasi_detik: r[5],
          benar: r[7],
          skor: r[8],
          total: r[9]
        };
      });

      const sebaranSekolah = {};
      let totalSelesai = 0;
      let totalSkor = 0;

      const pesertaList = dataU.map(u => {
        const idUser = String(u[0]);
        const att = attemptMap[idUser] || null;
        const sekolah = String(u[7] || 'Lainnya').trim();

        sebaranSekolah[sekolah] = (sebaranSekolah[sekolah] || 0) + 1;

        if (att && att.selesai_at) {
          totalSelesai++;
          totalSkor += Number(att.skor) || 0;
        }

        return {
          id: idUser,
          username: u[1],
          password: u[2],
          nama: u[3],
          nama_ortu: u[4],
          no_wa: u[5],
          alamat: u[6],
          nama_sekolah: sekolah,
          created_at: u[8],
          hasil: att
        };
      });

      const rataRataSkor = totalSelesai > 0 ? (totalSkor / totalSelesai).toFixed(1) : '0';
      const webConfig = bacaPengaturanWeb();

      return jsonResponse({
        ok: true,
        data: {
          tryout: {
            id: tryoutAktif[0] || '',
            judul: tryoutAktif[1] || '',
            durasi_menit: tryoutAktif[2] || 60,
            waktu_buka: tryoutAktif[3] || '',
            waktu_tutup: tryoutAktif[4] || '',
            aktif: tryoutAktif[5] === true || String(tryoutAktif[5]).toUpperCase() === 'TRUE'
          },
          kpi: {
            total_pendaftar: dataU.length,
            total_mengerjakan: totalSelesai,
            rata_rata_skor: rataRataSkor,
            total_sekolah: Object.keys(sebaranSekolah).length
          },
          pengaturan_web: webConfig,
          sebaran_sekolah: sebaranSekolah,
          peserta: pesertaList
        }
      });
    }

    return jsonResponse({ ok: false, msg: 'Aksi GET tidak dikenal.' });
  } catch (err) {
    return jsonResponse({ ok: false, msg: err.toString() });
  }
}

// -------------------------------------------------------------------------
// 2. ENDPOINT POST
// -------------------------------------------------------------------------
function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
  } catch (e) {
    return jsonResponse({ ok: false, msg: 'Server sedang sibuk. Silakan coba lagi.' });
  }

  try {
    const raw = e.postData && e.postData.contents ? e.postData.contents : '{}';
    const body = JSON.parse(raw);
    const action = body.action;

    // A. DAFTAR PESERTA
    if (action === 'daftar') {
      const d = body.data || {};
      const sheet = SPREADSHEET.getSheetByName('peserta');
      if (!sheet) return jsonResponse({ ok: false, msg: 'Tab peserta belum dibuat di spreadsheet.' });

      const id = Utilities.getUuid();
      const now = new Date();

      sheet.appendRow([
        id,
        String(d.username).trim().toLowerCase(),
        String(d.password).trim(),
        String(d.nama).trim(),
        String(d.nama_ortu).trim(),
        "'" + String(d.no_wa).trim(),
        String(d.alamat).trim(),
        String(d.nama_sekolah).trim(),
        Utilities.formatDate(now, "GMT+7", "yyyy-MM-dd HH:mm:ss")
      ]);

      return jsonResponse({
        ok: true,
        data: {
          id: id,
          username: d.username,
          password: d.password,
          nama: d.nama,
          sekolah: d.nama_sekolah
        }
      });
    }

    // B. LOGIN
    if (action === 'login') {
      const u = String(body.username || '').trim().toLowerCase();
      const p = String(body.password || '').trim();
      const sheet = SPREADSHEET.getSheetByName('peserta');
      if (!sheet) return jsonResponse({ ok: false, msg: 'Tab peserta belum ada.' });

      const rows = sheet.getDataRange().getValues().slice(1);
      const user = rows.find(r => String(r[1]).toLowerCase() === u && String(r[2]) === p);

      if (!user) {
        return jsonResponse({ ok: false, msg: 'Username atau Password salah.' });
      }

      return jsonResponse({
        ok: true,
        data: {
          id: String(user[0]),
          username: String(user[1]),
          nama: String(user[3]),
          sekolah: String(user[7])
        }
      });
    }

    // C. MULAI TRYOUT
    if (action === 'mulai_tryout') {
      const pesertaId = String(body.peserta_id);
      const tryoutId = String(body.tryout_id);
      const sheetP = SPREADSHEET.getSheetByName('percobaan');
      if (!sheetP) return jsonResponse({ ok: false, msg: 'Tab percobaan belum ada.' });

      const rowsP = sheetP.getDataRange().getValues().slice(1);
      const existing = rowsP.find(r => String(r[1]) === pesertaId && String(r[2]) === tryoutId);

      if (existing) {
        return jsonResponse({
          ok: true,
          data: {
            id: String(existing[0]),
            mulai_at: existing[3],
            selesai_at: existing[4]
          }
        });
      }

      const id = Utilities.getUuid();
      const mulai = new Date().toISOString();
      sheetP.appendRow([id, pesertaId, tryoutId, mulai, '', '', '{}', 0, 0, 0]);

      return jsonResponse({
        ok: true,
        data: { id: id, mulai_at: mulai, selesai_at: '' }
      });
    }

    // D. SELESAI TRYOUT
    if (action === 'selesai_tryout') {
      const pesertaId = String(body.peserta_id);
      const tryoutId = String(body.tryout_id);
      const jawaban = body.jawaban || {};
      const selesai = new Date();

      const sheetS = SPREADSHEET.getSheetByName('soal');
      const rowsS = sheetS ? sheetS.getDataRange().getValues().slice(1).filter(r => String(r[1]) === tryoutId) : [];

      let benar = 0;
      const total = rowsS.length;

      rowsS.forEach(s => {
        const idSoal = String(s[0]);
        const kunci = String(s[9] || '').trim().toUpperCase();
        const jawabPeserta = String(jawaban[idSoal] || '').trim().toUpperCase();
        if (jawabPeserta && jawabPeserta === kunci) {
          benar++;
        }
      });

      const skor = total > 0 ? Number(((benar / total) * 100).toFixed(2)) : 0;

      const sheetP = SPREADSHEET.getSheetByName('percobaan');
      const dataP = sheetP.getDataRange().getValues();

      for (let i = 1; i < dataP.length; i++) {
        if (String(dataP[i][1]) === pesertaId && String(dataP[i][2]) === tryoutId) {
          const mulai = new Date(dataP[i][3]);
          const durasiDetik = Math.max(0, Math.floor((selesai.getTime() - mulai.getTime()) / 1000));

          sheetP.getRange(i + 1, 5).setValue(selesai.toISOString());
          sheetP.getRange(i + 1, 6).setValue(durasiDetik);
          sheetP.getRange(i + 1, 7).setValue(JSON.stringify(jawaban));
          sheetP.getRange(i + 1, 8).setValue(benar);
          sheetP.getRange(i + 1, 9).setValue(skor);
          sheetP.getRange(i + 1, 10).setValue(total);
          break;
        }
      }

      return jsonResponse({
        ok: true,
        data: {
          benar: benar,
          total: total,
          skor: skor,
          selesai_at: selesai.toISOString()
        }
      });
    }

    // E. SIMPAN PENGATURAN TRYOUT
    if (action === 'admin_toggle_tryout') {
      if (body.pin !== ADMIN_PIN_SECRET) return jsonResponse({ ok: false, msg: 'PIN tidak sah!' });

      const sheetT = SPREADSHEET.getSheetByName('tryout');
      sheetT.getRange(2, 6).setValue(body.aktif === true);

      if (body.durasi_menit) sheetT.getRange(2, 3).setValue(Number(body.durasi_menit));
      if (body.waktu_buka) sheetT.getRange(2, 4).setValue(body.waktu_buka);
      if (body.waktu_tutup) sheetT.getRange(2, 5).setValue(body.waktu_tutup);

      return jsonResponse({ ok: true, msg: 'Pengaturan tryout berhasil disimpan!' });
    }

    // F. SIMPAN PENGATURAN WEB (WA & SPMB)
    if (action === 'admin_simpan_web') {
      if (body.pin !== ADMIN_PIN_SECRET) return jsonResponse({ ok: false, msg: 'PIN tidak sah!' });

      simpanKunciPengaturan('kontak_wa', body.kontak_wa || '6288232078761');
      simpanKunciPengaturan('spmb_status', body.spmb_status || 'BUKA');
      simpanKunciPengaturan('pesan_wa', body.pesan_wa || '');

      return jsonResponse({ ok: true, msg: 'Pengaturan web berhasil disimpan!' });
    }

    // G. SIMPAN PENGATURAN BANNER
    if (action === 'admin_simpan_banner') {
      if (body.pin !== ADMIN_PIN_SECRET) return jsonResponse({ ok: false, msg: 'PIN tidak sah!' });

      simpanKunciPengaturan('pengumuman_aktif', body.pengumuman_aktif === true);
      simpanKunciPengaturan('pengumuman_teks', body.pengumuman_teks || '');
      simpanKunciPengaturan('pengumuman_link', body.pengumuman_link || '');

      return jsonResponse({ ok: true, msg: 'Pengaturan banner berhasil disimpan!' });
    }

    return jsonResponse({ ok: false, msg: 'Aksi POST tidak valid.' });
  } catch (err) {
    return jsonResponse({ ok: false, msg: err.toString() });
  } finally {
    try { lock.releaseLock(); } catch(e){}
  }
}

// -------------------------------------------------------------------------
// 3. TAMPILAN WEB PENUH (MUNCUL LANGSUNG DI LINK APPS SCRIPT TANPA MUTER-MUTER)
// -------------------------------------------------------------------------
function renderHalamanUtama(page) {
  let title = "Tryout TKA — MTs Muhammadiyah Donorejo";

  const html = `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
:root{
  --ink:#0A1628; --blue:#0B5FAD; --blue-deep:#084A88; --cyan:#22D3F5;
  --paper:#F4F8FC; --line:#DCE5F0; --muted:#5A6B82; --ok:#067647; --danger:#B42318;
  --font:'Plus Jakarta Sans',sans-serif;
}
*,*::before,*::after{box-sizing:border-box}
body{margin:0;min-height:100vh;font-family:var(--font);background:var(--ink);color:#fff;line-height:1.6;position:relative}
a{color:inherit;text-decoration:none}
button{font:inherit;cursor:pointer;border:0;background:none;color:inherit}

.top{max-width:1100px;margin:0 auto;padding:18px 20px;display:flex;align-items:center;justify-content:space-between}
.brand b{display:block;font-size:1.02rem;letter-spacing:-.02em}
.brand small{display:block;font-size:.74rem;opacity:.75}

.main{max-width:1100px;margin:0 auto;padding:20px;display:grid;grid-template-columns:1fr 1.05fr;gap:40px;align-items:start}
@media(max-width:850px){.main{grid-template-columns:1fr;}}

.tag{display:inline-flex;align-items:center;gap:8px;padding:6px 14px;border-radius:999px;background:rgba(34,211,245,.12);border:1px solid rgba(34,211,245,.25);font-size:.82rem;font-weight:700;color:var(--cyan)}
h1{font-size:clamp(2.1rem,5vw,3.2rem);line-height:1.1;font-weight:800;letter-spacing:-.03em;margin:16px 0 0}
.lead{color:#C6D6EA;font-size:1.05rem;margin:16px 0}

.card{background:#fff;color:var(--ink);border-radius:24px;padding:28px;box-shadow:0 30px 60px -20px rgba(0,0,0,.6)}
.tabs{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;background:var(--paper);padding:6px;border-radius:999px;margin-bottom:20px}
.tabs button{height:40px;border-radius:999px;font-weight:700;font-size:.86rem;color:var(--muted);transition:.2s}
.tabs button.on{background:#fff;color:var(--ink);box-shadow:0 4px 12px rgba(10,22,40,.15)}

.view{display:none}
.view.on{display:block}
h2{margin:0 0 6px;font-size:1.35rem;font-weight:800}
.sub{color:var(--muted);font-size:.9rem;margin:0 0 18px}

.field{margin-bottom:14px}
label{display:block;font-size:.84rem;font-weight:700;margin-bottom:6px}
input,textarea{width:100%;height:46px;border:1.5px solid var(--line);border-radius:10px;padding:0 14px;font:inherit;font-size:.92rem}
textarea{height:72px;padding:10px 14px;resize:vertical}
input:focus,textarea:focus{outline:none;border-color:var(--blue)}

.btn{display:inline-flex;align-items:center;justify-content:center;width:100%;height:50px;border-radius:999px;font-weight:700;font-size:.95rem;background:var(--blue);color:#fff;box-shadow:0 10px 24px -10px rgba(11,95,173,.7);transition:.2s}
.btn:hover{background:var(--blue-deep)}
.btn:disabled{opacity:.6;cursor:wait}
.btn.ghost{background:#fff;color:var(--ink);border:1.5px solid var(--line);box-shadow:none}

.cred-card{background:linear-gradient(135deg,#EFF6FF,#E0F2FE);border:1.5px dashed #93C5FD;border-radius:14px;padding:18px;margin-bottom:16px}
.cred-row{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px}
.cred-box small{display:block;font-size:.72rem;font-weight:700;color:var(--muted)}
.cred-box code{display:block;font-size:1.3rem;font-weight:800;color:var(--ink)}

table.lb-table{width:100%;border-collapse:collapse;font-size:.88rem;text-align:left}
table.lb-table th{background:var(--paper);padding:10px;color:var(--muted);font-size:.78rem}
table.lb-table td{padding:10px;border-top:1px solid var(--line)}

.msg{display:none;margin:0 0 14px;padding:10px 14px;border-radius:8px;font-size:.86rem;font-weight:600}
.msg.show{display:block}
.msg.err{background:#FEF3F2;color:var(--danger)}

footer{text-align:center;padding:24px;color:rgba(255,255,255,.6);font-size:.82rem}
</style>
</head>
<body>

<header class="top">
  <div class="brand">
    <b>MTs Muhammadiyah Donorejo</b>
    <small>Future Leaders School · TKA Online</small>
  </div>
  <div>
    <a href="https://www.mtsmdonorejo.sch.id" target="_blank" style="font-size:.85rem;color:var(--cyan);text-decoration:underline">Buka Web Utama ↗</a>
  </div>
</header>

<main class="main">
  <!-- KIRI: INFORMASI -->
  <div>
    <div class="tag">SPMB MTs Donorejo 2026/2027</div>
    <h1>Tes Kemampuan Akademik (TKA) Online</h1>
    <p class="lead">Ukur kemampuan akademik calon siswa SD/MI sederajat secara gratis. Dapatkan beasiswa prestasi dan jalur masuk kelas unggulan.</p>
    <div style="background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);border-radius:16px;padding:18px;margin-top:20px">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
        <span style="font-size:1.3rem">⏱️</span>
        <div><b>Waktu Fleksibel</b><div style="font-size:.82rem;opacity:.8">Bisa dikerjakan kapan saja dari rumah</div></div>
      </div>
      <div style="display:flex;align-items:center;gap:10px">
        <span style="font-size:1.3rem">🏆</span>
        <div><b>Leaderboard Juara</b><div style="font-size:.82rem;opacity:.8">Pantau peringkat nilai dan asal sekolah</div></div>
      </div>
    </div>
  </div>

  <!-- KANAN: CARD UTAMA -->
  <div class="card">
    <div class="tabs">
      <button type="button" id="tab-daftar" class="on" onclick="setTab('daftar')">Daftar</button>
      <button type="button" id="tab-masuk" onclick="setTab('masuk')">Masuk</button>
      <button type="button" id="tab-lb" onclick="setTab('lb')">🏆 Juara</button>
    </div>

    <!-- VIEW DAFTAR -->
    <div class="view on" id="v-daftar">
      <h2>Daftar Peserta Baru</h2>
      <p class="sub">Gratis untuk seluruh siswa kelas 6 SD/MI.</p>
      <div class="msg err" id="m-daftar"></div>
      <form id="f-daftar">
        <div class="field"><label>Nama Lengkap Siswa</label><input type="text" id="d-nama" required placeholder="Contoh: Muhammad Rizki"></div>
        <div class="field"><label>Nama Orang Tua / Wali</label><input type="text" id="d-ortu" required placeholder="Contoh: Bapak Hendra"></div>
        <div class="field"><label>Nomor WhatsApp Aktif</label><input type="tel" id="d-hp" required placeholder="Contoh: 08123456789"></div>
        <div class="field"><label>Asal SD / MI</label><input type="text" id="d-sekolah" required placeholder="Contoh: SD Negeri 1 Donorejo"></div>
        <div class="field"><label>Alamat Singkat</label><input type="text" id="d-alamat" required placeholder="Contoh: Donorejo RT 02 / RW 01"></div>
        <button type="submit" class="btn" id="b-daftar">Dapatkan Akun & Mulai Ujian</button>
      </form>
    </div>

    <!-- VIEW KARTU SETELAH DAFTAR -->
    <div class="view" id="v-akun">
      <h2>Pendaftaran Berhasil! 🎉</h2>
      <p class="sub">Kartu peserta Anda telah dibuat:</p>
      <div class="cred-card">
        <div style="font-size:.78rem;font-weight:700;color:var(--blue)">KARTU PESERTA TKA MTs DONOREJO</div>
        <div style="margin-top:8px">
          <small style="color:var(--muted);font-weight:700;font-size:.75rem">NAMA SISWA</small>
          <div id="o-nama" style="font-weight:800;font-size:1.1rem">-</div>
          <small style="color:var(--muted);font-weight:700;font-size:.75rem;margin-top:4px">ASAL SD/MI</small>
          <div id="o-sekolah" style="font-weight:700;color:var(--blue);font-size:.92rem">-</div>
        </div>
        <div class="cred-row">
          <div class="cred-box"><small>USERNAME</small><code id="o-user">-</code></div>
          <div class="cred-box"><small>PASSWORD</small><code id="o-pass">-</code></div>
        </div>
      </div>
      <button type="button" class="btn" style="background:#0E8A45;margin-bottom:10px" id="b-unduh-kartu">📷 Unduh Kartu ke Galeri HP</button>
      <a href="https://www.mtsmdonorejo.sch.id/tka/tryout.html" class="btn" id="b-mulai">Mulai Mengerjakan Sekarang →</a>
    </div>

    <!-- VIEW MASUK / LOGIN -->
    <div class="view" id="v-masuk">
      <h2>Masuk ke Ruang Ujian</h2>
      <p class="sub">Masukkan username dan password yang sudah dibuat.</p>
      <div class="msg err" id="m-masuk"></div>
      <form id="f-masuk">
        <div class="field"><label>Username</label><input type="text" id="u-user" required placeholder="Username Anda"></div>
        <div class="field"><label>Password</label><input type="password" id="u-pass" required placeholder="Password Anda"></div>
        <button type="submit" class="btn" id="b-masuk">Masuk ke Ruang Tryout</button>
      </form>
    </div>

    <!-- VIEW LEADERBOARD -->
    <div class="view" id="v-lb">
      <h2>🏆 Leaderboard Prestasi</h2>
      <p class="sub">Peringkat peraih skor tryout tertinggi.</p>
      <div style="max-height:360px;overflow-y:auto;border:1px solid var(--line);border-radius:12px;margin-bottom:12px">
        <table class="lb-table">
          <thead><tr><th>No</th><th>Nama Siswa</th><th>Sekolah</th><th style="text-align:right">Skor</th></tr></thead>
          <tbody id="lb-body"><tr><td colspan="4" style="text-align:center;padding:20px;color:var(--muted)">Memuat data peringkat…</td></tr></tbody>
        </table>
      </div>
      <button type="button" class="btn ghost" onclick="muatLeaderboard()">🔄 Segarkan Peringkat</button>
    </div>
  </div>
</main>

<footer>
  MTs Muhammadiyah Donorejo · Future Leaders School
</footer>

<script>
var GAS_URL = "${SCRIPT_URL}";
var $ = function(id){ return document.getElementById(id); };
var akunAktif = { u:'', p:'', nama:'', sekolah:'' };

function setTab(name){
  ['daftar','akun','masuk','lb'].forEach(function(t){
    var el = $('v-' + t); if(el) el.classList.toggle('on', t === name);
  });
  $('tab-daftar').className = (name === 'daftar') ? 'on' : '';
  $('tab-masuk').className = (name === 'masuk') ? 'on' : '';
  $('tab-lb').className = (name === 'lb') ? 'on' : '';
  if(name === 'lb') muatLeaderboard();
}

// 1. DAFTAR PESERTA
$('f-daftar').onsubmit = async function(e){
  e.preventDefault();
  $('m-daftar').className = 'msg err'; $('m-daftar').textContent = '';
  var btn = $('b-daftar'); btn.disabled = true; btn.textContent = 'Membuat Akun…';

  var nama = $('d-nama').value.trim();
  var slug = nama.toLowerCase().replace(/[^a-z]/g,'').slice(0,8) || 'siswa';
  var username = slug + Math.floor(1000 + Math.random() * 9000);
  var chars = 'abcdefhkmnprstuvwxyzABCDEFGHKMNPRSTUVWXYZ23456789';
  var password = '';
  for(var i=0; i<8; i++){ password += chars.charAt(Math.floor(Math.random()*chars.length)); }

  var hp = $('d-hp').value.replace(/\D/g,'');
  if(hp.indexOf('0') === 0) hp = '62' + hp.slice(1);
  else if(hp.indexOf('8') === 0) hp = '62' + hp;

  try {
    var resp = await fetch(GAS_URL, {
      method: 'POST',
      body: JSON.stringify({
        action: 'daftar',
        data: {
          username: username, password: password,
          nama: nama, nama_ortu: $('d-ortu').value.trim(),
          no_wa: hp, nama_sekolah: $('d-sekolah').value.trim(),
          alamat: $('d-alamat').value.trim()
        }
      })
    });
    var res = await resp.json();
    if(!res.ok) throw new Error(res.msg);

    akunAktif = { u: username, p: password, nama: nama, sekolah: $('d-sekolah').value.trim(), id: res.data.id };
    try { localStorage.setItem('tka_user', JSON.stringify(akunAktif)); } catch(e){}

    $('o-user').textContent = username;
    $('o-pass').textContent = password;
    $('o-nama').textContent = nama;
    $('o-sekolah').textContent = $('d-sekolah').value.trim();
    setTab('akun');
  } catch(err) {
    $('m-daftar').textContent = 'Pendaftaran gagal: ' + err.message;
    $('m-daftar').className = 'msg err show';
  } finally {
    btn.disabled = false; btn.textContent = 'Dapatkan Akun & Mulai Ujian';
  }
};

// 2. UNDUH KARTU KE GALERI HP
$('b-unduh-kartu').onclick = function(){
  var canvas = document.createElement('canvas');
  canvas.width = 900; canvas.height = 560;
  var ctx = canvas.getContext('2d');

  ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, 900, 560);
  ctx.lineWidth = 4; ctx.strokeStyle = '#0B5FAD'; ctx.strokeRect(16, 16, 868, 528);

  ctx.fillStyle = '#0A1628'; ctx.fillRect(20, 20, 860, 110);
  ctx.fillStyle = '#22D3F5'; ctx.font = 'bold 15px sans-serif'; ctx.fillText('TES KEMAMPUAN AKADEMIK (TKA) 2026/2027', 48, 55);
  ctx.fillStyle = '#FFFFFF'; ctx.font = '900 26px sans-serif'; ctx.fillText('MTs MUHAMMADIYAH DONOREJO', 48, 92);
  ctx.fillStyle = '#9FB3CC'; ctx.font = '14px sans-serif'; ctx.fillText('Future Leaders School · www.mtsmdonorejo.sch.id', 48, 115);

  ctx.fillStyle = '#EFF6FF'; ctx.fillRect(48, 150, 804, 40);
  ctx.fillStyle = '#0B5FAD'; ctx.font = 'bold 15px sans-serif'; ctx.fillText('KARTU RESMI PESERTA UJIAN', 64, 175);

  ctx.fillStyle = '#5A6B82'; ctx.font = 'bold 13px sans-serif'; ctx.fillText('NAMA LENGKAP SISWA', 48, 225);
  ctx.fillStyle = '#0A1628'; ctx.font = 'bold 22px sans-serif'; ctx.fillText(akunAktif.nama || '-', 48, 255);

  ctx.fillStyle = '#5A6B82'; ctx.font = 'bold 13px sans-serif'; ctx.fillText('ASAL SEKOLAH DASAR / MI', 48, 305);
  ctx.fillStyle = '#0A1628'; ctx.font = 'bold 20px sans-serif'; ctx.fillText(akunAktif.sekolah || '-', 48, 335);

  ctx.fillStyle = '#F4F8FC'; ctx.fillRect(48, 370, 390, 100);
  ctx.strokeStyle = '#93C5FD'; ctx.lineWidth = 2; ctx.strokeRect(48, 370, 390, 100);
  ctx.fillStyle = '#5A6B82'; ctx.font = 'bold 13px sans-serif'; ctx.fillText('USERNAME', 68, 400);
  ctx.fillStyle = '#0B5FAD'; ctx.font = 'bold 26px monospace'; ctx.fillText(akunAktif.u || '-', 68, 442);

  ctx.fillStyle = '#F4F8FC'; ctx.fillRect(462, 370, 390, 100); ctx.strokeRect(462, 370, 390, 100);
  ctx.fillStyle = '#5A6B82'; ctx.font = 'bold 13px sans-serif'; ctx.fillText('PASSWORD', 482, 400);
  ctx.fillStyle = '#0A1628'; ctx.font = 'bold 26px monospace'; ctx.fillText(akunAktif.p || '-', 482, 442);

  var link = document.createElement('a');
  link.download = 'Kartu-Peserta-TKA-' + (akunAktif.u || 'siswa') + '.png';
  link.href = canvas.toDataURL('image/png');
  link.click();
};

// 3. LOGIN
$('f-masuk').onsubmit = async function(e){
  e.preventDefault();
  $('m-masuk').className = 'msg err'; $('m-masuk').textContent = '';
  var btn = $('b-masuk'); btn.disabled = true; btn.textContent = 'Memeriksa…';

  try {
    var resp = await fetch(GAS_URL, {
      method: 'POST',
      body: JSON.stringify({ action: 'login', username: $('u-user').value.trim(), password: $('u-pass').value.trim() })
    });
    var res = await resp.json();
    if(!res.ok) throw new Error(res.msg);

    try { localStorage.setItem('tka_user', JSON.stringify(res.data)); } catch(e){}
    window.location.href = 'https://www.mtsmdonorejo.sch.id/tka/tryout.html';
  } catch(err) {
    $('m-masuk').textContent = err.message;
    $('m-masuk').className = 'msg err show';
  } finally {
    btn.disabled = false; btn.textContent = 'Masuk ke Ruang Tryout';
  }
};

// 4. LEADERBOARD
async function muatLeaderboard(){
  var tbody = $('lb-body');
  tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:20px;color:var(--muted)">Memuat data…</td></tr>';
  try {
    var resp = await fetch(GAS_URL + '?action=get_leaderboard');
    var res = await resp.json();
    if(!res.ok || !res.data || res.data.length === 0){
      tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:20px;color:var(--muted)">Belum ada data pengerjaan.</td></tr>';
      return;
    }
    var html = '';
    res.data.forEach(function(item, idx){
      html += '<tr><td><b>' + (idx+1) + '</b></td><td>' + item.nama + '</td><td>' + item.sekolah + '</td><td style="text-align:right;font-weight:800;color:var(--blue)">' + item.skor + '</td></tr>';
    });
    tbody.innerHTML = html;
  } catch(e){
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:20px;color:var(--danger)">Gagal memuat peringkat.</td></tr>';
  }
}
</script>
</body>
</html>`;

  return HtmlService.createHtmlOutput(html)
    .setTitle(title)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// -------------------------------------------------------------------------
// HELPER TAB PENGATURAN & RESPONSE
// -------------------------------------------------------------------------
function bacaPengaturanWeb() {
  let sheet = SPREADSHEET.getSheetByName('pengaturan');
  if (!sheet) {
    sheet = SPREADSHEET.insertSheet('pengaturan');
    sheet.appendRow(['kunci', 'nilai']);
    sheet.appendRow(['kontak_wa', '6288232078761']);
    sheet.appendRow(['spmb_status', 'BUKA']);
    sheet.appendRow(['pesan_wa', 'Assalamualaikum, saya ingin bertanya tentang SPMB MTs Muhammadiyah Donorejo']);
    sheet.appendRow(['pengumuman_aktif', 'true']);
    sheet.appendRow(['pengumuman_teks', 'Penerimaan Peserta Didik Baru (SPMB) Telah Dibuka! Ikuti Tryout TKA Online Berhadiah Beasiswa.']);
    sheet.appendRow(['pengumuman_link', 'tka/']);
  }

  const rows = sheet.getDataRange().getValues().slice(1);
  const cfg = {};
  rows.forEach(r => {
    if (r[0]) cfg[String(r[0]).trim()] = r[1];
  });

  return {
    kontak_wa: String(cfg.kontak_wa || '6288232078761'),
    spmb_status: String(cfg.spmb_status || 'BUKA'),
    pesan_wa: String(cfg.pesan_wa || ''),
    pengumuman_aktif: String(cfg.pengumuman_aktif).toLowerCase() === 'true',
    pengumuman_teks: String(cfg.pengumuman_teks || ''),
    pengumuman_link: String(cfg.pengumuman_link || 'tka/')
  };
}

function simpanKunciPengaturan(kunci, nilai) {
  let sheet = SPREADSHEET.getSheetByName('pengaturan');
  if (!sheet) {
    bacaPengaturanWeb();
    sheet = SPREADSHEET.getSheetByName('pengaturan');
  }

  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === kunci) {
      sheet.getRange(i + 1, 2).setValue(nilai);
      return;
    }
  }
  sheet.appendRow([kunci, nilai]);
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
