require('dotenv').config();
const express      = require('express');
const path         = require('path');
const cookieParser = require('cookie-parser');
const morgan       = require('morgan');
const methodOverride = require('method-override');

const app = express();

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(morgan('dev'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());
app.use(methodOverride('_method'));
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.use('/', require('./routes'));

// 404
app.use((req, res) => {
  res.status(404).render('error', {
    title: 'Halaman Tidak Ditemukan',
    message: 'Halaman yang Anda cari tidak tersedia.',
    user: null,
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).render('error', {
    title: 'Terjadi Kesalahan',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Terjadi kesalahan pada server.',
    user: null,
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🍱 Katering App berjalan di http://localhost:${PORT}`);
  console.log(`📦 Environment: ${process.env.NODE_ENV || 'development'}\n`);
});

module.exports = app;
