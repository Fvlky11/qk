const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query } = require('../utils/db');

const showLogin = (req, res) => {
  if (req.cookies?.token) return res.redirect('/dashboard');
  res.render('auth/login', {
    title: 'Masuk',
    error: null,
    user: null,
    registered: req.query.registered === '1',
  });
};

const showRegister = (req, res) => {
  if (req.cookies?.token) return res.redirect('/dashboard');
  res.render('auth/register', { title: 'Daftar', error: null, user: null });
};

const login = async (req, res) => {
  const { email, password } = req.body;
  try {
    // Cek admin via env
    if (email === process.env.ADMIN_EMAIL) {
      if (password !== process.env.ADMIN_PASSWORD) {
        return res.render('auth/login', {
          title: 'Masuk', error: 'Email atau password salah', user: null, registered: false,
        });
      }
      const token = jwt.sign(
        { id: 'admin', nama: 'Administrator', email, role: 'admin' },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
      );
      res.cookie('token', token, { httpOnly: true, maxAge: 7*24*60*60*1000 });
      return res.redirect('/admin/dashboard');
    }

    // Cek pelanggan
    let result = await query(
      `SELECT id, nama, email, password, no_hp, 'pelanggan' AS role
       FROM pelanggan WHERE email = $1 AND aktif = TRUE`, [email]);

    // Cek kurir
    if (result.rows.length === 0) {
      result = await query(
        `SELECT id, nama, no_hp, email, password, 'kurir' AS role
         FROM kurir WHERE email = $1 AND aktif = TRUE`, [email]);
    }

    if (result.rows.length === 0) {
      return res.render('auth/login', {
        title: 'Masuk', error: 'Email atau password salah', user: null, registered: false,
      });
    }

    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.render('auth/login', {
        title: 'Masuk', error: 'Email atau password salah', user: null, registered: false,
      });
    }

    const token = jwt.sign(
      { id: user.id, nama: user.nama, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );
    res.cookie('token', token, { httpOnly: true, maxAge: 7*24*60*60*1000 });

    const redirectMap = { admin: '/admin/dashboard', kurir: '/kurir/dashboard', pelanggan: '/dashboard' };
    return res.redirect(redirectMap[user.role] || '/dashboard');

  } catch (err) {
    console.error(err);
    res.render('auth/login', {
      title: 'Masuk', error: 'Terjadi kesalahan server', user: null, registered: false,
    });
  }
};

const register = async (req, res) => {
  const { nama, email, password, no_hp, alamat, kota } = req.body;
  try {
    const exists = await query(`SELECT id FROM pelanggan WHERE email = $1`, [email]);
    if (exists.rows.length > 0) {
      return res.render('auth/register', {
        title: 'Daftar', error: 'Email sudah terdaftar', user: null,
      });
    }
    const hash = await bcrypt.hash(password, 10);
    await query(
      `INSERT INTO pelanggan (nama, email, password, no_hp, alamat, kota)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [nama, email, hash, no_hp, alamat||null, kota||null]
    );
    return res.redirect('/auth/login?registered=1');
  } catch (err) {
    console.error(err);
    res.render('auth/register', { title: 'Daftar', error: 'Gagal mendaftar. Coba lagi.', user: null });
  }
};

const logout = (req, res) => {
  res.clearCookie('token');
  res.redirect('/auth/login');
};

module.exports = { showLogin, showRegister, login, register, logout };
