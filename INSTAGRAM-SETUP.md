# Instagram otomatis tanpa LightWidget

Source memuat feed API, token store terenkripsi dan Worker renewal harian. Belum ada akun yang diotorisasi atau deployment produksi. Pengujian memakai respons terkontrol; end-to-end Meta/Cloudflare tetap perlu diverifikasi.

Status akses Meta per 20 Oktober 2026: SMS registrasi developer belum terselesaikan dan pembuatan app di Business Suite dinonaktifkan pada sesi yang diperiksa. [Riset, bukti, langkah gratis dan draft laporan dukungan](docs/META-DEVELOPER-ACCESS.md). Belum ada workaround yang diverifikasi untuk akun ini; jangan mengaktifkan billing atau mengubah 2FA untuk mencoba saran forum.

## Cara kerja

Halaman utama meminta `GET /api/instagram` segera untuk empat foto/cover hero terbaru, lalu setiap lima menit selama tab terlihat. Galeri memakai feed yang sama; embed post tetap dimuat mendekati viewport. Foto baru dari format portrait, landscape atau square selalu di-crop ke frame tetap dengan object-fit: cover, tidak mengubah tinggi layout. Pages memakai cache lima menit dan membaca token KV terbaru. Feed mengurutkan maksimal 12 post yang dikembalikan API. Foto/thumbnail Reel menjadi preview/fallback; situs tidak menambahkan autoplay video.

Worker berjalan setiap hari pukul **09.00 WIB (02.00 UTC)** tanpa bergantung pada kunjungan. Saat jatuh tempo, ia meminta renewal melalui `graph.instagram.com/refresh_access_token`. Untuk lifetime respons 60 hari, renewal berikutnya 30 hari kemudian; lifetime mengikuti `expires_in` sebenarnya. Token kedaluwarsa tidak bisa diperbarui dan job tidak melakukan refresh sebelum 24 jam setelah seed/renewal.

AES-256-GCM dengan nonce acak mengenkripsi record sebelum ditulis ke KV. Key disimpan sebagai secret terpisah. Satu Worker menjadi satu-satunya penulis rutin. Kegagalan jaringan/respons tidak valid tidak menimpa token lama. KV eventually consistent: tunggu propagasi setelah seed/update.

## 1. Otorisasi Meta

1. Pastikan Chii Business/Creator.
2. Di [Meta for Developers](https://developers.facebook.com/apps/) configure **Instagram API with Instagram Login**, permission baca `instagram_business_basic`.
3. Pemilik mengotorisasi akun melalui Meta. Ikuti persyaratan app-role/tester, mode produksi/review dan izin yang ditampilkan. Token testing belum membuktikan izin produksi disetujui.
4. Dapatkan long-lived Instagram Login token, numeric account ID, waktu expiry sebenarnya dan versi Graph API yang didukung. Jangan gunakan Facebook Page token untuk jalur ini. [Official collection](https://www.postman.com/meta/instagram/folder/6raa77c/instagram-api-with-instagram-login), [refresh reference](https://developers.facebook.com/docs/instagram-platform/reference/refresh_access_token/).

## 2. Buat encrypted seed lokal

Copy `.env.example` menjadi `.env.local` yang diabaikan Git. Isi secara privat:

```text
INSTAGRAM_ACCESS_TOKEN=token-sebenarnya
INSTAGRAM_USER_ID=id-numerik-sebenarnya
INSTAGRAM_API_VERSION=versi-yang-divalidasi
INSTAGRAM_TOKEN_EXPIRES_AT=expiry-ISO-8601-dengan-zona
TOKEN_ENCRYPTION_KEY=32-byte-acak-dalam-base64
```

Gunakan expiry dari token sebenarnya, bukan tanggal contoh/perkiraan setelah token lama digunakan. Seed mensyaratkan sisa masa aktif >2 hari; gunakan token baru untuk memberi waktu setup/retry.

Buat key di **terminal privat operator**, lalu simpan ke password manager dan `.env.local`:

```sh
node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64'))"
pnpm seed:instagram
```

Script seed menghasilkan `.private/instagram-token.json` berisi ciphertext, tanpa mencetak token/key. Jangan kirim secret/screenshot ke chat atau commit `.private/`. ACL Windows mengikuti folder pengguna; gunakan komputer tepercaya.

## 3. KV dan Pages

1. Buat namespace KV khusus produksi pada akun Cloudflare salon.
2. Tambahkan key **`instagram:credentials:v1`**, value seluruh isi file encrypted seed. Jangan set expiry/TTL key.
3. Pages → Settings → Bindings: tambahkan **`INSTAGRAM_TOKENS`** ke namespace itu untuk **Production**.
4. Set encrypted secret **`TOKEN_ENCRYPTION_KEY`** yang sama; set server variables `INSTAGRAM_USER_ID` dan `INSTAGRAM_API_VERSION`.
5. Jangan gunakan prefix `VITE_`. Setelah KV aktif, hapus env token statis dari Pages produksi. API tidak kembali menggunakan secret lama jika KV terhubung tetapi gagal dibaca.
6. Redeploy Pages lewat Git. Jangan hubungkan KV produksi ke preview branch; preview tanpa konfigurasi memakai foto/post lokal.

[Pages bindings](https://developers.cloudflare.com/pages/functions/bindings/), [KV consistency](https://developers.cloudflare.com/kv/concepts/how-kv-works/).

## 4. Deploy Worker renewal

Jalankan `pnpm build:worker`. File **`.worker-build/instagram-refresh.js`** adalah satu ES module lengkap tanpa runtime dependency tambahan.

Alur dashboard tanpa Wrangler:

1. Buat Worker khusus di akun Cloudflare yang sama. Ganti module pada editor dengan seluruh file hasil build, simpan/deploy.
2. Tambahkan binding `INSTAGRAM_TOKENS` ke KV produksi yang sama.
3. Tambahkan secret `TOKEN_ENCRYPTION_KEY` yang sama dan variable `INSTAGRAM_USER_ID` yang sama. Worker tidak membutuhkan seed token sebagai secret.
4. Trigger Events: tambahkan Cron **`0 2 * * *`**. UTC berarti 09.00 WIB. Propagasi trigger dapat memerlukan beberapa menit.
5. Tidak perlu HTTP route. Nonaktifkan alamat workers.dev publik jika dibuat dashboard; handler HTTP sendiri selalu 404.
6. Aktifkan scheduled-event logs. Setelah job berjalan, periksa KV `instagram:status:v1`: `current` belum jatuh tempo, `renewed` berhasil renewal, `attention-required` perlu pemeriksaan privat. Status tidak berisi token.

Alternatif Wrangler tersedia dalam `workers/wrangler.jsonc`: ganti namespace ID placeholder, configure secret/account variable dan deploy dengan config tersebut. Jangan membuat dua Worker penulis. Tool Wrangler lokal sebelumnya bermasalah dependency; module Vite berhasil dibundle, tetapi deployment runtime Cloudflare belum diuji.

[Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/), [Worker secrets](https://developers.cloudflare.com/workers/configuration/secrets/).

## 5. Verifikasi dan pemulihan

- API berisi post Chii terbaru tanpa token/key; cache dapat menunda hasil beberapa menit.
- Slider/panah/geser/link asli/embeds diizinkan dan bekerja pada HP serta desktop.
- Status scheduled job diperbarui setiap hari. Uji renewal dalam akun/test environment terpisah memakai token yang sudah memenuhi syarat, bukan mengubah record produksi demi tes.
- Uji kegagalan feed dan fallback lokal. WhatsApp/Maps/aturan tidak bergantung pada API.
- Catat versi Graph API; token renewal tidak memperpanjang dukungan versi API selamanya.

Jika token dicabut/kedaluwarsa, pemilik melakukan otorisasi Meta ulang. Operator membuat encrypted seed baru dengan **key yang sama** dan mengganti record KV. Hindari reseed bersamaan dengan cron; tunggu propagasi dan periksa API/status. Jangan memutar key tanpa mengenkripsi ulang record dan mengganti secret Pages/Worker bersama.

Job retry harian sebelum expiry; record lama dipertahankan saat gagal. **Belum ada email/WhatsApp alert otomatis atau OAuth dashboard satu klik.** Pemantauan status/log perlu disiapkan dan diperiksa sebelum operasi dianggap tanpa pengawasan.

Dev Vite/adapter Vercel tetap memakai env token statis. Renewal otomatis hanya untuk Cloudflare dengan KV/Worker yang sudah diaktifkan. Tidak perlu Supabase untuk feed ini.

