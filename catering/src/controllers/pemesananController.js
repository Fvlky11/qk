const { query, getClient } = require('../utils/db');
const { generateNomorPesanan, formatRupiah, formatTanggal, statusLabel } = require('../utils/helpers');

const index = async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT p.*, pk.nama_paket,
             COALESCE(SUM(pb.jumlah) FILTER (WHERE pb.status='lunas'), 0) AS total_dibayar
      FROM pemesanan p
      JOIN paket_katering pk ON pk.id = p.paket_id
      LEFT JOIN pembayaran pb ON pb.pemesanan_id = p.id
      WHERE p.pelanggan_id = $1
      GROUP BY p.id, pk.nama_paket
      ORDER BY p.created_at DESC`, [req.user.id]);

    res.render('pemesanan/index', {
      title: 'Pesanan Saya', pesanan: rows,
      statusLabel, formatRupiah, formatTanggal, user: req.user,
    });
  } catch (err) {
    console.error(err);
    res.render('error', { title: 'Error', message: err.message, user: req.user });
  }
};

const create = async (req, res) => {
  try {
    const paket = await query(`SELECT * FROM paket_katering WHERE tersedia=TRUE ORDER BY harga_per_porsi`);
    res.render('pemesanan/create', {
      title: 'Buat Pesanan', paket: paket.rows,
      error: null, user: req.user, formatRupiah,
      selectedPaketId: req.query.paket_id || null,
    });
  } catch (err) {
    res.render('error', { title: 'Error', message: err.message, user: req.user });
  }
};

const store = async (req, res) => {
  const { paket_id, tanggal_acara, waktu_acara, lokasi_acara, kota_acara, jumlah_porsi, catatan } = req.body;
  const client = await getClient();
  try {
    const paketRes = await client.query(`SELECT * FROM paket_katering WHERE id=$1`, [paket_id]);
    const paket = paketRes.rows[0];
    if (!paket) throw new Error('Paket tidak ditemukan');

    const porsi = parseInt(jumlah_porsi);
    if (porsi < paket.min_porsi) throw new Error(`Minimum porsi: ${paket.min_porsi}`);
    if (paket.max_porsi && porsi > paket.max_porsi) throw new Error(`Maksimum porsi: ${paket.max_porsi}`);

    const total = porsi * parseFloat(paket.harga_per_porsi);

    await client.query('BEGIN');
    const nomor = generateNomorPesanan();
    const res2 = await client.query(`
      INSERT INTO pemesanan
        (pelanggan_id, paket_id, nomor_pesanan, tanggal_acara, waktu_acara,
         lokasi_acara, kota_acara, jumlah_porsi, harga_per_porsi, total_harga, catatan)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
      [req.user.id, paket_id, nomor, tanggal_acara, waktu_acara||null,
       lokasi_acara, kota_acara||null, porsi, paket.harga_per_porsi, total, catatan||null]);

    await client.query(`INSERT INTO pengiriman (pemesanan_id) VALUES ($1)`, [res2.rows[0].id]);
    await client.query('COMMIT');
    res.redirect(`/pemesanan/${res2.rows[0].id}?success=1`);
  } catch (err) {
    await client.query('ROLLBACK').catch(()=>{});
    const paket = await query(`SELECT * FROM paket_katering WHERE tersedia=TRUE`);
    res.render('pemesanan/create', {
      title: 'Buat Pesanan', paket: paket.rows,
      error: err.message, user: req.user, formatRupiah, selectedPaketId: null,
    });
  } finally { client.release(); }
};

const show = async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT p.*,
             pl.nama AS nama_pelanggan, pl.no_hp,
             pk.nama_paket, pk.deskripsi AS paket_deskripsi,
             pg.id AS pengiriman_id, pg.status AS status_pengiriman,
             pg.waktu_berangkat, pg.waktu_tiba,
             pg.lokasi_terkini, pg.bukti_foto AS bukti_kirim, pg.catatan_kurir,
             k.nama AS nama_kurir, k.no_hp AS hp_kurir, k.kendaraan, k.no_plat
      FROM pemesanan p
      JOIN pelanggan pl ON pl.id = p.pelanggan_id
      JOIN paket_katering pk ON pk.id = p.paket_id
      LEFT JOIN pengiriman pg ON pg.pemesanan_id = p.id
      LEFT JOIN kurir k ON k.id = pg.kurir_id
      WHERE p.id=$1`, [req.params.id]);

    if (!rows[0]) return res.redirect('/pemesanan');
    if (req.user.role === 'pelanggan' && rows[0].pelanggan_id !== req.user.id)
      return res.redirect('/pemesanan');

    const [pembayaran, menuItems, ulasan] = await Promise.all([
      query(`SELECT * FROM pembayaran WHERE pemesanan_id=$1 ORDER BY created_at`, [req.params.id]),
      query(`SELECT * FROM menu_item WHERE paket_id=$1 ORDER BY kategori, nama_menu`, [rows[0].paket_id]),
      query(`SELECT * FROM ulasan WHERE pemesanan_id=$1`, [req.params.id]),
    ]);

    res.render('pemesanan/show', {
      title: `Pesanan ${rows[0].nomor_pesanan}`,
      pesanan: rows[0], pembayaran: pembayaran.rows,
      menuItems: menuItems.rows, ulasan: ulasan.rows[0]||null,
      statusLabel, formatRupiah, formatTanggal,
      user: req.user, success: req.query.success,
    });
  } catch (err) {
    console.error(err);
    res.render('error', { title: 'Error', message: err.message, user: req.user });
  }
};

// ─── STEP 2: Pelanggan upload bukti lunas setelah dikonfirmasi ───
const bayar = async (req, res) => {
  const pesananId = req.params.id;
  const { jumlah, metode, nomor_referensi, keterangan } = req.body;
  const buktiFoto = req.file ? `/uploads/${req.file.filename}` : null;
  try {
    // Pastikan pesanan statusnya dikonfirmasi
    const cek = await query(
      `SELECT id, total_harga FROM pemesanan WHERE id=$1 AND pelanggan_id=$2 AND status='dikonfirmasi'`,
      [pesananId, req.user.id]);
    if (cek.rows.length === 0) return res.redirect(`/pemesanan/${pesananId}`);

    await query(`
      INSERT INTO pembayaran (pemesanan_id, jumlah, metode, nomor_referensi, keterangan, status, bukti_foto, tanggal_bayar)
      VALUES ($1,$2,$3,$4,$5,$6::status_pembayaran,$7,NOW())`,
      [pesananId, jumlah, metode, nomor_referensi||null, keterangan||null,
       buktiFoto ? 'menunggu_verifikasi' : 'menunggu', buktiFoto]);

    res.redirect(`/pemesanan/${pesananId}?success=1`);
  } catch (err) {
    console.error(err);
    res.redirect(`/pemesanan/${pesananId}`);
  }
};

// ─── STEP 6: Pelanggan konfirmasi pesanan diterima → selesai ───
const konfirmasiTerima = async (req, res) => {
  const { id } = req.params;
  try {
    const cek = await query(
      `SELECT id FROM pemesanan WHERE id=$1 AND pelanggan_id=$2 AND status='sedang_dikirim'`,
      [id, req.user.id]);
    if (cek.rows.length === 0) return res.redirect(`/pemesanan/${id}`);

    await query(`UPDATE pemesanan SET status='selesai' WHERE id=$1`, [id]);
    await query(`UPDATE pengiriman SET status='selesai', waktu_tiba=NOW() WHERE pemesanan_id=$1`, [id]);
    res.redirect(`/pemesanan/${id}?success=1`);
  } catch (err) {
    console.error(err);
    res.redirect(`/pemesanan/${id}`);
  }
};

const ulasan = async (req, res) => {
  const { rating, komentar } = req.body;
  try {
    await query(`
      INSERT INTO ulasan (pemesanan_id, rating, komentar) VALUES ($1,$2,$3)
      ON CONFLICT (pemesanan_id) DO UPDATE SET rating=$2, komentar=$3`,
      [req.params.id, rating, komentar||null]);
    res.redirect(`/pemesanan/${req.params.id}?success=1`);
  } catch (err) {
    res.redirect(`/pemesanan/${req.params.id}`);
  }
};

module.exports = { index, create, store, show, bayar, konfirmasiTerima, ulasan };
