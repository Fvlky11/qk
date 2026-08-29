require('dotenv').config();
const { query } = require('./db');

async function migrate() {
  console.log('🚀 Menjalankan migrasi database...');

  await query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

  // ENUMS
  const enums = [
    [`status_pemesanan`, `'menunggu_konfirmasi','dikonfirmasi','diproses','siap_kirim','sedang_dikirim','selesai','dibatalkan'`],
    [`status_pembayaran`, `'menunggu','dp_dibayar','lunas','gagal','dikembalikan'`],
    [`metode_pembayaran`, `'transfer_bank','kartu_kredit','dompet_digital','tunai','qris'`],
    [`status_pengiriman`, `'menunggu_kurir','kurir_ditugaskan','sedang_disiapkan','dalam_perjalanan','tiba_di_lokasi','selesai','gagal'`],
    [`kategori_menu`,     `'pembuka','makanan_utama','sayuran','minuman','penutup','snack'`],
  ];
  for (const [name, vals] of enums) {
    await query(`DO $$ BEGIN CREATE TYPE ${name} AS ENUM (${vals});
      EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
  }

  // TABEL PELANGGAN — sesuai schema awal (tanpa user_id)
  await query(`
    CREATE TABLE IF NOT EXISTS pelanggan (
      id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      nama        VARCHAR(150)  NOT NULL,
      email       VARCHAR(255)  NOT NULL UNIQUE,
      password    VARCHAR(255)  NOT NULL,
      no_hp       VARCHAR(20)   NOT NULL,
      alamat      TEXT,
      kota        VARCHAR(100),
      kode_pos    VARCHAR(10),
      aktif       BOOLEAN       NOT NULL DEFAULT TRUE,
      created_at  TIMESTAMP     NOT NULL DEFAULT NOW(),
      updated_at  TIMESTAMP     NOT NULL DEFAULT NOW()
    )`);

  // TABEL PAKET_KATERING
  await query(`
    CREATE TABLE IF NOT EXISTS paket_katering (
      id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      nama_paket        VARCHAR(150)   NOT NULL,
      deskripsi         TEXT,
      min_porsi         INT            NOT NULL DEFAULT 50,
      max_porsi         INT,
      harga_per_porsi   NUMERIC(12,2)  NOT NULL,
      tersedia          BOOLEAN        NOT NULL DEFAULT TRUE,
      foto_url          TEXT,
      created_at        TIMESTAMP      NOT NULL DEFAULT NOW(),
      updated_at        TIMESTAMP      NOT NULL DEFAULT NOW()
    )`);

  // TABEL MENU_ITEM
  await query(`
    CREATE TABLE IF NOT EXISTS menu_item (
      id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      paket_id    UUID          NOT NULL REFERENCES paket_katering(id) ON DELETE CASCADE,
      nama_menu   VARCHAR(150)  NOT NULL,
      kategori    kategori_menu NOT NULL,
      deskripsi   TEXT,
      tersedia    BOOLEAN       NOT NULL DEFAULT TRUE,
      created_at  TIMESTAMP     NOT NULL DEFAULT NOW(),
      updated_at  TIMESTAMP     NOT NULL DEFAULT NOW()
    )`);

  // TABEL KURIR — sesuai schema awal (tanpa user_id, ada email & password)
  await query(`
    CREATE TABLE IF NOT EXISTS kurir (
      id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      nama        VARCHAR(150)  NOT NULL,
      email       VARCHAR(255)  UNIQUE,
      password    VARCHAR(255),
      no_hp       VARCHAR(20)   NOT NULL,
      kendaraan   VARCHAR(50),
      no_plat     VARCHAR(20),
      aktif       BOOLEAN       NOT NULL DEFAULT TRUE,
      created_at  TIMESTAMP     NOT NULL DEFAULT NOW(),
      updated_at  TIMESTAMP     NOT NULL DEFAULT NOW()
    )`);

  // TABEL PEMESANAN
  await query(`
    CREATE TABLE IF NOT EXISTS pemesanan (
      id              UUID             PRIMARY KEY DEFAULT uuid_generate_v4(),
      pelanggan_id    UUID             NOT NULL REFERENCES pelanggan(id),
      paket_id        UUID             NOT NULL REFERENCES paket_katering(id),
      nomor_pesanan   VARCHAR(30)      NOT NULL UNIQUE,
      tanggal_acara   DATE             NOT NULL,
      waktu_acara     VARCHAR(10),
      lokasi_acara    TEXT             NOT NULL,
      kota_acara      VARCHAR(100),
      jumlah_porsi    INT              NOT NULL,
      harga_per_porsi NUMERIC(12,2)    NOT NULL,
      total_harga     NUMERIC(14,2)    NOT NULL,
      status          status_pemesanan NOT NULL DEFAULT 'menunggu_konfirmasi',
      catatan         TEXT,
      alasan_batal    TEXT,
      created_at      TIMESTAMP        NOT NULL DEFAULT NOW(),
      updated_at      TIMESTAMP        NOT NULL DEFAULT NOW()
    )`);

  // TABEL PEMBAYARAN
  await query(`
    CREATE TABLE IF NOT EXISTS pembayaran (
      id              UUID             PRIMARY KEY DEFAULT uuid_generate_v4(),
      pemesanan_id    UUID             NOT NULL REFERENCES pemesanan(id),
      jumlah          NUMERIC(14,2)    NOT NULL,
      metode          metode_pembayaran NOT NULL,
      status          status_pembayaran NOT NULL DEFAULT 'menunggu',
      nomor_referensi VARCHAR(100),
      keterangan      VARCHAR(255),
      tanggal_bayar   TIMESTAMP,
      created_at      TIMESTAMP        NOT NULL DEFAULT NOW(),
      updated_at      TIMESTAMP        NOT NULL DEFAULT NOW()
    )`);

  // TABEL PENGIRIMAN — kolom bukti_foto (bukan bukti_pengiriman)
  await query(`
    CREATE TABLE IF NOT EXISTS pengiriman (
      id              UUID             PRIMARY KEY DEFAULT uuid_generate_v4(),
      pemesanan_id    UUID             NOT NULL UNIQUE REFERENCES pemesanan(id),
      kurir_id        UUID             REFERENCES kurir(id),
      status          status_pengiriman NOT NULL DEFAULT 'menunggu_kurir',
      waktu_berangkat TIMESTAMP,
      waktu_tiba      TIMESTAMP,
      lokasi_terkini  TEXT,
      bukti_foto      TEXT,
      catatan_kurir   TEXT,
      created_at      TIMESTAMP        NOT NULL DEFAULT NOW(),
      updated_at      TIMESTAMP        NOT NULL DEFAULT NOW()
    )`);

  // TABEL ULASAN
  await query(`
    CREATE TABLE IF NOT EXISTS ulasan (
      id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      pemesanan_id  UUID     NOT NULL UNIQUE REFERENCES pemesanan(id),
      rating        SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
      komentar      TEXT,
      created_at    TIMESTAMP NOT NULL DEFAULT NOW()
    )`);

  // INDEXES
  const indexes = [
    [`idx_pelanggan_email`,      `pelanggan(email)`],
    [`idx_menu_paket`,           `menu_item(paket_id)`],
    [`idx_pemesanan_pelanggan`,  `pemesanan(pelanggan_id)`],
    [`idx_pemesanan_status`,     `pemesanan(status)`],
    [`idx_pemesanan_tanggal`,    `pemesanan(tanggal_acara)`],
    [`idx_pembayaran_pesanan`,   `pembayaran(pemesanan_id)`],
    [`idx_pengiriman_kurir`,     `pengiriman(kurir_id)`],
    [`idx_pengiriman_status`,    `pengiriman(status)`],
  ];
  for (const [name, cols] of indexes) {
    await query(`CREATE INDEX IF NOT EXISTS ${name} ON ${cols}`);
  }

  // AUTO updated_at TRIGGER
  await query(`
    CREATE OR REPLACE FUNCTION fn_update_updated_at()
    RETURNS TRIGGER AS $$
    BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
    $$ LANGUAGE plpgsql`);

  const triggerTables = ['pelanggan','paket_katering','menu_item','kurir','pemesanan','pembayaran','pengiriman'];
  for (const tbl of triggerTables) {
    await query(`DROP TRIGGER IF EXISTS trg_${tbl}_updated_at ON ${tbl}`);
    await query(`
      CREATE TRIGGER trg_${tbl}_updated_at
      BEFORE UPDATE ON ${tbl}
      FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at()`);
  }

  console.log('✅ Migrasi selesai!');
  process.exit(0);
}

migrate().catch(err => {
  console.error('❌ Migrasi gagal:', err.message);
  process.exit(1);
});
