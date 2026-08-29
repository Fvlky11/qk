const generateNomorPesanan = () => {
  const now = new Date();
  const tgl = now.toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `KTR-${tgl}-${rand}`;
};

const formatRupiah = (amount) => {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency', currency: 'IDR', minimumFractionDigits: 0,
  }).format(amount);
};

const formatTanggal = (date) => {
  return new Date(date).toLocaleDateString('id-ID', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
};

const statusLabel = {
  menunggu_konfirmasi: { text: 'Menunggu Konfirmasi', class: 'warning' },
  dikonfirmasi:        { text: 'Dikonfirmasi',        class: 'info'    },
  diproses:            { text: 'Diproses',             class: 'info'    },
  siap_kirim:          { text: 'Siap Kirim',           class: 'primary' },
  sedang_dikirim:      { text: 'Sedang Dikirim',       class: 'primary' },
  selesai:             { text: 'Selesai',               class: 'success' },
  dibatalkan:          { text: 'Dibatalkan',            class: 'danger'  },
};

const statusPembayaranLabel = {
  menunggu:     { text: 'Menunggu',     class: 'warning' },
  dp_dibayar:   { text: 'DP Dibayar',   class: 'info'    },
  lunas:        { text: 'Lunas',        class: 'success' },
  gagal:        { text: 'Gagal',        class: 'danger'  },
  dikembalikan: { text: 'Dikembalikan', class: 'secondary'},
};

const statusPengirimanLabel = {
  menunggu_kurir:    { text: 'Menunggu Kurir',    class: 'warning'  },
  kurir_ditugaskan:  { text: 'Kurir Ditugaskan',  class: 'info'     },
  sedang_disiapkan:  { text: 'Sedang Disiapkan',  class: 'info'     },
  dalam_perjalanan:  { text: 'Dalam Perjalanan',  class: 'primary'  },
  tiba_di_lokasi:    { text: 'Tiba di Lokasi',    class: 'success'  },
  selesai:           { text: 'Selesai',            class: 'success'  },
  gagal:             { text: 'Gagal',              class: 'danger'   },
};

module.exports = {
  generateNomorPesanan,
  formatRupiah,
  formatTanggal,
  statusLabel,
  statusPembayaranLabel,
  statusPengirimanLabel,
};
