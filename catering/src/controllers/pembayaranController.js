const { query } = require('../utils/db');
const { formatRupiah, formatTanggal } = require('../utils/helpers');
const path = require('path');

// Pelanggan: upload bukti pembayaran
const uploadBukti = async (req, res) => {
  const { id } = req.params; // pembayaran id
  const { jumlah, metode, nomor_referensi, keterangan } = req.body;
  const buktiFoto = req.file ? `/uploads/${req.file.filename}` : null;

  try {
    // Cek pembayaran sudah ada atau buat baru
    const existing = await query(`SELECT id FROM pembayaran WHERE id=$1`, [id]);

    if (existing.rows.length > 0) {
      // Update bukti foto pada pembayaran yang sudah ada
      await query(`
        UPDATE pembayaran
        SET bukti_foto=$1, status='menunggu_verifikasi', updated_at=NOW()
        WHERE id=$2`,
        [buktiFoto, id]);
    }

    const pesananId = req.body.pemesanan_id;
    res.redirect(`/pemesanan/${pesananId}?success=1`);
  } catch (err) {
    console.error(err);
    res.redirect('back');
  }
};

// Pelanggan: tambah pembayaran baru + upload bukti sekaligus
const store = async (req, res) => {
  const { pemesanan_id, jumlah, metode, nomor_referensi, keterangan } = req.body;
  const buktiFoto = req.file ? `/uploads/${req.file.filename}` : null;

  try {
    // Status awal: menunggu_verifikasi jika ada bukti, menunggu jika tidak
    const status = buktiFoto ? 'menunggu_verifikasi' : 'menunggu';

    await query(`
      INSERT INTO pembayaran
        (pemesanan_id, jumlah, metode, nomor_referensi, keterangan, status, bukti_foto, tanggal_bayar)
      VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())`,
      [pemesanan_id, jumlah, metode, nomor_referensi||null, keterangan||null, status, buktiFoto]);

    res.redirect(`/pemesanan/${pemesanan_id}?success=1`);
  } catch (err) {
    console.error(err);
    res.redirect(`/pemesanan/${pemesanan_id}`);
  }
};

// Admin: daftar semua pembayaran yang perlu diverifikasi
const verifikasiList = async (req, res) => {
  try {
    const { status } = req.query;
    let sql = `
      SELECT pb.*, p.nomor_pesanan, p.total_harga, pl.nama AS nama_pelanggan, pl.no_hp
      FROM pembayaran pb
      JOIN pemesanan p ON p.id = pb.pemesanan_id
      JOIN pelanggan pl ON pl.id = p.pelanggan_id
      WHERE 1=1`;
    const params = [];

    if (status) {
      params.push(status);
      sql += ` AND pb.status = $${params.length}`;
    } else {
      sql += ` AND pb.status IN ('menunggu','menunggu_verifikasi')`;
    }
    sql += ` ORDER BY pb.created_at ASC`;

    const { rows } = await query(sql, params);
    res.render('admin/verifikasi-pembayaran', {
      title: 'Verifikasi Pembayaran',
      pembayaran: rows,
      filterStatus: status || '',
      formatRupiah,
      formatTanggal,
      user: req.user,
    });
  } catch (err) {
    console.error(err);
    res.render('error', { title: 'Error', message: err.message, user: req.user });
  }
};

// Admin: approve pembayaran
const approve = async (req, res) => {
  const { id } = req.params;
  const { catatan_verifikasi } = req.body;
  try {
    await query(`
      UPDATE pembayaran
      SET status='dp_dibayar', verified_at=NOW(), verified_by=$1, catatan_verifikasi=$2
      WHERE id=$3`,
      [req.user.nama, catatan_verifikasi||null, id]);

    // Cek apakah total sudah lunas
    const pb = await query(`SELECT pemesanan_id FROM pembayaran WHERE id=$1`, [id]);
    const pemesananId = pb.rows[0].pemesanan_id;

    const totalRes = await query(`
      SELECT p.total_harga, COALESCE(SUM(pb2.jumlah),0) AS dibayar
      FROM pemesanan p
      LEFT JOIN pembayaran pb2 ON pb2.pemesanan_id=p.id
        AND pb2.status IN ('dp_dibayar','lunas')
      WHERE p.id=$1 GROUP BY p.total_harga`, [pemesananId]);

    const { total_harga, dibayar } = totalRes.rows[0];
    if (parseFloat(dibayar) >= parseFloat(total_harga)) {
      await query(`UPDATE pembayaran SET status='lunas' WHERE pemesanan_id=$1`, [pemesananId]);

      // Update status pesanan jadi dikonfirmasi jika sebelumnya masih menunggu
      await query(`
        UPDATE pemesanan SET status='dikonfirmasi'
        WHERE id=$1 AND status='menunggu_konfirmasi'`, [pemesananId]);
    }

    res.redirect('/admin/pembayaran');
  } catch (err) {
    console.error(err);
    res.redirect('/admin/pembayaran');
  }
};

// Admin: tolak pembayaran
const tolak = async (req, res) => {
  const { id } = req.params;
  const { catatan_verifikasi } = req.body;
  try {
    await query(`
      UPDATE pembayaran
      SET status='gagal', verified_at=NOW(), verified_by=$1, catatan_verifikasi=$2
      WHERE id=$3`,
      [req.user.nama, catatan_verifikasi||null, id]);
    res.redirect('/admin/pembayaran');
  } catch (err) {
    console.error(err);
    res.redirect('/admin/pembayaran');
  }
};

module.exports = { store, uploadBukti, verifikasiList, approve, tolak };
