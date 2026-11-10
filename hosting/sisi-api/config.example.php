<?php
// Salin ke LUAR public_html, satu tingkat di atasnya, dengan nama <nama folder API>-config.php:
//   folder API public_html/sisi-api-staging  ->  <folder domain>/sisi-api-staging-config.php
//   folder API public_html/sisi-api          ->  <folder domain>/sisi-api-config.php
// rahasia = Script Property MYSQL_API_SECRET project Apps Script yang sama (staging / production BERBEDA, >= 32 karakter).
return [
    'env' => 'staging',   // 'production' untuk folder sisi-api
    'rahasia' => 'ISI_RAHASIA_MINIMAL_32_KARAKTER',
    'dsn' => 'mysql:host=localhost;dbname=u000000000_sisi_staging;charset=utf8mb4',
    'user' => 'u000000000_sisi_staging',
    'sandi' => 'ISI_PASSWORD_DATABASE',
    // origin lain yang boleh memanggil (website di domain yang sama tidak perlu ditulis)
    'origin' => ['http://localhost:5173'],
];
