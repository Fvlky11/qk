const { query } = require('../utils/db');
const { formatTanggal } = require('../utils/helpers');

const dashboard = async (req, res) => {
  try {
    const [stats, tugasList] = await Promise.all([
      query(`
        SELECT
          COUNT(*) FILTER (WHERE pg.status NOT IN ('selesai','gagal')) AS aktif,
          COUNT(*) FILTER (WHERE pg.status = 'selesai')                AS selesai
        FROM pengiriman pg WHERE pg.kurir_id=$1`, [req.user.id]),
      query(`
        SELECT pg.*, p.id AS pesanan_id, p.nomor_pesanan,
               p.tanggal_acara, p.lokasi_acara, p.kota_acara, p.jumlah_porsi,
               pk.nama_paket,
               pl.nama AS nama_pelanggan, pl.no_hp AS hp_pelanggan,
               p.status AS status_pesanan
        FROM pengiriman pg
        JOIN pemesanan p ON p.id = pg.pemesanan_id
        JOIN pelanggan pl ON pl.id = p.pelanggan_id
        JOIN paket_katering pk ON pk.id = p.paket_id
        WHERE pg.kurir_id=$1
        ORDER BY CASE pg.status
          WHEN 'kurir_ditugaskan' THEN 1
          ELSE 2 END, p.tanggal_acara ASC`, [req.user.id]),
    ]);

    // Tugas yang belum diambil kurir ini (siap_kirim, kurir belum ada/bisa diambil)
    // Di sini kurir hanya lihat tugas yang sudah ditugaskan ke dia
    res.render('kurir/dashboard', {
      title: 'Dashboard Kurir', stats: stats.rows[0],
      tugas: tugasList.rows, formatTanggal, user: req.user,
    });
  } catch (err) {
    console.error(err);
    res.render('error', { title: 'Error', message: err.message, user: req.user });
  }
};

// ─── STEP 5: Kurir ambil tugas → status sedang_dikirim ───────
const ambilTugas = async (req, res) => {
  try {
    // Update pengiriman
    await query(`
      UPDATE pengiriman SET status='dalam_perjalanan', waktu_berangkat=NOW()
      WHERE id=$1 AND kurir_id=$2`, [req.params.id, req.user.id]);

    // Update pesanan → sedang_dikirim
    await query(`
      UPDATE pemesanan SET status='sedang_dikirim'
      WHERE id=(SELECT pemesanan_id FROM pengiriman WHERE id=$1)`, [req.params.id]);

    res.redirect('/kurir/dashboard');
  } catch (err) {
    console.error(err);
    res.redirect('/kurir/dashboard');
  }
};

// Kurir update lokasi / selesai antar / gagal
const updateStatus = async (req, res) => {
  const { status, lokasi_terkini, catatan_kurir } = req.body;
  const buktiFoto = req.file ? `/uploads/${req.file.filename}` : null;
  try {
    const sets   = ['status=$1', 'lokasi_terkini=$2', 'catatan_kurir=$3'];
    const params = [status, lokasi_terkini||null, catatan_kurir||null];

    if (buktiFoto) { params.push(buktiFoto); sets.push(`bukti_foto=$${params.length}`); }
    if (status === 'selesai') sets.push('waktu_tiba=NOW()');

    params.push(req.params.id);
    await query(`UPDATE pengiriman SET ${sets.join(',')} WHERE id=$${params.length}`, params);

    if (status === 'gagal') {
      await query(`UPDATE pemesanan SET status='dibatalkan'
                   WHERE id=(SELECT pemesanan_id FROM pengiriman WHERE id=$1)`, [req.params.id]);
    }
    res.redirect('/kurir/dashboard');
  } catch (err) {
    console.error(err);
    res.redirect('/kurir/dashboard');
  }
};

module.exports = { dashboard, ambilTugas, updateStatus };
