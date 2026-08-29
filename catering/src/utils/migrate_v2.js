require('dotenv').config();
const { query } = require('./db');

async function migrateV2() {
  console.log('🚀 Migrasi v2...');

  // Kolom di tabel pembayaran
  await query(`ALTER TABLE pembayaran ADD COLUMN IF NOT EXISTS bukti_foto TEXT`);
  await query(`ALTER TABLE pembayaran ADD COLUMN IF NOT EXISTS verified_at TIMESTAMP`);
  await query(`ALTER TABLE pembayaran ADD COLUMN IF NOT EXISTS verified_by VARCHAR(150)`);
  await query(`ALTER TABLE pembayaran ADD COLUMN IF NOT EXISTS catatan_verifikasi TEXT`);

  // Kolom di tabel pengiriman (jaga-jaga kalau belum ada)
  await query(`ALTER TABLE pengiriman ADD COLUMN IF NOT EXISTS bukti_foto TEXT`);
  await query(`ALTER TABLE pengiriman ADD COLUMN IF NOT EXISTS lokasi_terkini TEXT`);
  await query(`ALTER TABLE pengiriman ADD COLUMN IF NOT EXISTS catatan_kurir TEXT`);
  await query(`ALTER TABLE pengiriman ADD COLUMN IF NOT EXISTS waktu_berangkat TIMESTAMP`);
  await query(`ALTER TABLE pengiriman ADD COLUMN IF NOT EXISTS waktu_tiba TIMESTAMP`);

  // Tambah nilai enum baru jika belum ada
  await query(`
    DO $$ BEGIN
      ALTER TYPE status_pembayaran ADD VALUE IF NOT EXISTS 'menunggu_verifikasi';
    EXCEPTION WHEN others THEN NULL; END $$
  `).catch(() => {});

  console.log('✅ Migrasi v2 selesai!');
  process.exit(0);
}

migrateV2().catch(err => {
  console.error('❌ Gagal:', err.message);
  process.exit(1);
});
