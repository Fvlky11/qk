require('dotenv').config();
const bcrypt = require('bcryptjs');
const { query } = require('./db');

async function seed() {
  console.log('🌱 Menjalankan seed data...');

  // Pelanggan demo
  const plgPass = await bcrypt.hash('pelanggan123', 10);
  await query(`
    INSERT INTO pelanggan (nama, email, password, no_hp, alamat, kota)
    VALUES ('Budi Santoso', 'budi@email.com', $1, '081234567890', 'Jl. Mawar No. 10', 'Yogyakarta')
    ON CONFLICT (email) DO NOTHING`, [plgPass]);

  await query(`
    INSERT INTO pelanggan (nama, email, password, no_hp, alamat, kota)
    VALUES ('Siti Aminah', 'siti@email.com', $1, '081298765432', 'Jl. Melati No. 5', 'Yogyakarta')
    ON CONFLICT (email) DO NOTHING`, [plgPass]);

  // Kurir demo (dengan email & password untuk login)
  const kurirPass = await bcrypt.hash('kurir123', 10);
  await query(`
    INSERT INTO kurir (nama, email, password, no_hp, kendaraan, no_plat)
    VALUES ('Eko Prasetyo', 'eko@katering.com', $1, '083456789012', 'Pickup Bak', 'AB 1234 CD')
    ON CONFLICT (email) DO NOTHING`, [kurirPass]);

  await query(`
    INSERT INTO kurir (nama, email, password, no_hp, kendaraan, no_plat)
    VALUES ('Rudi Hartono', 'rudi@katering.com', $1, '085678901234', 'Van Box', 'AB 5678 EF')
    ON CONFLICT (email) DO NOTHING`, [kurirPass]);

  await query(`
    INSERT INTO kurir (nama, no_hp, kendaraan, no_plat)
    VALUES ('Dewi Rahayu', '082345678901', 'Motor Roda Tiga', 'AB 9012 GH')
    ON CONFLICT DO NOTHING`);

  // Paket katering
  const paketStandar = await query(`
    INSERT INTO paket_katering (nama_paket, deskripsi, min_porsi, max_porsi, harga_per_porsi)
    VALUES ('Paket Standar', 'Paket hemat untuk acara keluarga dan arisan', 50, 200, 45000)
    ON CONFLICT DO NOTHING RETURNING id`);

  const paketExec = await query(`
    INSERT INTO paket_katering (nama_paket, deskripsi, min_porsi, max_porsi, harga_per_porsi)
    VALUES ('Paket Eksekutif', 'Paket lengkap untuk acara formal dan korporat', 100, 500, 75000)
    ON CONFLICT DO NOTHING RETURNING id`);

  await query(`
    INSERT INTO paket_katering (nama_paket, deskripsi, min_porsi, harga_per_porsi)
    VALUES ('Paket Premium', 'Paket mewah dengan chef pribadi dan dekorasi meja', 150, 125000)
    ON CONFLICT DO NOTHING`);

  // Menu Paket Standar
  if (paketStandar.rows.length > 0) {
    const pid = paketStandar.rows[0].id;
    const menus = [
      [pid, 'Sup Buntut',         'pembuka'],
      [pid, 'Nasi Putih',         'makanan_utama'],
      [pid, 'Ayam Goreng Kremes', 'makanan_utama'],
      [pid, 'Rendang Sapi',       'makanan_utama'],
      [pid, 'Tumis Kangkung',     'sayuran'],
      [pid, 'Es Teh Manis',       'minuman'],
      [pid, 'Puding Coklat',      'penutup'],
    ];
    for (const [paketId, namaMenu, kategori] of menus) {
      await query(
        `INSERT INTO menu_item (paket_id, nama_menu, kategori) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
        [paketId, namaMenu, kategori]);
    }
  }

  // Menu Paket Eksekutif
  if (paketExec.rows.length > 0) {
    const pid = paketExec.rows[0].id;
    const menus = [
      [pid, 'Salad Buah',          'pembuka'],
      [pid, 'Nasi Putih',          'makanan_utama'],
      [pid, 'Ayam Bakar Taliwang', 'makanan_utama'],
      [pid, 'Ikan Bakar Rica-Rica','makanan_utama'],
      [pid, 'Cah Brokoli',         'sayuran'],
      [pid, 'Jus Jeruk',           'minuman'],
      [pid, 'Es Buah',             'minuman'],
      [pid, 'Kue Lapis Legit',     'penutup'],
    ];
    for (const [paketId, namaMenu, kategori] of menus) {
      await query(
        `INSERT INTO menu_item (paket_id, nama_menu, kategori) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
        [paketId, namaMenu, kategori]);
    }
  }

  console.log('\n✅ Seed selesai!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`👤 Admin    : ${process.env.ADMIN_EMAIL || 'admin@katering.com'} / (lihat .env ADMIN_PASSWORD)`);
  console.log('🛒 Pelanggan: budi@email.com / pelanggan123');
  console.log('🛒 Pelanggan: siti@email.com / pelanggan123');
  console.log('🚚 Kurir    : eko@katering.com / kurir123');
  console.log('🚚 Kurir    : rudi@katering.com / kurir123');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  process.exit(0);
}

seed().catch(err => {
  console.error('❌ Seed gagal:', err.message);
  process.exit(1);
});
