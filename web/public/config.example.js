// Salin file ini menjadi config.js (satu folder dengan index.html), lalu isi alamat /exec backend Apps Script.
//   env 'staging'    = website uji (badge STAGING tampil), apiUrl = URL /exec deployment staging
//   env 'production' = website admin sehari-hari, apiUrl = URL /exec deployment production
// Hanya alamat https://script.google.com/macros/s/<ID>/exec yang diterima.
window.SISI_CONFIG = {
  env: 'staging',
  apiUrl: 'https://script.google.com/macros/s/ISI_ID_DEPLOYMENT/exec',
};
