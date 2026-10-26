/** Nama singkat perangkat untuk log_Audit (kolom perangkat, maks 120 karakter), mis. "Web · Chrome · Windows". */
export function namaPerangkat(ua = (globalThis.navigator && globalThis.navigator.userAgent) || '') {
  const cocok = (daftar) => (daftar.find(([pola]) => pola.test(ua)) || [null, ''])[1];
  const browser = cocok([[/Edg\//, 'Edge'], [/OPR\//, 'Opera'], [/Firefox\//, 'Firefox'], [/Chrome\//, 'Chrome'], [/Safari\//, 'Safari']]);
  const os = cocok([[/Windows/, 'Windows'], [/Android/, 'Android'], [/iPhone|iPad/, 'iOS'], [/Mac OS X/, 'macOS'], [/Linux/, 'Linux']]);
  return ['Web', browser, os].filter(Boolean).join(' · ').slice(0, 120);
}
