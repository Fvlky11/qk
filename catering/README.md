# 🍱 Katering App — Node.js + Express MVC

Aplikasi pemesanan dan pengiriman katering berbasis web dengan fitur JWT authentication dan upload foto bukti pengiriman.

---

## 🧱 Tech Stack

| Layer       | Teknologi |
|-------------|-----------|
| Runtime     | Node.js   |
| Framework   | Express.js (MVC) |
| Database    | PostgreSQL |
| ORM / Query | `pg` (raw query) |
| Views       | EJS + Bootstrap 5 |
| Auth        | JWT (cookie-based) |
| Upload      | Multer |

---

## 📁 Struktur Folder

```
katering-app/
├── src/
│   ├── app.js                  # Entry point
│   ├── controllers/
│   │   ├── authController.js
│   │   ├── pemesananController.js
│   │   ├── adminController.js
│   │   └── kurirController.js
│   ├── middlewares/
│   │   ├── auth.js             # JWT authenticate / authorize
│   │   └── upload.js           # Multer upload foto
│   ├── routes/
│   │   └── index.js
│   ├── utils/
│   │   ├── db.js               # PostgreSQL connection pool
│   │   ├── migrate.js          # Buat tabel & index
│   │   ├── seed.js             # Data awal (demo)
│   │   └── helpers.js          # formatRupiah, statusLabel, dll.
│   └── views/
│       ├── partials/           # head, navbar, sidebar-admin, footer
│       ├── auth/               # login, register
│       ├── pemesanan/          # index, create, show
│       ├── admin/              # dashboard, pesanan, kurir, paket
│       ├── kurir/              # dashboard
│       ├── home.ejs
│       ├── dashboard.ejs
│       └── error.ejs
├── prisma/                     # (referensi schema, tidak digunakan)
├── .env.example
├── package.json
└── README.md
```

---

## 🚀 Cara Menjalankan

### 1. Persiapan Database PostgreSQL

```sql
CREATE DATABASE katering_db;
```

### 2. Konfigurasi Environment

```bash
cp .env.example .env
# Edit .env sesuai konfigurasi database Anda
```

Isi `.env`:
```env
DATABASE_URL=postgresql://postgres:password@localhost:5432/katering_db
JWT_SECRET=your_super_secret_key_minimum_32_chars
JWT_EXPIRES_IN=7d
PORT=3000
NODE_ENV=development
```

### 3. Install Dependencies

```bash
npm install
```

### 4. Jalankan Migrasi (Buat Tabel)

```bash
npm run db:migrate
```

### 5. Seed Data Demo

```bash
npm run db:seed
```

### 6. Jalankan Aplikasi

```bash
# Development (auto-reload)
npm run dev

# Production
npm start
```

Buka browser: **http://localhost:3000**

---

## 👤 Akun Demo

| Role       | Email                  | Password      |
|------------|------------------------|---------------|
| Admin      | admin@katering.com     | admin123      |
| Pelanggan  | budi@email.com         | pelanggan123  |
| Kurir      | eko@katering.com       | kurir123      |

---

## 🗺️ Alur Aplikasi

```
Pelanggan:
  Daftar → Login → Pilih Paket → Buat Pesanan → Bayar → Pantau Pengiriman → Beri Ulasan

Admin:
  Login → Konfirmasi Pesanan → Tugaskan Kurir → Monitor Status

Kurir:
  Login → Lihat Tugas → Update Status → Upload Bukti Foto
```

---

## 📡 Routes

### Public
| Method | Path              | Keterangan     |
|--------|-------------------|----------------|
| GET    | /                 | Halaman utama  |
| GET    | /auth/login       | Form login     |
| POST   | /auth/login       | Proses login   |
| GET    | /auth/register    | Form daftar    |
| POST   | /auth/register    | Proses daftar  |
| GET    | /auth/logout      | Logout         |

### Pelanggan
| Method | Path                          | Keterangan              |
|--------|-------------------------------|-------------------------|
| GET    | /dashboard                    | Dashboard pelanggan     |
| GET    | /pemesanan                    | Daftar pesanan          |
| GET    | /pemesanan/buat               | Form buat pesanan       |
| POST   | /pemesanan                    | Simpan pesanan          |
| GET    | /pemesanan/:id                | Detail pesanan          |
| POST   | /pemesanan/:id/bayar          | Tambah pembayaran       |
| POST   | /pemesanan/:id/ulasan         | Kirim ulasan            |

### Admin
| Method | Path                             | Keterangan              |
|--------|----------------------------------|-------------------------|
| GET    | /admin/dashboard                 | Dashboard               |
| GET    | /admin/pesanan                   | Daftar semua pesanan    |
| POST   | /admin/pesanan/:id/status        | Update status pesanan   |
| POST   | /admin/pesanan/tugaskan          | Tugaskan kurir          |
| GET    | /admin/kurir                     | Kelola kurir            |
| POST   | /admin/kurir                     | Tambah kurir            |
| GET    | /admin/paket                     | Kelola paket            |
| POST   | /admin/paket                     | Tambah paket            |
| POST   | /admin/menu                      | Tambah menu item        |

### Kurir
| Method | Path                              | Keterangan              |
|--------|-----------------------------------|-------------------------|
| GET    | /kurir/dashboard                  | Dashboard kurir         |
| POST   | /kurir/pengiriman/:id/update      | Update + upload foto    |

---

## 🔐 Keamanan

- Password di-hash dengan **bcryptjs** (salt round 10)
- JWT disimpan sebagai **httpOnly cookie** (tidak bisa diakses JS)
- Role-based access control: `admin`, `pelanggan`, `kurir`
- File upload hanya menerima format gambar (jpg, png, webp) maks. 5MB

---

## 🛠️ Pengembangan Lanjutan

Beberapa fitur yang bisa ditambahkan:
- [ ] Notifikasi email / WhatsApp (nodemailer / Twilio)
- [ ] Pagination pada tabel pesanan
- [ ] Export laporan PDF / Excel
- [ ] Dashboard statistik dengan Chart.js
- [ ] PWA / push notification untuk kurir
- [ ] Integrasi payment gateway (Midtrans / Xendit)
