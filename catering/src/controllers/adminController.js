const { query } = require('../utils/db');
const { formatRupiah, formatTanggal, statusLabel } = require('../utils/helpers');

const dashboard = async (req, res) => {
  try {
    const [stats, recentPesanan, pendapatan] = await Promise.all([
      query(`SELECT
        COUNT(*) FILTER (WHERE status != 'dibatalkan')          AS total_pesanan,
        COUNT(*) FILTER (WHERE status = 'menunggu_konfirmasi')  AS menunggu,
        COUNT(*) FILTER (WHERE status = 'diproses')             AS diproses,
        COUNT(*) FILTER (WHERE status = 'sedang_dikirim')       AS sedang_dikirim,
        COUNT(*) FILTER (WHERE status = 'selesai')              AS selesai,
        (SELECT COUNT(*) FROM pelanggan)                        AS total_pelanggan,
        (SELECT COUNT(*) FROM kurir WHERE aktif = TRUE)         AS total_kurir
        FROM pemesanan`),
      query(`
        SELECT p.*, pl.nama AS nama_pelanggan, pk.nama_paket
        FROM pemesanan p
        JOIN pelanggan pl ON pl.id = p.pelanggan_id
        JOIN paket_katering pk ON pk.id = p.paket_id
        ORDER BY p.created_at DESC LIMIT 8`),
      query(`SELECT COALESCE(SUM(jumlah),0) AS total
             FROM pembayaran WHERE status = 'lunas'`),
    ]);
    res.render('admin/dashboard', {
      title: 'Dashboard Admin', stats: stats.rows[0], user: req.user,
      recentPesanan: recentPesanan.rows, statusLabel, formatRupiah, formatTanggal,
      totalPendapatan: pendapatan.rows[0].total,
    });
  } catch (err) {
    console.error(err);
    res.render('error', { title: 'Error', message: err.message, user: req.user });
  }
};

// ─── Daftar pesanan ───────────────────────────────────────────
const pesananList = async (req, res) => {
  const { status, search } = req.query;
  try {
    let sql = `
      SELECT
        p.*,
        pl.nama   AS nama_pelanggan,
        pl.no_hp,
        pk.nama_paket,
        pg.id     AS pengiriman_id,
        COALESCE(SUM(pb.jumlah) FILTER (WHERE pb.status = 'lunas'), 0) AS total_dibayar,
        -- ada bukti transfer yg menunggu verifikasi?
        BOOL_OR(pb.bukti_foto IS NOT NULL AND pb.status::text = 'menunggu_verifikasi') AS ada_bukti_pending,
        -- kumpulkan bukti untuk modal
        JSON_AGG(JSON_BUILD_OBJECT(
          'id',         pb.id,
          'bukti_foto', pb.bukti_foto,
          'jumlah',     pb.jumlah,
          'metode',     pb.metode::text,
          'keterangan', pb.keterangan
        )) FILTER (WHERE pb.bukti_foto IS NOT NULL AND pb.status::text = 'menunggu_verifikasi')
          AS bukti_list
      FROM pemesanan p
      JOIN pelanggan      pl ON pl.id = p.pelanggan_id
      JOIN paket_katering pk ON pk.id = p.paket_id
      LEFT JOIN pengiriman pg ON pg.pemesanan_id = p.id
      LEFT JOIN pembayaran pb ON pb.pemesanan_id = p.id
      WHERE 1=1`;
    const params = [];
    if (status) { params.push(status); sql += ` AND p.status = $${params.length}`; }
    if (search) {
      params.push(`%${search}%`);
      sql += ` AND (pl.nama ILIKE $${params.length} OR p.nomor_pesanan ILIKE $${params.length})`;
    }
    sql += ` GROUP BY p.id, pl.nama, pl.no_hp, pk.nama_paket, pg.id ORDER BY p.created_at DESC`;

    const { rows } = await query(sql, params);
    res.render('admin/pesanan', {
      title: 'Kelola Pesanan', pesanan: rows, statusLabel,
      formatRupiah, formatTanggal, user: req.user,
      filterStatus: status || '', search: search || '',
    });
  } catch (err) {
    console.error(err);
    res.render('error', { title: 'Error', message: err.message, user: req.user });
  }
};

// ─── STEP 1: Admin konfirmasi pesanan ────────────────────────
// menunggu_konfirmasi → dikonfirmasi
const konfirmasiPesanan = async (req, res) => {
  try {
    await query(
      `UPDATE pemesanan SET status='dikonfirmasi' WHERE id=$1 AND status='menunggu_konfirmasi'`,
      [req.params.id]);
  } catch (err) { console.error(err); }
  res.redirect('/admin/pesanan');
};

// ─── STEP 3: Admin verifikasi bukti pembayaran ───────────────
// Jika approve → cek apakah lunas → kalau lunas ubah status pesanan jadi diproses
const verifikasiBayar = async (req, res) => {
  const { aksi, catatan_verifikasi } = req.body;
  const { id } = req.params; // id pembayaran
  try {
    if (aksi === 'approve') {
      // Tandai pembayaran ini lunas
      await query(`
        UPDATE pembayaran SET status='lunas', verified_at=NOW(), verified_by=$1, catatan_verifikasi=$2
        WHERE id=$3`,
        [req.user.nama, catatan_verifikasi||null, id]);

      // Ambil pemesanan_id
      const pbRes = await query(`SELECT pemesanan_id FROM pembayaran WHERE id=$1`, [id]);
      const pemesananId = pbRes.rows[0].pemesanan_id;

      // Cek apakah total pembayaran lunas sudah >= total pesanan
      const cek = await query(`
        SELECT p.total_harga,
               COALESCE(SUM(pb.jumlah) FILTER (WHERE pb.status='lunas'), 0) AS dibayar
        FROM pemesanan p
        LEFT JOIN pembayaran pb ON pb.pemesanan_id = p.id
        WHERE p.id=$1 GROUP BY p.total_harga`, [pemesananId]);

      const { total_harga, dibayar } = cek.rows[0];
      if (parseFloat(dibayar) >= parseFloat(total_harga)) {
        // Pembayaran lunas → status pesanan jadi diproses
        await query(`UPDATE pemesanan SET status='diproses' WHERE id=$1`, [pemesananId]);
      }

    } else {
      // Tolak → kembalikan ke menunggu, hapus bukti agar pelanggan upload ulang
      await query(`
        UPDATE pembayaran SET status='menunggu', bukti_foto=NULL,
          verified_at=NOW(), verified_by=$1, catatan_verifikasi=$2
        WHERE id=$3`,
        [req.user.nama, catatan_verifikasi||null, id]);
    }
  } catch (err) { console.error(err); }
  res.redirect('/admin/pesanan');
};

// ─── STEP 4: Admin set siap kirim + tugaskan kurir ───────────
// diproses → siap_kirim
const siapKirim = async (req, res) => {
  const { kurir_id } = req.body;
  try {
    if (!kurir_id) return res.redirect('/admin/pesanan');
    await query(`UPDATE pemesanan SET status='siap_kirim' WHERE id=$1`, [req.params.id]);
    await query(`UPDATE pengiriman SET kurir_id=$1, status='kurir_ditugaskan' WHERE pemesanan_id=$2`,
      [kurir_id, req.params.id]);
  } catch (err) { console.error(err); }
  res.redirect('/admin/pesanan');
};

// ─── Batalkan pesanan ────────────────────────────────────────
const batalPesanan = async (req, res) => {
  const { alasan_batal } = req.body;
  try {
    await query(`UPDATE pemesanan SET status='dibatalkan', alasan_batal=$1 WHERE id=$2`,
      [alasan_batal||null, req.params.id]);
  } catch (err) { console.error(err); }
  res.redirect('/admin/pesanan');
};

const kurirList = async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT k.*, COUNT(pg.id) AS total_pengiriman
      FROM kurir k LEFT JOIN pengiriman pg ON pg.kurir_id = k.id
      GROUP BY k.id ORDER BY k.nama`);
    res.render('admin/kurir', { title: 'Kelola Kurir', kurir: rows, user: req.user });
  } catch (err) {
    res.render('error', { title: 'Error', message: err.message, user: req.user });
  }
};

const paketList = async (req, res) => {
  try {
    const [paket, menuItems] = await Promise.all([
      query(`SELECT * FROM paket_katering ORDER BY harga_per_porsi`),
      query(`SELECT * FROM menu_item ORDER BY paket_id, kategori, nama_menu`),
    ]);
    res.render('admin/paket', {
      title: 'Kelola Paket', paket: paket.rows,
      menuItems: menuItems.rows, user: req.user, formatRupiah,
    });
  } catch (err) {
    res.render('error', { title: 'Error', message: err.message, user: req.user });
  }
};

module.exports = { dashboard, pesananList, konfirmasiPesanan, verifikasiBayar, siapKirim, batalPesanan, kurirList, paketList };
