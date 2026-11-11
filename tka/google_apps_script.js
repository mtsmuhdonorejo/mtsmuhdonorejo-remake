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
/* ============================================================
   MTs MUHAMMADIYAH DONOREJO — Future Leaders School
   Single file: HTML + CSS + JS
   Ganti bagian bertanda [ASET] dengan foto/video asli.
   ============================================================ */

:root{
  --ink:#0A1628;
  --ink-2:#12243D;
  --blue:#0B5FAD;
  --blue-deep:#084A88;
  --cyan:#22D3F5;
  --paper:#F5F8FC;
  --white:#FFFFFF;
  --line:#DCE5F0;
  --line-dark:rgba(255,255,255,.14);
  --muted:#5A6B82;
  --muted-dark:#9FB3CC;

  --font:'Plus Jakarta Sans','Segoe UI',system-ui,-apple-system,sans-serif;

  --wrap:1200px;
  --gut:clamp(20px,5vw,64px);
  --sec:clamp(88px,11vw,160px);
  --r-s:14px;
  --r-m:22px;
  --r-l:32px;
}

*,*::before,*::after{box-sizing:border-box}
html{scroll-behavior:smooth;-webkit-text-size-adjust:100%}
body{
  margin:0;
  font-family:var(--font);
  background:var(--white);
  color:var(--ink);
  font-size:17px;
  line-height:1.6;
  -webkit-font-smoothing:antialiased;
  overflow-x:hidden;
}
img{max-width:100%;display:block}
a{color:inherit;text-decoration:none}
button{font:inherit;cursor:pointer;border:0;background:none;color:inherit}

:focus-visible{outline:3px solid var(--cyan);outline-offset:3px;border-radius:4px}

.wrap{width:100%;max-width:var(--wrap);margin:0 auto;padding:0 var(--gut)}
.section{padding:var(--sec) 0}

/* ---------- type scale ---------- */
.display{
  font-size:clamp(2.7rem,8.2vw,6.1rem);
  line-height:.98;
  font-weight:800;
  letter-spacing:-.045em;
  margin:0;
}
.h2{
  font-size:clamp(2.1rem,5.4vw,3.9rem);
  line-height:1.03;
  font-weight:800;
  letter-spacing:-.038em;
  margin:0;
}
.h3{
  font-size:clamp(1.25rem,2.2vw,1.6rem);
  line-height:1.2;
  font-weight:700;
  letter-spacing:-.02em;
  margin:0;
}
.lead{
  font-size:clamp(1.05rem,1.55vw,1.28rem);
  line-height:1.62;
  color:var(--muted);
  max-width:46ch;
  margin:0;
}
.on-dark .lead,.lead.on-dark{color:var(--muted-dark)}

.tag{
  display:inline-flex;align-items:center;gap:9px;
  font-size:.83rem;font-weight:600;letter-spacing:.01em;
  color:var(--blue);
}
.tag::before{
  content:"";width:7px;height:7px;border-radius:50%;
  background:var(--cyan);flex:none;
  box-shadow:0 0 0 4px rgba(34,211,245,.18);
}
.on-dark .tag{color:#BFE9F8}

/* ---------- buttons ---------- */
.btn{
  display:inline-flex;align-items:center;justify-content:center;gap:10px;
  height:56px;padding:0 30px;border-radius:999px;
  font-weight:700;font-size:1rem;letter-spacing:-.01em;
  transition:transform .18s ease,box-shadow .22s ease,background .2s ease,color .2s ease;
  white-space:nowrap;
}
.btn-primary{
  background:var(--blue);color:#fff;
  box-shadow:0 10px 24px -10px rgba(11,95,173,.75);
}
.btn-primary:hover{background:var(--blue-deep);transform:translateY(-2px);box-shadow:0 16px 30px -12px rgba(11,95,173,.85)}
.btn-glow{background:var(--cyan);color:var(--ink);box-shadow:0 12px 34px -12px rgba(34,211,245,.85)}
.btn-glow:hover{transform:translateY(-2px);box-shadow:0 18px 40px -14px rgba(34,211,245,1)}
.btn-ghost{border:1.5px solid var(--line);color:var(--ink);background:#fff}
.btn-ghost:hover{border-color:var(--ink);transform:translateY(-2px)}
.btn-ghost-dark{border:1.5px solid var(--line-dark);color:#fff}
.btn-ghost-dark:hover{border-color:#fff;background:rgba(255,255,255,.07)}
.btn-sm{height:46px;padding:0 22px;font-size:.94rem}

/* ---------- header ---------- */
.nav{
  position:fixed;top:0;left:0;right:0;z-index:80;
  transition:background .3s ease,box-shadow .3s ease,backdrop-filter .3s ease;
}
.nav-in{
  height:78px;display:flex;align-items:center;justify-content:space-between;gap:24px;
}
.brand{display:flex;align-items:center;gap:12px;color:#fff;transition:color .3s ease}
.mark{
  width:40px;height:40px;border-radius:12px;flex:none;
  background:linear-gradient(145deg,var(--cyan),var(--blue));
  display:grid;place-items:center;
  font-weight:800;color:var(--ink);font-size:1.05rem;letter-spacing:-.04em;
}
.brand-txt{display:flex;flex-direction:column;line-height:1.18}
.brand-name{font-weight:800;font-size:.96rem;letter-spacing:-.02em}
.brand-sub{font-size:.73rem;font-weight:500;opacity:.72}
.nav-links{display:flex;align-items:center;gap:34px}
.nav-links a{font-size:.95rem;font-weight:600;color:rgba(255,255,255,.82);transition:color .2s ease}
.nav-links a:hover{color:#fff}
.nav.solid{background:rgba(255,255,255,.88);backdrop-filter:blur(18px);box-shadow:0 1px 0 var(--line)}
.nav.solid .brand{color:var(--ink)}
.nav.solid .nav-links a{color:var(--muted)}
.nav.solid .nav-links a:hover{color:var(--ink)}
.nav.solid .btn-glow{background:var(--blue);color:#fff;box-shadow:0 10px 24px -12px rgba(11,95,173,.8)}

/* ---------- hero ---------- */
.hero{
  position:relative;overflow:hidden;
  background:var(--ink);color:#fff;
  padding:clamp(140px,17vw,190px) 0 0;
}
.hero::before{
  content:"";position:absolute;inset:-30% -10% auto -10%;height:120%;
  background:
    radial-gradient(45% 55% at 78% 18%,rgba(34,211,245,.30),transparent 65%),
    radial-gradient(50% 60% at 12% 42%,rgba(11,95,173,.55),transparent 68%);
  pointer-events:none;
}
.grid-lines{
  position:absolute;inset:0;pointer-events:none;opacity:.5;
  background-image:linear-gradient(var(--line-dark) 1px,transparent 1px),
                   linear-gradient(90deg,var(--line-dark) 1px,transparent 1px);
  background-size:88px 88px;
  mask-image:radial-gradient(70% 60% at 50% 30%,#000,transparent 78%);
  -webkit-mask-image:radial-gradient(70% 60% at 50% 30%,#000,transparent 78%);
}
.hero-in{position:relative;z-index:2}
.hero h1{margin:18px 0 0;max-width:15ch}
.hero .lead{margin-top:26px;max-width:44ch;color:#C6D6EA;font-size:clamp(1.05rem,1.6vw,1.3rem)}
.hero-cta{display:flex;flex-wrap:wrap;gap:14px;margin-top:40px}

/* photo strip */
.strip{
  position:relative;z-index:2;
  margin-top:clamp(56px,7vw,86px);
  display:grid;grid-template-columns:1.25fr 1fr 1fr;gap:16px;
  padding-bottom:clamp(56px,7vw,86px);
}
.shot{
  position:relative;border-radius:var(--r-m);overflow:hidden;
  aspect-ratio:4/3;
  border:1px solid var(--line-dark);
  background:linear-gradient(150deg,#16304F,#0D1F35);
}
.shot:first-child{aspect-ratio:16/11}
.shot-label{
  position:absolute;inset:auto 0 0 0;padding:16px 18px;
  font-size:.78rem;font-weight:600;color:#93A9C4;
  display:flex;align-items:center;gap:8px;
}
.shot-label::before{content:"";width:16px;height:1.5px;background:var(--cyan);flex:none}

/* ---------- why us ---------- */
.why{background:var(--white)}
.why-top{display:grid;grid-template-columns:1.08fr .92fr;gap:clamp(32px,6vw,80px);align-items:end}
.triple{
  display:flex;flex-direction:column;gap:2px;
  font-size:clamp(1.6rem,3.4vw,2.5rem);font-weight:800;letter-spacing:-.035em;line-height:1.1;
}
.triple span{position:relative;padding-left:0;transition:color .25s ease,transform .25s ease}
.triple span:nth-child(2){color:var(--blue)}
.triple span:nth-child(3){color:var(--cyan)}

.pillars{
  margin-top:clamp(52px,6vw,78px);
  display:grid;grid-template-columns:repeat(4,1fr);gap:18px;
}
.pillar{
  border:1px solid var(--line);border-radius:var(--r-m);
  padding:30px 26px 34px;background:var(--white);
  transition:border-color .25s ease,transform .25s ease,box-shadow .25s ease;
}
.pillar:hover{border-color:#B9D4EC;transform:translateY(-4px);box-shadow:0 22px 40px -28px rgba(10,22,40,.5)}
.pic{width:44px;height:44px;margin-bottom:22px;color:var(--blue)}
.pic svg{width:100%;height:100%;display:block}
.pillar p{margin:10px 0 0;color:var(--muted);font-size:.98rem;line-height:1.58}

/* ---------- program ---------- */
.program{background:var(--paper)}
.prog-head{display:flex;flex-wrap:wrap;gap:28px;justify-content:space-between;align-items:end}
.prog-grid{
  margin-top:clamp(46px,5.5vw,70px);
  display:grid;grid-template-columns:repeat(3,1fr);gap:18px;
}
.card{
  position:relative;overflow:hidden;
  background:var(--white);border:1px solid var(--line);border-radius:var(--r-l);
  padding:30px;display:flex;flex-direction:column;min-height:270px;
  transition:transform .28s ease,box-shadow .28s ease;
}
.card:hover{transform:translateY(-5px);box-shadow:0 28px 50px -34px rgba(10,22,40,.55)}
.card .media{
  margin:-30px -30px 24px;height:170px;
  background:linear-gradient(150deg,#123C67,#0A1628);
  position:relative;
}
.card .media::after{
  content:attr(data-asset);
  position:absolute;left:20px;bottom:16px;
  font-size:.75rem;font-weight:600;color:#8FA8C4;letter-spacing:.01em;
}
.card .k{font-size:.8rem;font-weight:700;color:var(--blue);letter-spacing:.02em;margin-bottom:10px}
.card p{margin:10px 0 0;color:var(--muted);font-size:.97rem;line-height:1.56}
.card.feature{
  grid-column:span 2;color:#fff;
  background:
    radial-gradient(70% 90% at 88% 10%,rgba(34,211,245,.28),transparent 60%),
    linear-gradient(140deg,var(--blue-deep),var(--ink) 72%);
  border-color:transparent;justify-content:flex-end;min-height:340px;
}
.card.feature .k{color:var(--cyan)}
.card.feature p{color:#C6D6EA;max-width:44ch}
.card.feature .h3{font-size:clamp(1.6rem,3vw,2.3rem);letter-spacing:-.035em}

/* ---------- experience ---------- */
.exp{background:var(--ink);color:#fff;position:relative;overflow:hidden}
.exp::before{
  content:"";position:absolute;inset:auto -20% -40% -20%;height:70%;
  background:radial-gradient(50% 60% at 50% 100%,rgba(11,95,173,.55),transparent 70%);
}
.exp-in{position:relative;z-index:2}
.exp-head{max-width:34ch}
.exp-head .h2{letter-spacing:-.045em}
.stage{
  margin-top:clamp(40px,5vw,64px);
  position:relative;border-radius:var(--r-l);overflow:hidden;
  aspect-ratio:16/8;border:1px solid var(--line-dark);
  background:linear-gradient(140deg,#14314F,#08121F);
  display:grid;place-items:center;
}
.stage::after{
  content:"[ASET] Video kemah kepemimpinan";
  position:absolute;left:24px;bottom:20px;
  font-size:.8rem;font-weight:600;color:#8FA8C4;
}
.play{
  width:clamp(74px,8vw,100px);height:clamp(74px,8vw,100px);border-radius:50%;
  background:rgba(255,255,255,.1);backdrop-filter:blur(6px);
  border:1.5px solid rgba(255,255,255,.4);
  display:grid;place-items:center;
  transition:transform .25s ease,background .25s ease;
}
.play:hover{transform:scale(1.07);background:var(--cyan);border-color:var(--cyan)}
.play svg{width:26px;height:26px;fill:#fff;margin-left:4px;transition:fill .25s ease}
.play:hover svg{fill:var(--ink)}
.words{
  margin-top:clamp(40px,5vw,60px);
  display:flex;flex-wrap:wrap;gap:clamp(24px,5vw,70px);align-items:baseline;
  border-top:1px solid var(--line-dark);padding-top:34px;
}
.words b{
  font-size:clamp(1.5rem,3.6vw,2.6rem);font-weight:800;letter-spacing:-.04em;
}
.words b:nth-child(2){color:#7FD9F2}
.words b:nth-child(3){color:var(--cyan)}

/* ---------- alumni ---------- */
.alumni{background:var(--white)}
.al-head{display:grid;grid-template-columns:1.05fr .95fr;gap:clamp(30px,6vw,80px);align-items:end}
.rail{
  margin-top:clamp(44px,5vw,66px);
  display:flex;gap:18px;overflow-x:auto;scroll-snap-type:x mandatory;
  padding-bottom:18px;
  scrollbar-width:thin;scrollbar-color:var(--line) transparent;
}
.rail::-webkit-scrollbar{height:6px}
.rail::-webkit-scrollbar-thumb{background:var(--line);border-radius:99px}
.al{
  flex:0 0 clamp(230px,26vw,290px);scroll-snap-align:start;
}
.al .face{
  aspect-ratio:3/4;border-radius:var(--r-m);overflow:hidden;
  background:linear-gradient(160deg,#DCE9F6,#C3D8EC);
  border:1px solid var(--line);position:relative;
}
.al .face::after{
  content:"[ASET] Foto alumni";
  position:absolute;left:16px;bottom:14px;font-size:.74rem;font-weight:600;color:#6E88A5;
}
.al h4{margin:16px 0 4px;font-size:1.05rem;font-weight:700;letter-spacing:-.02em}
.al span{font-size:.92rem;color:var(--muted)}
.al-close{
  margin-top:clamp(40px,5vw,60px);padding-top:34px;border-top:1px solid var(--line);
  display:flex;flex-wrap:wrap;gap:24px;justify-content:space-between;align-items:center;
}
.al-close p{margin:0;font-size:clamp(1.15rem,2.3vw,1.7rem);font-weight:700;letter-spacing:-.03em;max-width:24ch}

/* ---------- spmb ---------- */
.spmb{
  background:
    radial-gradient(60% 80% at 80% 0%,rgba(34,211,245,.22),transparent 62%),
    linear-gradient(160deg,var(--blue-deep),var(--ink) 68%);
  color:#fff;text-align:center;position:relative;overflow:hidden;
}
.spmb .h2{max-width:18ch;margin:18px auto 0}
.spmb-sub{margin:26px auto 0;max-width:40ch;color:#C6D6EA;font-size:clamp(1rem,1.5vw,1.2rem);line-height:1.7}
.spmb-cta{display:flex;flex-wrap:wrap;gap:14px;justify-content:center;margin-top:40px}
.spmb .tag{justify-content:center}

/* ---------- footer ---------- */
.foot{background:var(--ink);color:#8FA8C4;padding:44px 0;border-top:1px solid var(--line-dark)}
.foot-in{display:flex;flex-wrap:wrap;gap:20px;justify-content:space-between;align-items:center;font-size:.9rem}
.foot .brand{color:#fff}

/* ---------- entrance (hero only) ---------- */
.rise{opacity:0;transform:translateY(22px)}
.ready .rise{opacity:1;transform:none;transition:opacity .7s cubic-bezier(.2,.7,.2,1),transform .7s cubic-bezier(.2,.7,.2,1)}
.ready .d1{transition-delay:.05s}
.ready .d2{transition-delay:.15s}
.ready .d3{transition-delay:.25s}
.ready .d4{transition-delay:.35s}
.ready .d5{transition-delay:.45s}
.pillars > *, .prog-grid > *, .prog-grid .card{ min-width:0 }
/* ---------- responsive ---------- */
@media (max-width:980px){
  .nav-links{display:none}
  .why-top,.al-head{grid-template-columns:1fr;align-items:start}
  .pillars{grid-template-columns:repeat(2,1fr)}
  .prog-grid{grid-template-columns:repeat(2,1fr)}
  .card.feature{grid-column:span 2}
  .strip{grid-template-columns:1fr 1fr}
  .strip .shot:first-child{grid-column:span 2;aspect-ratio:16/9}
}
@media (max-width:620px){
  body{font-size:16px}
  .pillars,.prog-grid{grid-template-columns:1fr}
  .card.feature{grid-column:span 1}
  .strip{grid-template-columns:1fr}
  .strip .shot:first-child{grid-column:span 1}
  .btn{width:100%}
  .hero-cta,.spmb-cta{flex-direction:column}
  .nav .btn{width:auto}
  .stage{aspect-ratio:4/3}
}

@media (prefers-reduced-motion:reduce){
  *{animation:none!important;transition:none!important;scroll-behavior:auto!important}
  .rise{opacity:1;transform:none}
}
</style>
</head>
<body>

<!-- Banner Pengumuman Dinamis -->
<div id="top-announcement" style="display:none;background:linear-gradient(90deg,#084A88,#0B5FAD);color:#fff;padding:9px 16px;text-align:center;font-size:0.86rem;font-weight:600;position:relative;z-index:90">
  <span id="ann-text"></span>
  <a id="ann-link" href="${SCRIPT_URL}?p=tka" style="color:#22D3F5;margin-left:8px;text-decoration:underline">Buka TKA →</a>
</div>

<!-- ============ HEADER ============ -->
<header class="nav" id="nav">
  <div class="wrap nav-in">
    <a class="brand" href="#top">
      <span class="mark" style="background:none;padding:0">
     <img src="https://www.mtsmdonorejo.sch.id/logo.png" alt="Logo MTs Muhammadiyah Donorejo" style="width:100%;height:100%;object-fit:contain">
      </span>
      <span class="brand-txt">
        <span class="brand-name">MTs Muhammadiyah Donorejo</span>
        <span class="brand-sub">Future Leaders School</span>
      </span>
    </a>
    <nav class="nav-links">
      <a href="#why">Kenapa kami</a>
      <a href="#program">Program</a>
      <a href="#experience">Pengalaman</a>
      <a href="#alumni">Alumni</a>
      <a href="${SCRIPT_URL}?p=tka" style="color:var(--cyan);font-weight:700">Tryout TKA ✨</a>
    </nav>
    <a class="btn btn-glow btn-sm" href="${SCRIPT_URL}?p=tka">Daftar TKA / SPMB</a>
  </div>
</header>

<!-- ============ 01 HERO ============ -->
<section class="hero on-dark" id="top">
  <div class="grid-lines"></div>
  <div class="wrap hero-in">
    <span class="tag rise d1">Future Leaders School</span>
    <h1 class="display rise d2">Membentuk pemimpin masa depan.</h1>
    <p class="lead rise d3">Tempat anak tumbuh dengan ilmu, karakter, Al-Qur'an, dan keberanian untuk melangkah lebih jauh.</p>
    <div class="hero-cta rise d4">
      <a class="btn btn-glow" href="#spmb">Daftar sekarang</a>
      <a class="btn btn-ghost-dark" href="#experience">Lihat keseharian mereka</a>
    </div>

    <div class="strip rise d5">
      <div class="shot">
        <img src="https://www.mtsmdonorejo.sch.id/hero-utama.jpg" alt="Siswa MTs Muhammadiyah Donorejo" style="width:100%;height:100%;object-fit:cover">
      </div>
     <div class="shot">
        <img src="https://www.mtsmdonorejo.sch.id/kegiatan-quran.jpg" alt="Kegiatan Qur'ani" style="width:100%;height:100%;object-fit:cover">
      </div>
     <div class="shot">
        <img src="https://www.mtsmdonorejo.sch.id/kemah.jpg" alt="Kemah kepemimpinan" loading="lazy" style="width:100%;height:100%;object-fit:cover">
        <span class="shot-label">Kemah kepemimpinan</span>
      </div>
    </div>
  </div>
</section>

<!-- ============ 02 WHY US ============ -->
<section class="section why" id="why">
  <div class="wrap">
    <div class="why-top">
      <div>
        <span class="tag">Kenapa kami berbeda</span>
        <h2 class="h2" style="margin-top:16px;max-width:13ch">Setiap anak punya potensi.</h2>
      </div>
      <div>
        <p class="lead">Kami percaya setiap anak memiliki kelebihan yang berbeda. Karena itu, mereka perlu:</p>
        <div class="triple" style="margin-top:24px">
          <span>Dikenal.</span>
          <span>Didampingi.</span>
          <span>Diarahkan.</span>
        </div>
      </div>
    </div>

    <div class="pillars">
      <article class="pillar">
        <div class="pic"><svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="24" cy="17" r="8"/><path d="M9 41c2.5-8 8-12 15-12s12.5 4 15 12"/></svg></div>
        <h3 class="h3">Pendampingan personal</h3>
        <p>Setiap anak diperhatikan dan didampingi.</p>
      </article>
      <article class="pillar">
        <div class="pic"><svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M24 5l16 7v12c0 10-7 17-16 19C15 41 8 34 8 24V12z"/><path d="M17 24l5 5 10-10"/></svg></div>
        <h3 class="h3">Karakter &amp; kepemimpinan</h3>
        <p>Disiplin, tanggung jawab, percaya diri, dan jiwa kepemimpinan.</p>
      </article>
      <article class="pillar">
        <div class="pic"><svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 16L24 7l20 9-20 9z"/><path d="M12 21v11c0 4 5.5 7 12 7s12-3 12-7V21"/><path d="M42 17v13"/></svg></div>
        <h3 class="h3">Akademik</h3>
        <p>Belajar dengan target dan arah.</p>
      </article>
      <article class="pillar">
        <div class="pic"><svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M24 14c-4-4-10-5-16-4v25c6-1 12 0 16 4 4-4 10-5 16-4V10c-6-1-12 0-16 4z"/><path d="M24 14v25"/></svg></div>
        <h3 class="h3">Keagamaan &amp; Al-Qur'an</h3>
        <p>Membangun kebiasaan Islami dan dekat dengan Al-Qur'an.</p>
      </article>
    </div>
  </div>
</section>

<!-- ============ 03 PROGRAM ============ -->
<section class="section program" id="program">
  <div class="wrap">
    <div class="prog-head">
      <div>
        <span class="tag">Program</span>
        <h2 class="h2" style="margin-top:16px;max-width:12ch">Bukan sekadar belajar.</h2>
      </div>
      <p class="lead" style="max-width:34ch">Empat hal yang dijalani anak setiap hari di sini.</p>
    </div>

    <div class="prog-grid">
      <article class="card feature">
        <img src="https://www.mtsmdonorejo.sch.id/p3q.png" alt="Pembiasaan Pagi Pemimpin Qurani" loading="lazy" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover">
        <div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(10,22,40,.05) 25%,rgba(10,22,40,.9) 100%)"></div>
        <span class="k" style="position:relative">P3Q</span>
        <h3 class="h3" style="position:relative">Pembiasaan Pagi Pemimpin Qurani</h3>
        <p style="position:relative">Memulai hari dengan Al-Qur'an, ibadah, dan pembiasaan karakter.</p>
      </article>

      <article class="card">
        <div class="media" data-asset="[ASET] Foto mentoring"></div>
        <span class="k">Personal mentoring</span>
        <h3 class="h3">Setiap anak punya perjalanan.</h3>
        <p>Target, proses, dan perkembangan didampingi.</p>
      </article>

      <article class="card">
        <div class="media" data-asset="[ASET] Foto suasana kelas"></div>
        <span class="k">TKA &amp; akademik</span>
        <h3 class="h3">Belajar dengan tujuan.</h3>
        <p>Membangun kemampuan akademik dan kesiapan menghadapi masa depan.</p>
      </article>

      <article class="card" style="grid-column:span 2">
        <div class="media" data-asset="[ASET] Foto ekstrakurikuler"></div>
        <span class="k">Ekstrakurikuler</span>
        <h3 class="h3">Berani mencoba. Berani berkembang.</h3>
        <p>Menemukan potensi melalui pengalaman.</p>
      </article>
    </div>
  </div>
</section>

<!-- ============ 04 EXPERIENCE ============ -->
<section class="section exp on-dark" id="experience">
  <div class="wrap exp-in">
    <div class="exp-head">
      <span class="tag">Pengalaman</span>
      <h2 class="h2" style="margin-top:16px">Leadership is experienced.</h2>
      <p class="lead" style="margin-top:22px;color:#C6D6EA">Bukan hanya belajar tentang kepemimpinan. Mereka mengalaminya.</p>
    </div>

    <div class="stage" style="aspect-ratio:16/9">
        <iframe 
       src="https://www.youtube.com/embed/6HhUz1oFUeg" 
       style="width:100%;height:100%;border:0;border-radius:inherit"
       allow="autoplay; encrypted-media; picture-in-picture"
       allowfullscreen>
        </iframe>
   </div>

    <div class="words">
      <b>Learn.</b><b>Explore.</b><b>Lead.</b>
    </div>
  </div>
</section>

<!-- ============ 05 ALUMNI ============ -->
<section class="section alumni" id="alumni">
  <div class="wrap">
    <div class="al-head">
      <div>
        <span class="tag">Alumni</span>
        <h2 class="h2" style="margin-top:16px;max-width:12ch">Lihat mereka sekarang.</h2>
      </div>
      <p class="lead">Dulu, mereka adalah siswa kami. Hari ini, mereka melangkah lebih jauh.</p>
    </div>

    <div class="rail" id="rail">
      <article class="al">
        <div class="face">
          <img src="https://www.mtsmdonorejo.sch.id/alumni-syifa.jpg" alt="Nur Syifa Sugiyanti" style="width:100%;height:100%;object-fit:cover">
        </div>
        <h4>Nur Syifa Sugiyanti</h4>
        <span>SMA N 2 Grabag/Anggota MPK</span>
      </article>
      <article class="al">
        <div class="face">
          <img src="https://www.mtsmdonorejo.sch.id/alumni-fahmi.jpg" alt="Muhammad Fahmi Oktavian" style="width:100%;height:100%;object-fit:cover">
        </div>
        <h4>Muhamma Fahmi Oktavian</h4>
        <span>SMK N 1 Magelang</span>
      </article>
      <article class="al">
        <div class="face">
          <img src="https://www.mtsmdonorejo.sch.id/alumni-rafa.png" alt="Rafa Atha Setya R." style="width:100%;height:100%;object-fit:cover">
        </div>
        <h4>Rafa Atha Setya Ramadhan</h4>
        <span>SMK Muh Bangunjiwo/Anggota Paskib</span>
      </article>
      <article class="al">
        <div class="face">
          <img src="https://www.mtsmdonorejo.sch.id/alumni-ivan.png" alt="Lovita Ivan Hi., S.Pd.I, M.Pd" style="width:100%;height:100%;object-fit:cover">
        </div>
        <h4>Lovita Ivan H., S.Pd.I, M.Pd</h4>
        <span>CEO Cv. Jasa Perkasa Gemilang</span>
      </article>
      <article class="al"><div class="face"></div><h4>Nama Alumni</h4><span>Sekolah / universitas / bidang</span></article>
    </div>

    <div class="al-close">
      <p>Mungkin, perjalanan anak Anda juga dimulai di sini.</p>
      <a class="btn btn-ghost" href="#spmb">Lihat info SPMB</a>
    </div>
  </div>
</section>

<!-- ============ 06 SPMB ============ -->
<section class="section spmb" id="spmb">
  <div class="wrap">
    <span class="tag">SPMB MTs Muhammadiyah Donorejo</span>
    <h2 class="h2">Masa depan dimulai dari pilihan hari ini.</h2>
    <p class="spmb-sub">Pilih tempat anak belajar. Pilih tempat mereka tumbuh. Pilih tempat mereka mulai belajar memimpin.</p>
   <div class="spmb-cta">
      <a class="btn btn-glow" href="#" id="daftar">Daftar SPMB</a>
      <a class="btn btn-ghost-dark" href="https://wa.me/6288232078761?text=Assalamualaikum%2C%20saya%20ingin%20bertanya%20tentang%20SPMB%20MTs%20Muhammadiyah%20Donorejo" target="_blank" id="kontak">Hubungi kami</a>
      <a class="btn btn-glow" href="${SCRIPT_URL}?p=tka">Tryout TKA</a>
    </div>
  </div>
</section>

<footer class="foot">
  <div class="wrap foot-in">
    <a class="brand" href="#top">
      <span class="mark" style="background:none;padding:0">
        <img src="https://www.mtsmdonorejo.sch.id/logo.png" alt="Logo MTs Muhammadiyah Donorejo" style="width:100%;height:100%;object-fit:contain">
      </span>
      <span class="brand-txt">
        <span class="brand-name">MTs Muhammadiyah Donorejo</span>
        <span class="brand-sub">Future Leaders School</span>
      </span>
    </a>
    <div style="display:flex;align-items:center;gap:18px;flex-wrap:wrap">
      <span>Future Leaders School · Donorejo</span>
      <a href="https://www.mtsmdonorejo.sch.id/admin/" style="color:#9FB3CC;font-size:0.82rem;text-decoration:underline">Portal Admin 🔒</a>
    </div>
  </div>
</footer>

<script>const TKA_CONFIG = { GAS_URL: "${SCRIPT_URL}" };</script>
<script>
/* Hero entrance — satu momen, hanya saat halaman dibuka */
requestAnimationFrame(function(){ document.body.classList.add('ready'); });

/* Header berubah menjadi terang setelah melewati hero */
var nav = document.getElementById('nav');
var hero = document.getElementById('top');
new IntersectionObserver(function(e){
  nav.classList.toggle('solid', !e[0].isIntersecting);
},{rootMargin:'-78px 0px 0px 0px'}).observe(hero);

/* Rail alumni bisa digeser dengan panah keyboard */
var rail = document.getElementById('rail');
rail.setAttribute('tabindex','0');
rail.addEventListener('keydown', function(ev){
  if(ev.key === 'ArrowRight'){ rail.scrollBy({left:300,behavior:'smooth'}); ev.preventDefault(); }
  if(ev.key === 'ArrowLeft'){ rail.scrollBy({left:-300,behavior:'smooth'}); ev.preventDefault(); }
});

/* Ambil pengaturan dinamis dari Google Sheets (Banner & WhatsApp) */
(async function(){
  try {
    if(!TKA_CONFIG || !TKA_CONFIG.GAS_URL || TKA_CONFIG.GAS_URL.includes('YOUR_SCRIPT_ID')) return;
    var res = await fetch(TKA_CONFIG.GAS_URL + '?action=get_pengaturan_web');
    var json = await res.json();
    if(json.ok && json.data){
      var d = json.data;
      // 1. Banner Pengumuman
      if(d.pengumuman_aktif && d.pengumuman_teks){
        document.getElementById('ann-text').textContent = d.pengumuman_teks;
        if(d.pengumuman_link) document.getElementById('ann-link').href = d.pengumuman_link;
        document.getElementById('top-announcement').style.display = 'block';
      }
      // 2. Kontak WhatsApp
      if(d.kontak_wa){
        var waLink = 'https://wa.me/' + d.kontak_wa.replace(/\D/g,'') + '?text=' + encodeURIComponent(d.pesan_wa || 'Assalamualaikum, saya ingin bertanya tentang SPMB MTs Muhammadiyah Donorejo');
        var kontakBtn = document.getElementById('kontak');
        if(kontakBtn) kontakBtn.href = waLink;
      }
    }
  } catch(e){}
})();
</script>
</body>
</html>
`;
  return HtmlService.createHtmlOutput(html)
    .setTitle("MTs Muhammadiyah Donorejo — Future Leaders School")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function renderHalamanTKA() {
  const html = `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Tryout TKA — MTs Muhammadiyah Donorejo</title>
<meta name="description" content="Pendaftaran dan Ujian Tryout TKA Online SPMB MTs Muhammadiyah Donorejo.">
<link rel="icon" type="image/png" href="https://www.mtsmdonorejo.sch.id/logo.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
:root{
  --ink:#0A1628; --ink-2:#12243D; --blue:#0B5FAD; --blue-deep:#084A88; --cyan:#22D3F5;
  --paper:#F4F8FC; --line:#DCE5F0; --muted:#5A6B82; --danger:#B42318; --ok:#067647;
  --gold:#D97706; --silver:#64748B; --bronze:#B45309;
  --font:'Plus Jakarta Sans','Segoe UI',system-ui,-apple-system,sans-serif;
  --gut:clamp(18px,4.5vw,56px);
}
*,*::before,*::after{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{
  margin:0;min-height:100vh;font-family:var(--font);color:#fff;background:var(--ink);
  -webkit-font-smoothing:antialiased;line-height:1.6;position:relative;overflow-x:hidden;
}
body::before{
  content:"";position:absolute;inset:-20% -10% auto -10%;height:95%;pointer-events:none;
  background:
    radial-gradient(45% 55% at 82% 14%,rgba(34,211,245,.25),transparent 65%),
    radial-gradient(50% 60% at 8% 46%,rgba(11,95,173,.5),transparent 68%);
}
a{color:inherit;text-decoration:none}
button{font:inherit;cursor:pointer;border:0;background:none;color:inherit}
:focus-visible{outline:3px solid var(--cyan);outline-offset:3px;border-radius:6px}

/* Top bar */
.top{position:relative;z-index:2;max-width:1200px;margin:0 auto;padding:20px var(--gut);display:flex;align-items:center;justify-content:space-between;gap:16px}
.brand{display:flex;align-items:center;gap:12px}
.brand img{width:42px;height:42px;object-fit:contain}
.brand b{display:block;font-weight:800;font-size:.95rem;letter-spacing:-.02em;line-height:1.2}
.brand small{display:block;font-size:.74rem;opacity:.75;font-weight:500}
.nav-actions{display:flex;align-items:center;gap:14px}
.btn-top{padding:8px 16px;border-radius:999px;font-size:.85rem;font-weight:700;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.15);transition:.2s}
.btn-top:hover{background:rgba(255,255,255,.2);color:#fff}

/* Main Layout */
main{
  position:relative;z-index:2;max-width:1200px;margin:0 auto;
  padding:clamp(16px,3.5vw,48px) var(--gut) 80px;
  display:grid;grid-template-columns:1fr 1.05fr;gap:clamp(28px,5vw,72px);align-items:start;
}
@media (max-width:960px){
  main{grid-template-columns:1fr;}
}

/* Kolom Kiri: Hero Promosi */
.hero-tag{display:inline-flex;align-items:center;gap:8px;padding:6px 14px;border-radius:999px;background:rgba(34,211,245,.12);border:1px solid rgba(34,211,245,.25);font-size:.82rem;font-weight:700;color:var(--cyan)}
.hero-tag span{width:8px;height:8px;border-radius:50%;background:var(--cyan);box-shadow:0 0 8px var(--cyan)}
h1{font-size:clamp(2.3rem,5.6vw,3.8rem);line-height:1.05;font-weight:800;letter-spacing:-.04em;margin:16px 0 0}
.lead{margin:18px 0 0;max-width:44ch;color:#C6D6EA;font-size:clamp(1rem,1.4vw,1.15rem);line-height:1.6}

.badge-row{display:flex;gap:10px;flex-wrap:wrap;margin:24px 0 0}
.badge-item{display:flex;align-items:center;gap:8px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);padding:8px 14px;border-radius:12px;font-size:.84rem;font-weight:600}

.steps{list-style:none;margin:32px 0 0;padding:0;display:grid;gap:14px;max-width:420px}
.steps li{display:flex;align-items:center;gap:14px;font-weight:600;color:#E3ECF7;font-size:.95rem}
.steps span{width:32px;height:32px;border-radius:50%;flex:none;display:grid;place-items:center;font-size:.88rem;font-weight:800;color:var(--ink);background:var(--cyan)}

/* Kolom Kanan: Card Interaktif */
.card{background:#fff;color:var(--ink);border-radius:26px;padding:clamp(22px,3.5vw,36px);box-shadow:0 36px 70px -30px rgba(0,0,0,.65)}
.tabs{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;background:var(--paper);padding:6px;border-radius:999px;margin-bottom:24px}
.tabs button{height:42px;border-radius:999px;font-weight:700;font-size:.88rem;color:var(--muted);transition:background .2s,color .2s;white-space:nowrap}
.tabs button[aria-selected="true"]{background:#fff;color:var(--ink);box-shadow:0 4px 12px -4px rgba(10,22,40,.25)}

.view{display:none}
.view.on{display:block}
h2{margin:0 0 6px;font-size:1.45rem;font-weight:800;letter-spacing:-.03em;line-height:1.2}
.sub{margin:0 0 20px;color:var(--muted);font-size:.92rem}

/* Form Styles */
.field{margin-bottom:14px}
label{display:block;font-size:.84rem;font-weight:700;margin-bottom:6px;color:#203048}
input[type=text],input[type=password],input[type=tel],textarea{
  width:100%;font:inherit;font-size:.96rem;color:var(--ink);background:#fff;
  border:1.5px solid var(--line);border-radius:12px;padding:0 14px;height:48px;transition:border-color .2s,box-shadow .2s;
}
textarea{height:auto;min-height:76px;padding:10px 14px;resize:vertical}
input:focus,textarea:focus{outline:none;border-color:var(--blue);box-shadow:0 0 0 3px rgba(11,95,173,.14)}
.check{display:flex;gap:10px;align-items:flex-start;margin:12px 0 18px;font-size:.84rem;color:var(--muted);line-height:1.45}
.check input{width:18px;height:18px;margin-top:2px;flex:none;accent-color:var(--blue)}

/* Buttons */
.btn{display:inline-flex;align-items:center;justify-content:center;width:100%;height:52px;border-radius:999px;font-weight:700;font-size:.96rem;background:var(--blue);color:#fff;box-shadow:0 10px 24px -10px rgba(11,95,173,.7);transition:transform .18s,background .2s}
.btn:hover{background:var(--blue-deep);transform:translateY(-2px)}
.btn:disabled{opacity:.6;cursor:wait;transform:none}
.btn.ghost{background:#fff;color:var(--ink);border:1.5px solid var(--line);box-shadow:none}
.btn.ghost:hover{border-color:var(--ink)}

/* Pesan Notifikasi */
.msg{display:none;margin:0 0 16px;padding:12px 14px;border-radius:10px;font-size:.88rem;font-weight:600}
.msg.show{display:block}
.msg.err{background:#FEF3F2;color:var(--danger);border:1px solid #FECDCA}
.msg.good{background:#ECFDF3;color:var(--ok);border:1px solid #A6F4C5}

/* Kartu Akun Peserta */
.cred-card{background:linear-gradient(135deg,#EFF6FF,#E0F2FE);border:1.5px dashed #93C5FD;border-radius:16px;padding:20px;margin-bottom:18px}
.cred-title{font-size:.8rem;font-weight:700;color:var(--blue);text-transform:uppercase;letter-spacing:.03em;margin-bottom:12px}
.cred-row{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.cred-box small{display:block;font-size:.74rem;font-weight:700;color:var(--muted)}
.cred-box code{display:block;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:1.25rem;font-weight:800;color:var(--ink);margin-top:2px}
.cred-notice{margin-top:12px;font-size:.8rem;color:#1E40AF;background:rgba(255,255,255,.6);padding:8px 12px;border-radius:8px}

/* Leaderboard Table */
.lb-table-wrap{max-height:420px;overflow-y:auto;border:1px solid var(--line);border-radius:14px;margin-bottom:14px}
table.lb-table{width:100%;border-collapse:collapse;text-align:left;font-size:.88rem}
table.lb-table th{background:var(--paper);color:var(--muted);font-weight:700;padding:10px 12px;font-size:.78rem;text-transform:uppercase;position:sticky;top:0;z-index:2}
table.lb-table td{padding:10px 12px;border-top:1px solid var(--line)}
table.lb-table tr:hover td{background:#F8FAFC}
.rank-badge{display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:50%;font-weight:800;font-size:.78rem}
.rank-1{background:#FEF3C7;color:var(--gold);border:1px solid #FDE68A}
.rank-2{background:#F1F5F9;color:var(--silver);border:1px solid #CBD5E1}
.rank-3{background:#FFEDD5;color:var(--bronze);border:1px solid #FED7AA}
.score-badge{font-weight:800;color:var(--blue);font-size:.95rem}

/* Footer info */
footer.foot{position:relative;z-index:2;text-align:center;padding:20px var(--gut);color:rgba(255,255,255,.6);font-size:.82rem;border-top:1px solid rgba(255,255,255,.08)}
footer.foot a{color:var(--cyan);text-decoration:underline;margin-left:8px}
</style>
</head>
<body>

<header class="top">
  <div class="brand">
    <img src="https://www.mtsmdonorejo.sch.id/logo.png" alt="Logo MTs Donorejo" onerror="this.style.display='none'">
    <div>
      <b>MTs Muhammadiyah Donorejo</b>
      <small>Future Leaders School</small>
    </div>
  </div>
  <div class="nav-actions">
    <a href="../index.html" class="btn-top">← Profil Madrasah</a>
  </div>
</header>

<main>
  <!-- KIRI: INFORMASI PROMOSI SPMB -->
  <section class="hero-left">
    <div class="hero-tag">
      <span></span> Ujian Bakat & Potensi Calon Siswa
    </div>
    <h1>Tes Kemampuan Akademik (TKA) Online</h1>
    <p class="lead">Ukur kesiapan akademik dan raih kesempatan beasiswa serta kelas unggulan di MTs Muhammadiyah Donorejo.</p>

    <div class="badge-row">
      <div class="badge-item">⏱️ Waktu Pengerjaan Fleksibel</div>
      <div class="badge-item">🏆 Leaderboard Prestasi SD/MI</div>
      <div class="badge-item">📱 Akses Mudah dari HP / Laptop</div>
    </div>

    <ul class="steps">
      <li><span>1</span> Isi formulir pendaftaran calon siswa</li>
      <li><span>2</span> Dapatkan Username & Password instan</li>
      <li><span>3</span> Kerjakan soal tryout kapan saja dalam periode buka</li>
      <li><span>4</span> Pantau peringkat skor siswa & sekolah di Leaderboard</li>
    </ul>
  </section>

  <!-- KANAN: CARD PENDAFTARAN / LOGIN / LEADERBOARD -->
  <section class="card">
    <div class="tabs" id="tabs">
      <button type="button" id="tab-daftar" aria-selected="true">Daftar</button>
      <button type="button" id="tab-masuk" aria-selected="false">Masuk</button>
      <button type="button" id="tab-ranking" aria-selected="false">🏆 Peringkat</button>
    </div>

    <!-- VIEW 1: DAFTAR -->
    <div class="view on" id="v-daftar">
      <h2>Daftar Peserta Baru</h2>
      <p class="sub">Gratis untuk seluruh siswa SD/MI sederajat.</p>

      <div class="msg err" id="m-daftar"></div>

      <form id="f-daftar" novalidate>
        <div class="field">
          <label for="nama">Nama Lengkap Siswa</label>
          <input type="text" id="nama" name="nama" placeholder="Contoh: Muhammad Rizki" required>
        </div>
        <div class="field">
          <label for="ortu">Nama Orang Tua / Wali</label>
          <input type="text" id="ortu" name="ortu" placeholder="Contoh: Bapak Hendra" required>
        </div>
        <div class="field">
          <label for="hp">Nomor WhatsApp Aktif</label>
          <input type="tel" id="hp" name="hp" placeholder="Contoh: 08123456789" required>
        </div>
        <div class="field">
          <label for="sekolah">Asal SD / MI</label>
          <input type="text" id="sekolah" name="sekolah" placeholder="Contoh: SD Negeri 1 Donorejo" required>
        </div>
        <div class="field">
          <label for="alamat">Alamat Singkat</label>
          <textarea id="alamat" name="alamat" placeholder="Contoh: Donorejo RT 02 / RW 01" required></textarea>
        </div>
        <label class="check">
          <input type="checkbox" id="setuju" name="setuju" checked required>
          <span>Saya setuju data ini digunakan untuk Tryout TKA dan info SPMB MTs Muhammadiyah Donorejo.</span>
        </label>
        <button type="submit" class="btn" id="b-daftar">Dapatkan Akun & Mulai</button>
      </form>
    </div>

    <!-- VIEW 2: KARTU AKUN SETELAH DAFTAR -->
    <div class="view" id="v-akun">
      <h2>Pendaftaran Berhasil! 🎉</h2>
      <p class="sub">Simpan kartu peserta di bawah ini ke galeri HP Anda.</p>

      <div class="cred-card" id="print-area">
        <div class="cred-title">KARTU PESERTA TKA MTs DONOREJO 2026</div>
        
        <div style="margin-bottom:14px;border-bottom:1px solid #BFDBFE;padding-bottom:12px">
          <small style="display:block;font-size:.76rem;font-weight:700;color:var(--muted)">NAMA SISWA</small>
          <b id="o-nama" style="font-size:1.15rem;color:var(--ink)">-</b>
          <small style="display:block;font-size:.76rem;font-weight:700;color:var(--muted);margin-top:6px">ASAL SEKOLAH</small>
          <span id="o-sekolah" style="font-weight:700;color:#1E40AF">-</span>
        </div>

        <div class="cred-row">
          <div class="cred-box">
            <small>USERNAME</small>
            <code id="o-user">-</code>
          </div>
          <div class="cred-box">
            <small>PASSWORD</small>
            <code id="o-pass">-</code>
          </div>
        </div>
        <div class="cred-notice">
          💡 <strong>Penting:</strong> Klik tombol biru di bawah untuk menyimpan gambar kartu ke galeri HP agar tidak lupa!
        </div>
      </div>

      <button type="button" class="btn" style="background:#0E8A45;margin-bottom:10px" id="b-unduh-kartu">📷 Unduh Kartu ke Galeri HP</button>
      <button type="button" class="btn" id="b-mulai-langsung">Masuk ke Ruang Ujian Sekarang →</button>
      <button type="button" class="btn ghost" style="margin-top:10px" id="b-salin-akun">📋 Salin Akun ke Clipboard</button>
    </div>

    <!-- VIEW 3: MASUK / LOGIN -->
    <div class="view" id="v-masuk">
      <h2>Masuk ke Akun Anda</h2>
      <p class="sub">Gunakan username dan password yang sudah didapatkan.</p>

      <div class="msg err" id="m-masuk"></div>

      <form id="f-masuk" novalidate>
        <div class="field">
          <label for="u">Username</label>
          <input type="text" id="u" name="u" autocomplete="username" autocapitalize="none" placeholder="Masukkan username" required>
        </div>
        <div class="field">
          <label for="p">Password</label>
          <input type="password" id="p" name="p" autocomplete="current-password" placeholder="Masukkan password" required>
        </div>
        <button type="submit" class="btn" id="b-masuk">Masuk ke Ruang Tryout</button>
      </form>
    </div>

    <!-- VIEW 4: LEADERBOARD PERINGKAT -->
    <div class="view" id="v-ranking">
      <h2>🏆 Leaderboard Prestasi</h2>
      <p class="sub">Peringkat nilai tryout calon siswa terbaik dari berbagai SD/MI.</p>

      <div class="lb-table-wrap">
        <table class="lb-table">
          <thead>
            <tr>
              <th style="width:40px">No</th>
              <th>Nama Siswa</th>
              <th>Asal Sekolah</th>
              <th style="text-align:right">Skor</th>
            </tr>
          </thead>
          <tbody id="lb-tbody">
            <tr><td colspan="4" style="text-align:center;padding:24px;color:var(--muted)">Memuat data peringkat…</td></tr>
          </tbody>
        </table>
      </div>
      <button type="button" class="btn ghost" id="b-refresh-lb">🔄 Segarkan Peringkat</button>
    </div>
  </section>
</main>

<footer class="foot">
  <span>MTs Muhammadiyah Donorejo · Future Leaders School</span>
  <span style="margin:0 8px">·</span>
  <a href="admin.html">Portal Admin & Kepala Sekolah 🔒</a>
</footer>

<script>const TKA_CONFIG = { GAS_URL: "${SCRIPT_URL}" };</script>
<script>
var $ = function(id){ return document.getElementById(id); };

// Navigasi Tab
function showTab(name){
  ['daftar','akun','masuk','ranking'].forEach(function(v){
    var el = $('v-' + v);
    if(el) el.classList.toggle('on', v === name);
  });
  $('tab-daftar').setAttribute('aria-selected', name === 'daftar');
  $('tab-masuk').setAttribute('aria-selected', name === 'masuk');
  $('tab-ranking').setAttribute('aria-selected', name === 'ranking');

  if(name === 'ranking'){
    muatLeaderboard();
  }
}

$('tab-daftar').onclick = function(){ showTab('daftar'); };
$('tab-masuk').onclick  = function(){ showTab('masuk'); };
$('tab-ranking').onclick = function(){ showTab('ranking'); };

function setMsg(id, text){
  var el = $(id);
  el.textContent = text || '';
  el.classList.toggle('show', !!text);
}

// Generator Username & Password Acak
function buatUsername(nama){
  var w = nama.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').split(/\s+/)[0] || 'siswa';
  w = w.replace(/[^a-z]/g,'').slice(0,8);
  return (w || 'siswa') + Math.floor(1000 + Math.random() * 9000);
}
function buatPassword(len){
  var chars = 'abcdefhkmnprstuvwxyzABCDEFGHKMNPRSTUVWXYZ23456789';
  var res = '';
  for(var i=0; i<(len||8); i++){
    res += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return res;
}

// 1. FORM PENDAFTARAN
var akunTersimpan = { u:'', p:'' };

$('f-daftar').addEventListener('submit', async function(e){
  e.preventDefault();
  setMsg('m-daftar','');

  var f = e.target;
  var hp = f.hp.value.replace(/\D/g,'');
  if(hp.indexOf('0') === 0) hp = '62' + hp.slice(1);
  else if(hp.indexOf('8') === 0) hp = '62' + hp;

  var d = {
    nama: f.nama.value.trim(),
    ortu: f.ortu.value.trim(),
    hp: hp,
    sekolah: f.sekolah.value.trim(),
    alamat: f.alamat.value.trim()
  };

  if(!d.nama || !d.ortu || !f.hp.value.trim() || !d.sekolah || !d.alamat){
    setMsg('m-daftar','Mohon lengkapi seluruh formulir pendaftaran.'); return;
  }
  if(!/^628\d{8,12}$/.test(d.hp)){
    setMsg('m-daftar','Nomor WhatsApp tidak valid. Format: 08123456789'); return;
  }

  var btn = $('b-daftar');
  btn.disabled = true; btn.textContent = 'Membuat Akun…';

  var username = buatUsername(d.nama);
  var password = buatPassword(8);

  try {
    var resp = await fetch(TKA_CONFIG.GAS_URL, {
      method: 'POST',
      body: JSON.stringify({
        action: 'daftar',
        data: {
          username: username,
          password: password,
          nama: d.nama,
          nama_ortu: d.ortu,
          no_wa: d.hp,
          nama_sekolah: d.sekolah,
          alamat: d.alamat
        }
      })
    });
    var res = await resp.json();
    if(!res.ok){ throw new Error(res.msg || 'Pendaftaran gagal'); }

    akunTersimpan = { u: username, p: password, id: res.data.id, nama: d.nama, sekolah: d.sekolah };
    
    // Simpan sesi user ke localStorage
    localStorage.setItem('tka_user', JSON.stringify(akunTersimpan));

    $('o-user').textContent = username;
    $('o-pass').textContent = password;
    $('o-nama').textContent = d.nama;
    $('o-sekolah').textContent = d.sekolah;
    showTab('akun');
  } catch(err) {
    console.error(err);
    setMsg('m-daftar', 'Terjadi kendala saat pendaftaran: ' + err.message);
  } finally {
    btn.disabled = false; btn.textContent = 'Dapatkan Akun & Mulai';
  }
});

// Fitur Unduh Kartu ke Galeri HP (Canvas Native)
$('b-unduh-kartu').onclick = function(){
  var canvas = document.createElement('canvas');
  canvas.width = 900;
  canvas.height = 560;
  var ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Border Luar
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#0B5FAD';
  ctx.strokeRect(16, 16, canvas.width - 32, canvas.height - 32);

  // Header Box Navy
  ctx.fillStyle = '#0A1628';
  ctx.fillRect(20, 20, canvas.width - 40, 110);

  ctx.fillStyle = '#22D3F5';
  ctx.font = 'bold 15px sans-serif';
  ctx.fillText('TES KEMAMPUAN AKADEMIK (TKA) 2026/2027', 48, 55);

  ctx.fillStyle = '#FFFFFF';
  ctx.font = '900 26px sans-serif';
  ctx.fillText('MTs MUHAMMADIYAH DONOREJO', 48, 92);

  ctx.fillStyle = '#9FB3CC';
  ctx.font = '14px sans-serif';
  ctx.fillText('Future Leaders School · www.mtsmdonorejo.sch.id', 48, 115);

  // Badge Judul
  ctx.fillStyle = '#EFF6FF';
  ctx.fillRect(48, 150, canvas.width - 96, 40);
  ctx.fillStyle = '#0B5FAD';
  ctx.font = 'bold 15px sans-serif';
  ctx.fillText('KARTU RESMI PESERTA UJIAN', 64, 175);

  // Data Siswa
  ctx.fillStyle = '#5A6B82';
  ctx.font = 'bold 13px sans-serif';
  ctx.fillText('NAMA LENGKAP SISWA', 48, 225);
  ctx.fillStyle = '#0A1628';
  ctx.font = 'bold 22px sans-serif';
  ctx.fillText(akunTersimpan.nama || '-', 48, 255);

  ctx.fillStyle = '#5A6B82';
  ctx.font = 'bold 13px sans-serif';
  ctx.fillText('ASAL SEKOLAH DASAR / MI', 48, 305);
  ctx.fillStyle = '#0A1628';
  ctx.font = 'bold 20px sans-serif';
  ctx.fillText(akunTersimpan.sekolah || '-', 48, 335);

  // Kotak Username & Password
  var wBox = (canvas.width - 116) / 2;
  ctx.fillStyle = '#F4F8FC';
  ctx.fillRect(48, 370, wBox, 100);
  ctx.strokeStyle = '#93C5FD';
  ctx.lineWidth = 2;
  ctx.strokeRect(48, 370, wBox, 100);

  ctx.fillStyle = '#5A6B82';
  ctx.font = 'bold 13px sans-serif';
  ctx.fillText('USERNAME', 68, 400);
  ctx.fillStyle = '#0B5FAD';
  ctx.font = 'bold 26px monospace';
  ctx.fillText(akunTersimpan.u || '-', 68, 442);

  var box2X = 48 + wBox + 20;
  ctx.fillStyle = '#F4F8FC';
  ctx.fillRect(box2X, 370, wBox, 100);
  ctx.strokeRect(box2X, 370, wBox, 100);

  ctx.fillStyle = '#5A6B82';
  ctx.font = 'bold 13px sans-serif';
  ctx.fillText('PASSWORD', box2X + 20, 400);
  ctx.fillStyle = '#0A1628';
  ctx.font = 'bold 26px monospace';
  ctx.fillText(akunTersimpan.p || '-', box2X + 20, 442);

  // Footer Note
  ctx.fillStyle = '#64748B';
  ctx.font = 'italic 13px sans-serif';
  ctx.fillText('* Simpan kartu ini di galeri HP. Gunakan username & password di atas untuk masuk ke ruang ujian.', 48, 510);

  // Unduh File
  var link = document.createElement('a');
  link.download = 'Kartu-Peserta-TKA-' + (akunTersimpan.u || 'siswa') + '.png';
  link.href = canvas.toDataURL('image/png');
  link.click();
};

$('b-mulai-langsung').onclick = function(){
  window.location.href = 'https://www.mtsmdonorejo.sch.id/tka/tryout.html';
};

$('b-salin-akun').onclick = function(){
  var teks = "Akun TKA MTs Muhammadiyah Donorejo\nNama: " + akunTersimpan.nama + "\nUsername: " + akunTersimpan.u + "\nPassword: " + akunTersimpan.p;
  navigator.clipboard.writeText(teks).then(function(){
    alert('Akun berhasil disalin ke clipboard!');
  });
};

// 2. FORM LOGIN
$('f-masuk').addEventListener('submit', async function(e){
  e.preventDefault();
  setMsg('m-masuk','');
  var u = $('u').value.trim();
  var p = $('p').value.trim();

  if(!u || !p){ setMsg('m-masuk','Masukkan username dan password.'); return; }

  var btn = $('b-masuk');
  btn.disabled = true; btn.textContent = 'Memeriksa…';

  try {
    var resp = await fetch(TKA_CONFIG.GAS_URL, {
      method: 'POST',
      body: JSON.stringify({ action: 'login', username: u, password: p })
    });
    var res = await resp.json();
    if(!res.ok){ throw new Error(res.msg || 'Login gagal'); }

    // Simpan sesi login
    localStorage.setItem('tka_user', JSON.stringify(res.data));
    window.location.href = 'https://www.mtsmdonorejo.sch.id/tka/tryout.html';
  } catch(err) {
    setMsg('m-masuk', err.message);
  } finally {
    btn.disabled = false; btn.textContent = 'Masuk ke Ruang Tryout';
  }
});

// 3. LEADERBOARD
async function muatLeaderboard(){
  var tbody = $('lb-tbody');
  tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:24px;color:var(--muted)">Memuat data peringkat…</td></tr>';

  try {
    var resp = await fetch(TKA_CONFIG.GAS_URL + '?action=get_leaderboard');
    var res = await resp.json();
    if(!res.ok || !res.data || res.data.length === 0){
      tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:24px;color:var(--muted)">Belum ada peserta yang menyelesaikan tryout. Jadilah yang pertama!</td></tr>';
      return;
    }

    var html = '';
    res.data.forEach(function(item, idx){
      var rank = idx + 1;
      var rankClass = rank === 1 ? 'rank-1' : (rank === 2 ? 'rank-2' : (rank === 3 ? 'rank-3' : ''));
      var badge = rankClass ? '<span class="rank-badge '+rankClass+'">'+rank+'</span>' : rank;

      html += '<tr>' +
        '<td>' + badge + '</td>' +
        '<td><b>' + item.nama + '</b></td>' +
        '<td>' + item.sekolah + '</td>' +
        '<td style="text-align:right"><span class="score-badge">' + item.skor + '</span></td>' +
      '</tr>';
    });
    tbody.innerHTML = html;
  } catch(err) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:24px;color:var(--danger)">Gagal memuat peringkat. Periksa koneksi internet.</td></tr>';
  }
}

$('b-refresh-lb').onclick = muatLeaderboard;
</script>
</body>
</html>
`;
  return HtmlService.createHtmlOutput(html)
    .setTitle("Tryout TKA — MTs Muhammadiyah Donorejo")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
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
