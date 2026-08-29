const express  = require('express');
const router   = express.Router();
const bcrypt   = require('bcryptjs');
const { authenticate, authorize, optionalAuth } = require('../middlewares/auth');
const upload   = require('../middlewares/upload');
const { query } = require('../utils/db');
const { formatRupiah } = require('../utils/helpers');

const authCtrl      = require('../controllers/authController');
const pemesananCtrl = require('../controllers/pemesananController');
const adminCtrl     = require('../controllers/adminController');
const kurirCtrl     = require('../controllers/kurirController');
const laporanCtrl   = require('../controllers/laporanController');

// ── HOME ──────────────────────────────────────────────────────
router.get('/', optionalAuth, async (req, res) => {
  const paket = await query(`SELECT * FROM paket_katering WHERE tersedia=TRUE ORDER BY harga_per_porsi`).catch(()=>({rows:[]}));
  res.render('home', { title: 'Selamat Datang', user: req.user, paket: paket.rows, formatRupiah });
});

// ── AUTH ──────────────────────────────────────────────────────
router.get ('/auth/login',    authCtrl.showLogin);
router.post('/auth/login',    authCtrl.login);
router.get ('/auth/register', authCtrl.showRegister);
router.post('/auth/register', authCtrl.register);
router.get ('/auth/logout',   authCtrl.logout);

// ── DASHBOARD PELANGGAN ───────────────────────────────────────
router.get('/dashboard', authenticate, authorize('pelanggan'), async (req, res) => {
  try {
    const [stats, perluBayar, sedangDikirim] = await Promise.all([
      query(`SELECT
               COUNT(*)                                                       AS total,
               COUNT(*) FILTER (WHERE status='selesai')                       AS selesai,
               COUNT(*) FILTER (WHERE status NOT IN ('selesai','dibatalkan')) AS aktif
             FROM pemesanan WHERE pelanggan_id=$1`, [req.user.id]),
      // Pesanan dikonfirmasi tapi belum bayar/belum lunas
      query(`SELECT p.id, p.nomor_pesanan, p.total_harga,
                    COALESCE(SUM(pb.jumlah) FILTER (WHERE pb.status='lunas'),0) AS dibayar
             FROM pemesanan p
             LEFT JOIN pembayaran pb ON pb.pemesanan_id=p.id
             WHERE p.pelanggan_id=$1 AND p.status='dikonfirmasi'
             GROUP BY p.id HAVING
               COALESCE(SUM(pb.jumlah) FILTER (WHERE pb.status='lunas'),0) < p.total_harga`, [req.user.id]),
      // Pesanan sedang dikirim → perlu konfirmasi terima
      query(`SELECT id, nomor_pesanan FROM pemesanan
             WHERE pelanggan_id=$1 AND status='sedang_dikirim'`, [req.user.id]),
    ]);
    res.render('dashboard', {
      title: 'Dashboard', user: req.user, stats: stats.rows[0],
      perluBayar: perluBayar.rows, sedangDikirim: sedangDikirim.rows,
    });
  } catch (err) {
    res.render('error', { title: 'Error', message: err.message, user: req.user });
  }
});

// ── PEMESANAN ─────────────────────────────────────────────────
router.get ('/pemesanan',              authenticate, authorize('pelanggan'), pemesananCtrl.index);
router.get ('/pemesanan/buat',         authenticate, authorize('pelanggan'), pemesananCtrl.create);
router.post('/pemesanan',              authenticate, authorize('pelanggan'), pemesananCtrl.store);
router.get ('/pemesanan/:id',          authenticate, pemesananCtrl.show);
// STEP 2: Pelanggan bayar + upload bukti (hanya bisa kalau status dikonfirmasi)
router.post('/pemesanan/:id/bayar',    authenticate, authorize('pelanggan'), upload.single('bukti_foto'), pemesananCtrl.bayar);
// STEP 6: Pelanggan konfirmasi terima
router.post('/pemesanan/:id/terima',   authenticate, authorize('pelanggan'), pemesananCtrl.konfirmasiTerima);
router.post('/pemesanan/:id/ulasan',   authenticate, authorize('pelanggan'), pemesananCtrl.ulasan);

// ── ADMIN ─────────────────────────────────────────────────────
router.get ('/admin/dashboard',              authenticate, authorize('admin'), adminCtrl.dashboard);
router.get ('/admin/pesanan',                authenticate, authorize('admin'), adminCtrl.pesananList);
// STEP 1: Admin konfirmasi pesanan
router.post('/admin/pesanan/:id/konfirmasi', authenticate, authorize('admin'), adminCtrl.konfirmasiPesanan);
// STEP 3: Admin verifikasi bukti bayar (id = pembayaran id)
router.post('/admin/bayar/:id/verifikasi',   authenticate, authorize('admin'), adminCtrl.verifikasiBayar);
// STEP 4: Admin set siap kirim + tugaskan kurir
router.post('/admin/pesanan/:id/siap-kirim', authenticate, authorize('admin'), adminCtrl.siapKirim);
// Batalkan pesanan
router.post('/admin/pesanan/:id/batal',      authenticate, authorize('admin'), adminCtrl.batalPesanan);

// Admin: tambah kurir
router.post('/admin/kurir', authenticate, authorize('admin'), async (req, res) => {
  const { nama, email, no_hp, password, kendaraan, no_plat } = req.body;
  try {
    const hash = await bcrypt.hash(password, 10);
    await query(`INSERT INTO kurir (nama,email,password,no_hp,kendaraan,no_plat) VALUES ($1,$2,$3,$4,$5,$6)`,
      [nama, email||null, hash, no_hp, kendaraan||null, no_plat||null]);
  } catch (err) { console.error(err); }
  res.redirect('/admin/kurir');
});
router.get ('/admin/kurir',  authenticate, authorize('admin'), adminCtrl.kurirList);
router.get ('/admin/paket',  authenticate, authorize('admin'), adminCtrl.paketList);
router.post('/admin/paket',  authenticate, authorize('admin'), async (req, res) => {
  const { nama_paket, deskripsi, harga_per_porsi, min_porsi, max_porsi } = req.body;
  try {
    await query(`INSERT INTO paket_katering (nama_paket,deskripsi,harga_per_porsi,min_porsi,max_porsi) VALUES ($1,$2,$3,$4,$5)`,
      [nama_paket, deskripsi||null, harga_per_porsi, min_porsi||50, max_porsi||null]);
  } catch (err) { console.error(err); }
  res.redirect('/admin/paket');
});
router.post('/admin/menu', authenticate, authorize('admin'), async (req, res) => {
  const { paket_id, nama_menu, kategori, deskripsi } = req.body;
  try {
    await query(`INSERT INTO menu_item (paket_id,nama_menu,kategori,deskripsi) VALUES ($1,$2,$3,$4)`,
      [paket_id, nama_menu, kategori, deskripsi||null]);
  } catch (err) { console.error(err); }
  res.redirect('/admin/paket');
});

// ── LAPORAN ───────────────────────────────────────────────────
router.get('/admin/laporan',       authenticate, authorize('admin'), laporanCtrl.index);
router.get('/admin/laporan/excel', authenticate, authorize('admin'), laporanCtrl.exportExcel);
router.get('/admin/laporan/pdf',   authenticate, authorize('admin'), laporanCtrl.exportPDF);

// ── KURIR ─────────────────────────────────────────────────────
router.get ('/kurir/dashboard', authenticate, authorize('kurir'), kurirCtrl.dashboard);
// STEP 5: Kurir ambil tugas → status sedang_dikirim
router.post('/kurir/pengiriman/:id/ambil',  authenticate, authorize('kurir'), kurirCtrl.ambilTugas);
// Update lokasi / upload bukti / selesai
router.post('/kurir/pengiriman/:id/update', authenticate, authorize('kurir'), upload.single('bukti_foto'), kurirCtrl.updateStatus);

// ── API ───────────────────────────────────────────────────────
router.get('/api/kurir-aktif', authenticate, authorize('admin'), async (req, res) => {
  const { rows } = await query(`SELECT id,nama,kendaraan,no_plat FROM kurir WHERE aktif=TRUE ORDER BY nama`);
  res.json(rows);
});

module.exports = router;
