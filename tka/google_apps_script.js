/**
 * =========================================================================
 * GOOGLE APPS SCRIPT - SISTEM WEB LENGKAP & HYBRID MTs MUHAMMADIYAH DONOREJO
 * =========================================================================
 * 1. Default (.../exec)       : Halaman Utama Profil Madrasah Lengkap
 * 2. Tryout (.../exec?p=tka)  : Formulir Pendaftaran & Leaderboard TKA
 * 3. CBT (.../exec?p=tryout)  : Ruang Ujian CBT
 * 4. Admin (.../exec?p=admin) : Panel Admin & Kepala Sekolah
 * 5. API Backend              : Menyimpan data ke Google Sheets secara aman
 * =========================================================================
 */

const SPREADSHEET = SpreadsheetApp.getActiveSpreadsheet();
const ADMIN_PIN_SECRET = "1912";
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwnlTp7bp3lGVFDAp0JUAcHWQbiC45leHYNX4dxcY6HyuzlH7YIYR8T3v8UYAO2krjc/exec";

// -------------------------------------------------------------------------
// 1. ENDPOINT GET (API ATAU RENDER TAMPILAN WEB)
// -------------------------------------------------------------------------
function doGet(e) {
  try {
    const p = e.parameter || {};
    const action = p.action;
    const now = new Date();

    // JIKA TIDAK ADA ACTION -> TAMPILKAN WEB VISUAL
    if (!action) {
      const page = p.p || p.page || '';
      if (page === 'tka') return renderHalamanTKA();
      return renderHalamanDepan();
    }

    // A. AMBIL PENGATURAN WEB
    if (action === 'get_pengaturan_web') {
      return jsonResponse({ ok: true, data: bacaPengaturanWeb() });
    }

    // B. AMBIL SOAL & CEK JADWAL TRYOUT
    if (action === 'get_tryout') {
      const sheetT = SPREADSHEET.getSheetByName('tryout');
      if (!sheetT) return jsonResponse({ ok: false, msg: 'Tab tryout belum ada.' });

      const dataT = sheetT.getDataRange().getValues().slice(1);
      const t = dataT.find(r => r[5] === true || String(r[5]).toUpperCase() === 'TRUE');
      if (!t) return jsonResponse({ ok: false, msg: 'Saat ini belum ada tryout yang dibuka.' });

      const waktuBuka = t[3] ? new Date(t[3]) : null;
      const waktuTutup = t[4] ? new Date(t[4]) : null;

      if (waktuBuka && !isNaN(waktuBuka.getTime()) && now < waktuBuka) {
        return jsonResponse({
          ok: false,
          msg: 'Tryout baru dibuka pada: ' + Utilities.formatDate(waktuBuka, "GMT+7", "dd MMM yyyy, HH:mm") + ' WIB'
        });
      }
      if (waktuTutup && !isNaN(waktuTutup.getTime()) && now > waktuTutup) {
        return jsonResponse({
          ok: false,
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
          opsi: { A: String(r[5] || ''), B: String(r[6] || ''), C: String(r[7] || ''), D: String(r[8] || '') }
        }));

      return jsonResponse({
        ok: true,
        data: {
          id: tryoutId,
          judul: t[1],
          durasi_menit: Number(t[2]) || 60,
          soal: soalList,
          server_time: now.toISOString()
        }
      });
    }

    // C. LEADERBOARD TOP 50
    if (action === 'get_leaderboard') {
      const sheetP = SPREADSHEET.getSheetByName('percobaan');
      const sheetU = SPREADSHEET.getSheetByName('peserta');
      if (!sheetP || !sheetU) return jsonResponse({ ok: false, msg: 'Tabel database belum siap.' });

      const dataP = sheetP.getDataRange().getValues().slice(1);
      const dataU = sheetU.getDataRange().getValues().slice(1);

      const userMap = {};
      dataU.forEach(u => {
        userMap[String(u[0])] = { nama: String(u[3] || 'Peserta'), sekolah: String(u[7] || '-') };
      });

      const leaderboard = dataP
        .filter(r => r[4] !== '')
        .map(r => {
          const u = userMap[String(r[1])] || { nama: 'Peserta', sekolah: '-' };
          return {
            nama: u.nama, sekolah: u.sekolah,
            skor: Number(r[8]) || 0, benar: Number(r[7]) || 0, total: Number(r[9]) || 0,
            durasi_detik: Number(r[5]) || 0, selesai_at: r[4]
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
      if (p.pin !== ADMIN_PIN_SECRET) return jsonResponse({ ok: false, msg: 'PIN salah!' });

      const sheetT = SPREADSHEET.getSheetByName('tryout');
      const sheetU = SPREADSHEET.getSheetByName('peserta');
      const sheetP = SPREADSHEET.getSheetByName('percobaan');

      const dataT = sheetT ? sheetT.getDataRange().getValues().slice(1) : [];
      const dataU = sheetU ? sheetU.getDataRange().getValues().slice(1) : [];
      const dataP = sheetP ? sheetP.getDataRange().getValues().slice(1) : [];

      const tryoutAktif = dataT.find(r => r[5] === true || String(r[5]).toUpperCase() === 'TRUE') || dataT[0] || [];

      const attemptMap = {};
      dataP.forEach(r => {
        attemptMap[String(r[1])] = { selesai_at: r[4], durasi_detik: r[5], benar: r[7], skor: r[8], total: r[9] };
      });

      const sebaranSekolah = {};
      let totalSelesai = 0, totalSkor = 0;

      const pesertaList = dataU.map(u => {
        const idUser = String(u[0]);
        const att = attemptMap[idUser] || null;
        const sekolah = String(u[7] || 'Lainnya').trim();
        sebaranSekolah[sekolah] = (sebaranSekolah[sekolah] || 0) + 1;
        if (att && att.selesai_at) { totalSelesai++; totalSkor += Number(att.skor) || 0; }
        return {
          id: idUser, username: u[1], password: u[2], nama: u[3], nama_ortu: u[4],
          no_wa: u[5], alamat: u[6], nama_sekolah: sekolah, created_at: u[8], hasil: att
        };
      });

      return jsonResponse({
        ok: true,
        data: {
          tryout: {
            id: tryoutAktif[0] || '', judul: tryoutAktif[1] || '', durasi_menit: tryoutAktif[2] || 60,
            waktu_buka: tryoutAktif[3] || '', waktu_tutup: tryoutAktif[4] || '',
            aktif: tryoutAktif[5] === true || String(tryoutAktif[5]).toUpperCase() === 'TRUE'
          },
          kpi: {
            total_pendaftar: dataU.length, total_mengerjakan: totalSelesai,
            rata_rata_skor: totalSelesai > 0 ? (totalSkor / totalSelesai).toFixed(1) : '0',
            total_sekolah: Object.keys(sebaranSekolah).length
          },
          pengaturan_web: bacaPengaturanWeb(),
          sebaran_sekolah: sebaranSekolah,
          peserta: pesertaList
        }
      });
    }

    return jsonResponse({ ok: false, msg: 'Aksi tidak dikenal.' });
  } catch (err) {
    return jsonResponse({ ok: false, msg: err.toString() });
  }
}

// -------------------------------------------------------------------------
// 2. ENDPOINT POST (LOCKSERVICE ANTI TABRAKAN DATA)
// -------------------------------------------------------------------------
function doPost(e) {
  const lock = LockService.getScriptLock();
  try { lock.waitLock(15000); } catch(e) {
    return jsonResponse({ ok: false, msg: 'Server sibuk, silakan coba 5 detik lagi.' });
  }

  try {
    const raw = e.postData && e.postData.contents ? e.postData.contents : '{}';
    const body = JSON.parse(raw);
    const action = body.action;

    // DAFTAR
    if (action === 'daftar') {
      const d = body.data || {};
      const sheet = SPREADSHEET.getSheetByName('peserta');
      if (!sheet) return jsonResponse({ ok: false, msg: 'Tab peserta belum dibuat.' });

      const id = Utilities.getUuid();
      const now = new Date();

      sheet.appendRow([
        id, String(d.username).trim().toLowerCase(), String(d.password).trim(),
        String(d.nama).trim(), String(d.nama_ortu).trim(), "'" + String(d.no_wa).trim(),
        String(d.alamat).trim(), String(d.nama_sekolah).trim(),
        Utilities.formatDate(now, "GMT+7", "yyyy-MM-dd HH:mm:ss")
      ]);

      return jsonResponse({ ok: true, data: { id: id, username: d.username, password: d.password, nama: d.nama } });
    }

    // LOGIN
    if (action === 'login') {
      const u = String(body.username || '').trim().toLowerCase();
      const p = String(body.password || '').trim();
      const sheet = SPREADSHEET.getSheetByName('peserta');
      const rows = sheet.getDataRange().getValues().slice(1);
      const user = rows.find(r => String(r[1]).toLowerCase() === u && String(r[2]) === p);
      if (!user) return jsonResponse({ ok: false, msg: 'Username atau Password salah.' });

      return jsonResponse({ ok: true, data: { id: String(user[0]), username: String(user[1]), nama: String(user[3]), sekolah: String(user[7]) } });
    }

    // MULAI TRYOUT
    if (action === 'mulai_tryout') {
      const sheetP = SPREADSHEET.getSheetByName('percobaan');
      const rowsP = sheetP.getDataRange().getValues().slice(1);
      const existing = rowsP.find(r => String(r[1]) === String(body.peserta_id) && String(r[2]) === String(body.tryout_id));
      if (existing) return jsonResponse({ ok: true, data: { id: String(existing[0]), mulai_at: existing[3], selesai_at: existing[4] } });

      const id = Utilities.getUuid();
      const mulai = new Date().toISOString();
      sheetP.appendRow([id, body.peserta_id, body.tryout_id, mulai, '', '', '{}', 0, 0, 0]);
      return jsonResponse({ ok: true, data: { id: id, mulai_at: mulai, selesai_at: '' } });
    }

    // SELESAI TRYOUT
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
        if (String(jawaban[idSoal] || '').trim().toUpperCase() === kunci) benar++;
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

      return jsonResponse({ ok: true, data: { benar: benar, total: total, skor: skor, selesai_at: selesai.toISOString() } });
    }

    // PENGATURAN TRYOUT
    if (action === 'admin_toggle_tryout') {
      if (body.pin !== ADMIN_PIN_SECRET) return jsonResponse({ ok: false, msg: 'PIN tidak sah!' });
      const sheetT = SPREADSHEET.getSheetByName('tryout');
      sheetT.getRange(2, 6).setValue(body.aktif === true);
      if (body.durasi_menit) sheetT.getRange(2, 3).setValue(Number(body.durasi_menit));
      if (body.waktu_buka) sheetT.getRange(2, 4).setValue(body.waktu_buka);
      if (body.waktu_tutup) sheetT.getRange(2, 5).setValue(body.waktu_tutup);
      return jsonResponse({ ok: true, msg: 'Pengaturan tryout berhasil disimpan!' });
    }

    return jsonResponse({ ok: false, msg: 'Aksi tidak valid.' });
  } catch (err) {
    return jsonResponse({ ok: false, msg: err.toString() });
  } finally {
    try { lock.releaseLock(); } catch(e){}
  }
}

// -------------------------------------------------------------------------
// 3. RENDER HALAMAN UTAMA PROFIL MADRASAH (DEFAULT KETIKA BUKA .../exec)
// -------------------------------------------------------------------------
function renderHalamanDepan() {
  const html = `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>MTs Muhammadiyah Donorejo — Future Leaders School</title>
<meta name="description" content="Tempat anak tumbuh dengan ilmu, karakter, Al-Qur'an, dan keberanian untuk melangkah lebih jauh. SPMB MTs Muhammadiyah Donorejo.">
<link rel="icon" type="image/png" href="https://www.mtsmdonorejo.sch.id/logo.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:ital,wght@0,200..800;1,400..700&display=swap" rel="stylesheet">
<style>
:root{
  --ink:#0A1628; --ink-2:#12243D; --blue:#0B5FAD; --blue-deep:#084A88; --cyan:#22D3F5;
  --paper:#F5F8FC; --white:#FFFFFF; --line:#DCE5F0; --line-dark:rgba(255,255,255,.14);
  --muted:#5A6B82; --muted-dark:#9FB3CC;
  --font:'Plus Jakarta Sans','Segoe UI',system-ui,sans-serif;
  --wrap:1200px; --gut:clamp(20px,5vw,64px); --sec:clamp(88px,11vw,160px);
  --r-s:14px; --r-m:22px; --r-l:32px;
}
*,*::before,*::after{box-sizing:border-box}
html{scroll-behavior:smooth;-webkit-text-size-adjust:100%}
body{margin:0;font-family:var(--font);background:var(--white);color:var(--ink);font-size:17px;line-height:1.6;-webkit-font-smoothing:antialiased;overflow-x:hidden}
img{max-width:100%;display:block}
a{color:inherit;text-decoration:none}
button{font:inherit;cursor:pointer;border:0;background:none;color:inherit}
.wrap{width:100%;max-width:var(--wrap);margin:0 auto;padding:0 var(--gut)}
.section{padding:var(--sec) 0}

.display{font-size:clamp(2.7rem,8.2vw,6.1rem);line-height:.98;font-weight:800;letter-spacing:-.045em;margin:0}
.h2{font-size:clamp(2.1rem,5.4vw,3.9rem);line-height:1.03;font-weight:800;letter-spacing:-.038em;margin:0}
.h3{font-size:clamp(1.25rem,2.2vw,1.6rem);line-height:1.2;font-weight:700;letter-spacing:-.02em;margin:0}
.lead{font-size:clamp(1.05rem,1.55vw,1.28rem);line-height:1.62;color:var(--muted);max-width:46ch;margin:0}
.on-dark .lead,.lead.on-dark{color:var(--muted-dark)}

.tag{display:inline-flex;align-items:center;gap:9px;font-size:.83rem;font-weight:600;letter-spacing:.01em;color:var(--blue)}
.tag::before{content:"";width:7px;height:7px;border-radius:50%;background:var(--cyan);flex:none;box-shadow:0 0 0 4px rgba(34,211,245,.18)}
.on-dark .tag{color:#BFE9F8}

.btn{display:inline-flex;align-items:center;justify-content:center;gap:10px;height:56px;padding:0 30px;border-radius:999px;font-weight:700;font-size:1rem;transition:.2s;white-space:nowrap}
.btn-primary{background:var(--blue);color:#fff;box-shadow:0 10px 24px -10px rgba(11,95,173,.75)}
.btn-primary:hover{background:var(--blue-deep);transform:translateY(-2px)}
.btn-glow{background:var(--cyan);color:var(--ink);box-shadow:0 12px 34px -12px rgba(34,211,245,.85)}
.btn-glow:hover{transform:translateY(-2px)}
.btn-ghost{border:1.5px solid var(--line);color:var(--ink);background:#fff}
.btn-ghost:hover{border-color:var(--ink);transform:translateY(-2px)}
.btn-ghost-dark{border:1.5px solid var(--line-dark);color:#fff}
.btn-ghost-dark:hover{border-color:#fff;background:rgba(255,255,255,.07)}
.btn-sm{height:46px;padding:0 22px;font-size:.94rem}

.nav{position:fixed;top:0;left:0;right:0;z-index:80;background:rgba(10,22,40,.85);backdrop-filter:blur(18px);box-shadow:0 1px 0 var(--line-dark)}
.nav-in{height:78px;display:flex;align-items:center;justify-content:space-between;gap:24px}
.brand{display:flex;align-items:center;gap:12px;color:#fff}
.brand-name{font-weight:800;font-size:.96rem;letter-spacing:-.02em}
.brand-sub{font-size:.73rem;font-weight:500;opacity:.72}
.nav-links{display:flex;align-items:center;gap:34px}
.nav-links a{font-size:.95rem;font-weight:600;color:rgba(255,255,255,.82);transition:.2s}
.nav-links a:hover{color:#fff}

.hero{position:relative;overflow:hidden;background:var(--ink);color:#fff;padding:clamp(140px,17vw,190px) 0 0}
.hero-cta{display:flex;flex-wrap:wrap;gap:14px;margin-top:40px}

.strip{position:relative;z-index:2;margin-top:clamp(56px,7vw,86px);display:grid;grid-template-columns:1.25fr 1fr 1fr;gap:16px;padding-bottom:clamp(56px,7vw,86px)}
.shot{position:relative;border-radius:var(--r-m);overflow:hidden;aspect-ratio:4/3;border:1px solid var(--line-dark);background:#16304F}
.shot:first-child{aspect-ratio:16/11}
.shot-label{position:absolute;inset:auto 0 0 0;padding:16px 18px;font-size:.78rem;font-weight:600;color:#93A9C4;display:flex;align-items:center;gap:8px}
.shot-label::before{content:"";width:16px;height:1.5px;background:var(--cyan);flex:none}

.why{background:var(--white)}
.why-top{display:grid;grid-template-columns:1.08fr .92fr;gap:clamp(32px,6vw,80px);align-items:end}
.triple{display:flex;flex-direction:column;gap:2px;font-size:clamp(1.6rem,3.4vw,2.5rem);font-weight:800;line-height:1.1}
.triple span:nth-child(2){color:var(--blue)}
.triple span:nth-child(3){color:var(--cyan)}
.pillars{margin-top:clamp(52px,6vw,78px);display:grid;grid-template-columns:repeat(4,1fr);gap:18px}
.pillar{border:1px solid var(--line);border-radius:var(--r-m);padding:30px 26px 34px;background:var(--white)}

.program{background:var(--paper)}
.prog-grid{margin-top:clamp(46px,5.5vw,70px);display:grid;grid-template-columns:repeat(3,1fr);gap:18px}
.card{position:relative;overflow:hidden;background:var(--white);border:1px solid var(--line);border-radius:var(--r-l);padding:30px;display:flex;flex-direction:column;min-height:270px}
.card.feature{grid-column:span 2;color:#fff;background:linear-gradient(140deg,var(--blue-deep),var(--ink) 72%);justify-content:flex-end;min-height:340px}

.exp{background:var(--ink);color:#fff;position:relative}
.stage{margin-top:clamp(40px,5vw,64px);position:relative;border-radius:var(--r-l);overflow:hidden;aspect-ratio:16/8;border:1px solid var(--line-dark);background:#14314F}

.alumni{background:var(--white)}
.rail{margin-top:clamp(44px,5vw,66px);display:flex;gap:18px;overflow-x:auto;padding-bottom:18px}
.al{flex:0 0 clamp(230px,26vw,290px)}
.al .face{aspect-ratio:3/4;border-radius:var(--r-m);overflow:hidden;background:#DCE9F6;border:1px solid var(--line)}

.spmb{background:linear-gradient(160deg,var(--blue-deep),var(--ink) 68%);color:#fff;text-align:center;padding:clamp(60px,8vw,100px) 0}
.spmb-cta{display:flex;flex-wrap:wrap;gap:14px;justify-content:center;margin-top:40px}

.foot{background:var(--ink);color:#8FA8C4;padding:44px 0;border-top:1px solid var(--line-dark)}
.foot-in{display:flex;flex-wrap:wrap;gap:20px;justify-content:space-between;align-items:center;font-size:.9rem}

@media(max-width:980px){
  .nav-links{display:none}
  .pillars{grid-template-columns:repeat(2,1fr)}
  .prog-grid{grid-template-columns:1fr}
  .card.feature{grid-column:span 1}
  .strip{grid-template-columns:1fr}
}
</style>
</head>
<body>

<header class="nav" id="nav">
  <div class="wrap nav-in">
    <a class="brand" href="#">
      <img src="https://www.mtsmdonorejo.sch.id/logo.png" alt="Logo" style="width:38px;height:38px;object-fit:contain">
      <div style="display:flex;flex-direction:column;line-height:1.2;margin-left:10px">
        <span class="brand-name">MTs Muhammadiyah Donorejo</span>
        <span class="brand-sub">Future Leaders School</span>
      </div>
    </a>
    <nav class="nav-links">
      <a href="#why">Kenapa kami</a>
      <a href="#program">Program</a>
      <a href="#experience">Pengalaman</a>
      <a href="#alumni">Alumni</a>
      <a href="${SCRIPT_URL}?p=tka" style="color:var(--cyan);font-weight:800">Tryout TKA ✨</a>
    </nav>
    <a class="btn btn-glow btn-sm" href="${SCRIPT_URL}?p=tka">Daftar TKA / SPMB</a>
  </div>
</header>

<!-- 01 HERO -->
<section class="hero on-dark">
  <div class="wrap">
    <span class="tag">Future Leaders School</span>
    <h1 class="display" style="margin-top:18px">Membentuk pemimpin masa depan.</h1>
    <p class="lead" style="margin-top:24px;color:#C6D6EA">Tempat anak tumbuh dengan ilmu, karakter, Al-Qur'an, dan keberanian untuk melangkah lebih jauh.</p>
    <div class="hero-cta">
      <a class="btn btn-glow" href="${SCRIPT_URL}?p=tka">Ikuti Tryout TKA Online →</a>
      <a class="btn btn-ghost-dark" href="#program">Lihat Program Unggulan</a>
    </div>

    <div class="strip">
      <div class="shot">
        <img src="https://www.mtsmdonorejo.sch.id/hero-utama.jpg" alt="Siswa MTs" style="width:100%;height:100%;object-fit:cover">
      </div>
      <div class="shot">
        <img src="https://www.mtsmdonorejo.sch.id/kegiatan-quran.jpg" alt="Kegiatan Qur'ani" style="width:100%;height:100%;object-fit:cover">
      </div>
      <div class="shot">
        <img src="https://www.mtsmdonorejo.sch.id/kemah.jpg" alt="Kemah" style="width:100%;height:100%;object-fit:cover">
        <span class="shot-label">Kemah kepemimpinan</span>
      </div>
    </div>
  </div>
</section>

<!-- 02 WHY US -->
<section class="section why" id="why">
  <div class="wrap">
    <div class="why-top">
      <div>
        <span class="tag">Kenapa kami berbeda</span>
        <h2 class="h2" style="margin-top:16px">Setiap anak punya potensi.</h2>
      </div>
      <div>
        <p class="lead">Kami percaya setiap anak memiliki kelebihan yang berbeda. Karena itu, mereka perlu:</p>
        <div class="triple" style="margin-top:20px">
          <span>Dikenal.</span><span>Didampingi.</span><span>Diarahkan.</span>
        </div>
      </div>
    </div>

    <div class="pillars">
      <article class="pillar">
        <h3 class="h3">Pendampingan personal</h3>
        <p>Setiap anak diperhatikan dan didampingi secara terarah.</p>
      </article>
      <article class="pillar">
        <h3 class="h3">Karakter & Kepemimpinan</h3>
        <p>Disiplin, tanggung jawab, percaya diri, dan kepemimpinan.</p>
      </article>
      <article class="pillar">
        <h3 class="h3">Akademik Kuat</h3>
        <p>Belajar dengan target jelas dan kesiapan masa depan.</p>
      </article>
      <article class="pillar">
        <h3 class="h3">Al-Qur'an & Karakter</h3>
        <p>Membangun kebiasaan Islami dan dekat dengan Al-Qur'an.</p>
      </article>
    </div>
  </div>
</section>

<!-- 03 PROGRAM -->
<section class="section program" id="program">
  <div class="wrap">
    <span class="tag">Program</span>
    <h2 class="h2" style="margin-top:16px">Bukan sekadar belajar.</h2>
    <div class="prog-grid">
      <article class="card feature">
        <img src="https://www.mtsmdonorejo.sch.id/p3q.png" alt="P3Q" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover">
        <div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(10,22,40,.05) 25%,rgba(10,22,40,.9) 100%)"></div>
        <span class="k" style="color:var(--cyan);position:relative">P3Q</span>
        <h3 class="h3" style="position:relative">Pembiasaan Pagi Pemimpin Qurani</h3>
        <p style="position:relative;color:#C6D6EA">Memulai hari dengan Al-Qur'an, ibadah, dan pembiasaan karakter.</p>
      </article>
      <article class="card">
        <span class="k" style="color:var(--blue);font-weight:700">TKA & Akademik</span>
        <h3 class="h3">Belajar dengan tujuan.</h3>
        <p style="color:var(--muted)">Membangun kemampuan akademik dan kesiapan menghadapi masa depan.</p>
      </article>
    </div>
  </div>
</section>

<!-- 04 SPMB -->
<section class="section spmb">
  <div class="wrap">
    <span class="tag" style="color:#BFE9F8">SPMB MTs Muhammadiyah Donorejo</span>
    <h2 class="h2" style="margin-top:16px">Masa depan dimulai dari pilihan hari ini.</h2>
    <p style="margin:20px auto 0;max-width:44ch;color:#C6D6EA">Pilih tempat anak belajar. Pilih tempat mereka tumbuh. Pilih tempat mereka mulai belajar memimpin.</p>
    <div class="spmb-cta">
      <a class="btn btn-glow" href="${SCRIPT_URL}?p=tka">Daftar Tryout TKA Online</a>
      <a class="btn btn-ghost-dark" href="https://wa.me/6288232078761?text=Assalamualaikum%2C%20saya%20ingin%20bertanya%20tentang%20SPMB%20MTs%20Muhammadiyah%20Donorejo" target="_blank">Hubungi Kami via WhatsApp</a>
    </div>
  </div>
</section>

<footer class="foot">
  <div class="wrap foot-in">
    <div><b>MTs Muhammadiyah Donorejo</b> · Future Leaders School</div>
    <a href="https://www.mtsmdonorejo.sch.id" target="_blank" style="color:var(--cyan);text-decoration:underline">Kunjungi Website Resmi ↗</a>
  </div>
</footer>

</body>
</html>`;

  return HtmlService.createHtmlOutput(html)
    .setTitle("MTs Muhammadiyah Donorejo — Future Leaders School")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// -------------------------------------------------------------------------
// 4. RENDER HALAMAN PENDAFTARAN & LEADERBOARD TKA (AKSES: .../exec?p=tka)
// -------------------------------------------------------------------------
function renderHalamanTKA() {
  const html = `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Pendaftaran & Tryout TKA — MTs Muhammadiyah Donorejo</title>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
:root{
  --ink:#0A1628; --blue:#0B5FAD; --blue-deep:#084A88; --cyan:#22D3F5;
  --paper:#F4F8FC; --line:#DCE5F0; --muted:#5A6B82; --ok:#067647; --danger:#B42318;
  --font:'Plus Jakarta Sans',sans-serif;
}
*,*::before,*::after{box-sizing:border-box}
body{margin:0;min-height:100vh;font-family:var(--font);background:var(--ink);color:#fff;line-height:1.6}
a{color:inherit;text-decoration:none}
button{font:inherit;cursor:pointer;border:0;background:none;color:inherit}

.top{max-width:1100px;margin:0 auto;padding:18px 20px;display:flex;align-items:center;justify-content:space-between}
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
  <div>
    <b>MTs Muhammadiyah Donorejo</b>
    <div style="font-size:.74rem;opacity:.75">Future Leaders School · TKA Online</div>
  </div>
  <div>
    <a href="${SCRIPT_URL}" style="font-size:.85rem;color:var(--cyan);text-decoration:underline">← Kembali ke Beranda</a>
  </div>
</header>

<main class="main">
  <div>
    <div class="tag">SPMB MTs Donorejo 2026/2027</div>
    <h1>Tes Kemampuan Akademik (TKA) Online</h1>
    <p class="lead">Ukur kemampuan akademik calon siswa SD/MI sederajat secara gratis. Dapatkan beasiswa prestasi dan jalur masuk kelas unggulan.</p>
  </div>

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

    <!-- VIEW KARTU -->
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

    <!-- VIEW MASUK -->
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
          <tbody id="lb-body"><tr><td colspan="4" style="text-align:center;padding:20px;color:var(--muted)">Memuat data…</td></tr></tbody>
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

// DAFTAR
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

// UNDUH KARTU
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

// LOGIN
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

// LEADERBOARD
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
    .setTitle("Pendaftaran & Tryout TKA — MTs Muhammadiyah Donorejo")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// -------------------------------------------------------------------------
// HELPER TAB PENGATURAN & RESPONSE JSON
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

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
