/**
 * =========================================================================
 * GOOGLE APPS SCRIPT - SISTEM TKA FLEKSIBEL (HYBRID)
 * MTs MUHAMMADIYAH DONOREJO (Future Leaders School)
 * =========================================================================
 * BISA DIAKSES LEWAT 2 JALUR:
 * 1. Lewat Link Apps Script Langsung:
 *    - Pendaftaran & Leaderboard : .../exec
 *    - Ruang Ujian CBT           : .../exec?p=tryout
 *    - Panel Admin               : .../exec?p=admin
 * 2. Lewat Domain Resmi Madrasah (www.mtsmdonorejo.sch.id):
 *    - Bertindak sebagai API database JSON otomatis
 * =========================================================================
 */

const SPREADSHEET = SpreadsheetApp.getActiveSpreadsheet();
const ADMIN_PIN_SECRET = "1912";
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwnlTp7bp3lGVFDAp0JUAcHWQbiC45leHYNX4dxcY6HyuzlH7YIYR8T3v8UYAO2krjc/exec";

// -------------------------------------------------------------------------
// 1. ENDPOINT GET (API DATA ATAU RENDER TAMPILAN WEB)
// -------------------------------------------------------------------------
function doGet(e) {
  try {
    const p = e.parameter || {};
    const action = p.action;
    const now = new Date();

    // JIKA TIDAK ADA ACTION -> TAMPILKAN HALAMAN WEB VISUAL SECARA LANGSUNG
    if (!action) {
      const page = p.p || p.page || '';
      return renderTampilanWeb(page);
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
// 3. RENDER TAMPILAN WEB STANDALONE (BISA DIAKSES LEWAT LINK APPS SCRIPT)
// -------------------------------------------------------------------------
function renderTampilanWeb(page) {
  let judul = "Tryout TKA — MTs Muhammadiyah Donorejo";
  let targetUrl = "https://www.mtsmdonorejo.sch.id/tka/";

  if (page === 'admin') {
    judul = "Portal Admin & Kepala Sekolah — MTs Donorejo";
    targetUrl = "https://www.mtsmdonorejo.sch.id/admin/";
  } else if (page === 'tryout') {
    judul = "Ruang Ujian CBT — MTs Donorejo";
    targetUrl = "https://www.mtsmdonorejo.sch.id/tka/tryout.html";
  }

  // Tampilan pengalihan otomatis elegan yang bekerja di HP maupun laptop
  const html = `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${judul}</title>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;700;800&display=swap" rel="stylesheet">
<style>
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0A1628;color:#fff;font-family:'Plus Jakarta Sans',sans-serif;text-align:center;padding:24px}
.card{background:#12243D;border:1px solid rgba(255,255,255,.12);border-radius:24px;padding:36px;max-width:480px;box-shadow:0 24px 50px rgba(0,0,0,.5)}
.btn{display:inline-flex;align-items:center;justify-content:center;height:52px;padding:0 28px;border-radius:999px;font-weight:700;font-size:1rem;background:#22D3F5;color:#0A1628;text-decoration:none;margin-top:20px;transition:.2s}
.btn:hover{background:#0B5FAD;color:#fff}
.spin{width:36px;height:36px;border:3px solid rgba(255,255,255,.15);border-top-color:#22D3F5;border-radius:50%;margin:16px auto;animation:sp .8s linear infinite}
@keyframes sp{to{transform:rotate(360deg)}}
</style>
</head>
<body>
<div class="card">
  <div style="font-size:2rem">🏫</div>
  <h2 style="margin:12px 0 6px">${judul}</h2>
  <p style="color:#9FB3CC;font-size:.9rem;line-height:1.5">Membuka portal resmi madrasah secara aman…</p>
  <div class="spin"></div>
  <a href="${targetUrl}" class="btn" id="btn-lanjut">Buka Halaman Sekarang →</a>
</div>
<script>
setTimeout(function(){
  window.top.location.href = "${targetUrl}";
}, 600);
</script>
</body>
</html>`;

  return HtmlService.createHtmlOutput(html)
    .setTitle(judul)
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
