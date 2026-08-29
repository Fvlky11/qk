const { query } = require('../utils/db');
const { formatRupiah } = require('../utils/helpers');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');

// Halaman laporan utama
const index = async (req, res) => {
  const { dari, sampai, tipe } = req.query;
  const tglDari  = dari   || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
  const tglSampai= sampai || new Date().toISOString().split('T')[0];

  try {
    const [ringkasan, perPaket, perStatus, pembayaranHarian, topPelanggan] = await Promise.all([
      // Ringkasan umum
      query(`
        SELECT
          COUNT(*) FILTER (WHERE status != 'dibatalkan')              AS total_pesanan,
          COUNT(*) FILTER (WHERE status = 'selesai')                  AS pesanan_selesai,
          COUNT(*) FILTER (WHERE status = 'dibatalkan')               AS pesanan_batal,
          COALESCE(SUM(total_harga) FILTER (WHERE status='selesai'),0) AS total_omzet,
          COALESCE(AVG(total_harga) FILTER (WHERE status='selesai'),0) AS rata_omzet,
          COALESCE(SUM(jumlah_porsi) FILTER (WHERE status='selesai'),0) AS total_porsi
        FROM pemesanan
        WHERE tanggal_acara BETWEEN $1 AND $2`, [tglDari, tglSampai]),

      // Per paket
      query(`
        SELECT pk.nama_paket,
               COUNT(p.id)                                         AS jumlah_pesanan,
               COALESCE(SUM(p.jumlah_porsi),0)                    AS total_porsi,
               COALESCE(SUM(p.total_harga) FILTER (WHERE p.status='selesai'),0) AS total_omzet
        FROM paket_katering pk
        LEFT JOIN pemesanan p ON p.paket_id=pk.id
          AND p.tanggal_acara BETWEEN $1 AND $2
          AND p.status != 'dibatalkan'
        GROUP BY pk.id, pk.nama_paket
        ORDER BY total_omzet DESC`, [tglDari, tglSampai]),

      // Per status
      query(`
        SELECT status, COUNT(*) AS jumlah,
               COALESCE(SUM(total_harga),0) AS nilai
        FROM pemesanan
        WHERE tanggal_acara BETWEEN $1 AND $2
        GROUP BY status ORDER BY jumlah DESC`, [tglDari, tglSampai]),

      // Pendapatan harian (dari pembayaran lunas)
      query(`
        SELECT DATE(tanggal_bayar) AS tgl,
               COUNT(*)            AS jumlah_transaksi,
               SUM(jumlah)         AS total
        FROM pembayaran
        WHERE status IN ('dp_dibayar','lunas')
          AND tanggal_bayar::date BETWEEN $1 AND $2
        GROUP BY DATE(tanggal_bayar)
        ORDER BY tgl ASC`, [tglDari, tglSampai]),

      // Top 5 pelanggan
      query(`
        SELECT pl.nama, pl.no_hp,
               COUNT(p.id)         AS jumlah_pesanan,
               SUM(p.total_harga)  AS total_belanja
        FROM pelanggan pl
        JOIN pemesanan p ON p.pelanggan_id=pl.id
        WHERE p.tanggal_acara BETWEEN $1 AND $2
          AND p.status != 'dibatalkan'
        GROUP BY pl.id, pl.nama, pl.no_hp
        ORDER BY total_belanja DESC LIMIT 5`, [tglDari, tglSampai]),
    ]);

    // Pendapatan dari pembayaran terverifikasi
    const pendapatanRes = await query(`
      SELECT COALESCE(SUM(pb.jumlah),0) AS total_diterima
      FROM pembayaran pb
      JOIN pemesanan p ON p.id=pb.pemesanan_id
      WHERE pb.status IN ('dp_dibayar','lunas')
        AND pb.tanggal_bayar::date BETWEEN $1 AND $2`, [tglDari, tglSampai]);

    res.render('admin/laporan', {
      title: 'Laporan',
      user: req.user,
      tglDari, tglSampai,
      ringkasan: ringkasan.rows[0],
      perPaket: perPaket.rows,
      perStatus: perStatus.rows,
      pembayaranHarian: pembayaranHarian.rows,
      topPelanggan: topPelanggan.rows,
      totalDiterima: pendapatanRes.rows[0].total_diterima,
      formatRupiah,
    });
  } catch (err) {
    console.error(err);
    res.render('error', { title: 'Error', message: err.message, user: req.user });
  }
};

// Export Excel
const exportExcel = async (req, res) => {
  const { dari, sampai } = req.query;
  const tglDari   = dari   || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
  const tglSampai = sampai || new Date().toISOString().split('T')[0];

  try {
    const { rows } = await query(`
      SELECT p.nomor_pesanan, pl.nama AS pelanggan, pl.no_hp,
             pk.nama_paket, p.tanggal_acara, p.lokasi_acara,
             p.jumlah_porsi, p.harga_per_porsi, p.total_harga,
             p.status,
             COALESCE(SUM(pb.jumlah) FILTER (WHERE pb.status IN ('dp_dibayar','lunas')),0) AS dibayar,
             p.created_at
      FROM pemesanan p
      JOIN pelanggan pl ON pl.id=p.pelanggan_id
      JOIN paket_katering pk ON pk.id=p.paket_id
      LEFT JOIN pembayaran pb ON pb.pemesanan_id=p.id
      WHERE p.tanggal_acara BETWEEN $1 AND $2
      GROUP BY p.id, pl.nama, pl.no_hp, pk.nama_paket
      ORDER BY p.tanggal_acara ASC`, [tglDari, tglSampai]);

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Katering App';
    const ws = wb.addWorksheet('Laporan Pesanan');

    // Header styling
    ws.columns = [
      { header: 'No. Pesanan',    key: 'nomor_pesanan',  width: 22 },
      { header: 'Pelanggan',      key: 'pelanggan',      width: 22 },
      { header: 'No. HP',         key: 'no_hp',          width: 16 },
      { header: 'Paket',          key: 'nama_paket',     width: 20 },
      { header: 'Tgl Acara',      key: 'tanggal_acara',  width: 14 },
      { header: 'Lokasi',         key: 'lokasi_acara',   width: 30 },
      { header: 'Porsi',          key: 'jumlah_porsi',   width: 10 },
      { header: 'Harga/Porsi',    key: 'harga_per_porsi',width: 14 },
      { header: 'Total',          key: 'total_harga',    width: 16 },
      { header: 'Dibayar',        key: 'dibayar',        width: 16 },
      { header: 'Sisa',           key: 'sisa',           width: 16 },
      { header: 'Status',         key: 'status',         width: 22 },
    ];

    // Style header row
    ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE65C00' } };
    ws.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
    ws.getRow(1).height = 22;

    // Data rows
    rows.forEach((r, i) => {
      const sisa = parseFloat(r.total_harga) - parseFloat(r.dibayar);
      const row = ws.addRow({
        nomor_pesanan:   r.nomor_pesanan,
        pelanggan:       r.pelanggan,
        no_hp:           r.no_hp,
        nama_paket:      r.nama_paket,
        tanggal_acara:   new Date(r.tanggal_acara).toLocaleDateString('id-ID'),
        lokasi_acara:    r.lokasi_acara,
        jumlah_porsi:    parseInt(r.jumlah_porsi),
        harga_per_porsi: parseFloat(r.harga_per_porsi),
        total_harga:     parseFloat(r.total_harga),
        dibayar:         parseFloat(r.dibayar),
        sisa:            sisa,
        status:          r.status.replace(/_/g, ' '),
      });

      // Zebra stripe
      if (i % 2 === 0) {
        row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF3EE' } };
      }

      // Number format
      ['harga_per_porsi','total_harga','dibayar','sisa'].forEach(col => {
        row.getCell(col).numFmt = '#,##0';
      });

      // Status color
      const statusColors = {
        selesai: 'FF198754', dibatalkan: 'FFDC3545',
        menunggu_konfirmasi: 'FFFFC107', dikonfirmasi: 'FF0DCAF0',
      };
      const statusCell = row.getCell('status');
      if (statusColors[r.status]) {
        statusCell.font = { color: { argb: statusColors[r.status] }, bold: true };
      }
    });

    // Total row
    const totalRow = ws.addRow({
      nomor_pesanan: 'TOTAL',
      total_harga: rows.reduce((s, r) => s + parseFloat(r.total_harga), 0),
      dibayar:     rows.reduce((s, r) => s + parseFloat(r.dibayar), 0),
      sisa:        rows.reduce((s, r) => s + (parseFloat(r.total_harga) - parseFloat(r.dibayar)), 0),
    });
    totalRow.font = { bold: true };
    totalRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFEEDD' } };
    ['total_harga','dibayar','sisa'].forEach(col => {
      totalRow.getCell(col).numFmt = '#,##0';
    });

    // Auto filter
    ws.autoFilter = { from: 'A1', to: 'L1' };

    // Sheet 2: Rekap per paket
    const ws2 = wb.addWorksheet('Rekap Per Paket');
    ws2.columns = [
      { header: 'Paket',          key: 'nama_paket',    width: 24 },
      { header: 'Jml Pesanan',    key: 'jumlah_pesanan',width: 14 },
      { header: 'Total Porsi',    key: 'total_porsi',   width: 14 },
      { header: 'Total Omzet',    key: 'total_omzet',   width: 18 },
    ];
    ws2.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    ws2.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE65C00' } };

    const paketRows = await query(`
      SELECT pk.nama_paket, COUNT(p.id) AS jumlah_pesanan,
             COALESCE(SUM(p.jumlah_porsi),0) AS total_porsi,
             COALESCE(SUM(p.total_harga) FILTER (WHERE p.status='selesai'),0) AS total_omzet
      FROM paket_katering pk
      LEFT JOIN pemesanan p ON p.paket_id=pk.id
        AND p.tanggal_acara BETWEEN $1 AND $2 AND p.status!='dibatalkan'
      GROUP BY pk.id, pk.nama_paket ORDER BY total_omzet DESC`, [tglDari, tglSampai]);

    paketRows.rows.forEach(r => {
      const row = ws2.addRow({
        nama_paket:     r.nama_paket,
        jumlah_pesanan: parseInt(r.jumlah_pesanan),
        total_porsi:    parseInt(r.total_porsi),
        total_omzet:    parseFloat(r.total_omzet),
      });
      row.getCell('total_omzet').numFmt = '#,##0';
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=laporan-katering-${tglDari}-${tglSampai}.xlsx`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error(err);
    res.redirect('/admin/laporan');
  }
};

// Export PDF
const exportPDF = async (req, res) => {
  const { dari, sampai } = req.query;
  const tglDari   = dari   || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
  const tglSampai = sampai || new Date().toISOString().split('T')[0];

  try {
    const [pesanan, ringkasan] = await Promise.all([
      query(`
        SELECT p.nomor_pesanan, pl.nama AS pelanggan, pk.nama_paket,
               p.tanggal_acara, p.jumlah_porsi, p.total_harga, p.status,
               COALESCE(SUM(pb.jumlah) FILTER (WHERE pb.status IN ('dp_dibayar','lunas')),0) AS dibayar
        FROM pemesanan p
        JOIN pelanggan pl ON pl.id=p.pelanggan_id
        JOIN paket_katering pk ON pk.id=p.paket_id
        LEFT JOIN pembayaran pb ON pb.pemesanan_id=p.id
        WHERE p.tanggal_acara BETWEEN $1 AND $2
        GROUP BY p.id, pl.nama, pk.nama_paket
        ORDER BY p.tanggal_acara ASC`, [tglDari, tglSampai]),
      query(`
        SELECT COUNT(*) FILTER (WHERE status!='dibatalkan') AS total_pesanan,
               COUNT(*) FILTER (WHERE status='selesai') AS selesai,
               COALESCE(SUM(total_harga) FILTER (WHERE status='selesai'),0) AS omzet
        FROM pemesanan WHERE tanggal_acara BETWEEN $1 AND $2`, [tglDari, tglSampai]),
    ]);

    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=laporan-katering-${tglDari}-${tglSampai}.pdf`);
    doc.pipe(res);

    const orange = '#E65C00';
    const W = doc.page.width - 80;

    // Header
    doc.rect(40, 40, W, 60).fill(orange);
    doc.fillColor('white').fontSize(18).font('Helvetica-Bold')
       .text('LAPORAN KATERING APP', 50, 52);
    doc.fontSize(10).font('Helvetica')
       .text(`Periode: ${tglDari} s/d ${tglSampai}`, 50, 76);
    doc.fillColor('black');

    // Ringkasan
    const r = ringkasan.rows[0];
    doc.y = 120;
    doc.fontSize(12).font('Helvetica-Bold').text('RINGKASAN', 40);
    doc.moveDown(0.3);
    const cols = [
      ['Total Pesanan', r.total_pesanan],
      ['Pesanan Selesai', r.selesai],
      ['Total Omzet', `Rp ${parseInt(r.omzet).toLocaleString('id-ID')}`],
    ];
    cols.forEach(([label, val]) => {
      doc.fontSize(10).font('Helvetica').fillColor('#555').text(label + ':', 40, doc.y, { continued: true });
      doc.fillColor('black').font('Helvetica-Bold').text(' ' + val);
    });

    // Tabel pesanan
    doc.moveDown(1);
    doc.fontSize(12).font('Helvetica-Bold').fillColor('black').text('DETAIL PESANAN');
    doc.moveDown(0.3);

    // Table header
    const colW = [110, 90, 80, 60, 90, 80];
    const headers = ['No. Pesanan', 'Pelanggan', 'Paket', 'Porsi', 'Total', 'Status'];
    const startX = 40;
    let y = doc.y;

    doc.rect(startX, y, W, 18).fill(orange);
    let x = startX + 4;
    headers.forEach((h, i) => {
      doc.fillColor('white').fontSize(8).font('Helvetica-Bold').text(h, x, y + 5, { width: colW[i] - 4 });
      x += colW[i];
    });
    y += 18;

    // Table rows
    pesanan.rows.forEach((row, idx) => {
      if (y > doc.page.height - 80) { doc.addPage(); y = 40; }
      const bg = idx % 2 === 0 ? '#FFF3EE' : '#FFFFFF';
      doc.rect(startX, y, W, 16).fill(bg);
      x = startX + 4;
      const cells = [
        row.nomor_pesanan,
        row.pelanggan.substring(0, 14),
        row.nama_paket.substring(0, 12),
        row.jumlah_porsi.toString(),
        `Rp ${parseInt(row.total_harga).toLocaleString('id-ID')}`,
        row.status.replace(/_/g, ' ').substring(0, 12),
      ];
      cells.forEach((cell, i) => {
        doc.fillColor('#222').fontSize(7.5).font('Helvetica').text(cell, x, y + 4, { width: colW[i] - 4 });
        x += colW[i];
      });
      y += 16;
    });

    // Footer
    doc.rect(40, y + 10, W, 1).fill('#ddd');
    doc.fillColor('#888').fontSize(8).font('Helvetica')
       .text(`Dicetak: ${new Date().toLocaleString('id-ID')} | Katering App`, 40, y + 18, { align: 'center', width: W });

    doc.end();
  } catch (err) {
    console.error(err);
    res.redirect('/admin/laporan');
  }
};

module.exports = { index, exportExcel, exportPDF };
