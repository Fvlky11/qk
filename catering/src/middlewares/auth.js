const jwt = require('jsonwebtoken');

const authenticate = (req, res, next) => {
  const token = req.cookies?.token || req.headers.authorization?.split(' ')[1];
  if (!token) return res.redirect('/auth/login');
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.clearCookie('token');
    return res.redirect('/auth/login');
  }
};

const authorize = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user?.role)) {
    return res.status(403).render('error', {
      title: 'Akses Ditolak',
      message: 'Anda tidak memiliki izin untuk mengakses halaman ini.',
      user: req.user,
    });
  }
  next();
};

const optionalAuth = (req, res, next) => {
  const token = req.cookies?.token;
  if (token) {
    try { req.user = jwt.verify(token, process.env.JWT_SECRET); } catch { req.user = null; }
  }
  next();
};

module.exports = { authenticate, authorize, optionalAuth };
