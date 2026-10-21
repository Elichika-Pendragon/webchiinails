# Tutorial Chii Nails di hosting gratis

Alamat utama saat ini: **https://chiinails.pages.dev**. Proyek Cloudflare Pages `chiinails` memakai repo private `Elichika-Pendragon/webchiinails`, branch `main`. Alamat lama `webchiinails.pages.dev` memakai 301 melalui Bulk Redirects; path/query dipertahankan. Jangan hapus proyek lama selama redirect digunakan. Search Console URL-prefix sudah diverifikasi; indexing belum dikonfirmasi. Instagram masih menunggu otorisasi Meta.

Diperiksa 20 Oktober 2026. Pilihan pemilik: **tanpa LightWidget**, memakai Cloudflare Pages Free + API Instagram sendiri + Worker renewal harian + KV terenkripsi, dengan booking melalui WhatsApp. Lihat [LOW-MAINTENANCE.md](./LOW-MAINTENANCE.md). Source renewal sudah tersedia, tetapi setup/otorisasi/deployment produksi belum dilakukan. Tidak perlu membeli VPS, shared hosting, database booking atau payment gateway.

## Batas biaya: gratis saja

Keputusan terakhir pemilik: tidak ada pengeluaran. Gunakan Cloudflare Pages Free dan alamat chiinails.pages.dev. Tidak ada domain berbayar, upgrade Workers, VPS, atau layanan feed berbayar yang diaktifkan. EmDash dibatalkan karena upload gambarnya memerlukan R2 dengan hubungan billing. R2 tidak diaktifkan.

Panduan domain/hosting berbayar sebelumnya adalah riwayat yang tidak dipilih; salinannya tetap tersedia di archive/react-before-astro. Tidak perlu mengubah DNS atau membeli domain untuk menggunakan situs ini.

Cloudflare mencantumkan static asset requests gratis tanpa batas dan Pages Functions memakai kuota Workers Free: 100.000 request per hari, dibagi dengan Workers lain dalam akun. Batas CPU dan batas paket lain tetap berlaku. Function berjalan untuk `/api/instagram` dan `/api/booking/*`, termasuk pembaruan kalender, pengajuan booking, serta sesi/review pemilik. Foto situs, CSS, dan halaman Astro tetap statis. Pembersihan bukti pembayaran berjalan pada Worker terjadwal terpisah; hardening booking menambahkan Worker gambar privat melalui service binding. D1, transformasi Images, dan Meta Instagram memiliki batas masing-masing. Ini perkiraan kecocokan untuk salon kecil, bukan jaminan hosting gratis tanpa batas selamanya. [Harga Cloudflare](https://developers.cloudflare.com/pages/functions/pricing/), [paket Workers](https://www.cloudflare.com/plans/developer-platform/), [kontrak hardening booking](./docs/BOOKING-HARDENING.md).

## Migrasi Astro — 20 Oktober 2026

Astro sudah mengganti build produksi dan berhasil dideploy. Lima halaman statis: Home, Services, Custom Sets & Prices, Visit, About. React hanya saat build; browser memakai controller native. Desktop tetap scrolling, mobile memakai halaman terpisah dan lokasi/Maps otomatis di Home. Output tetap dist. Kode Pages Functions/KV dan Worker dipertahankan, aktivasi Meta/KV/cron masih pending. Node 24.19.0 sudah dikonfigurasi. Lihat [MIGRATION-ASTRO.md](./MIGRATION-ASTRO.md). Bagian setup di bawah untuk pemulihan/setup ulang, bukan pekerjaan yang harus diulang pemilik sekarang.

## 1. Siapkan folder proyek

Ekstrak ZIP source. Folder proyek yang benar berisi `package.json`, `src/`, `public/`, `functions/` dan `server/` pada tingkat yang sama. Jangan hanya mengambil `dist`, karena integrasi Instagram memerlukan kode server di `functions/`.

Untuk mencoba di komputer sendiri, instal Node.js LTS yang kompatibel (22.22.0+ pada versi genap yang didukung; versi ini memakai Node 24.19.0) dari [nodejs.org](https://nodejs.org/en/download). Buka ulang PowerShell setelah instalasi. Siapkan package manager sekali dengan `npm install --global pnpm@11.25.0`. Lalu buka terminal pada folder proyek:

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm dev
```

Buka alamat lokal yang dicetak terminal. Untuk membuat hasil produksi: `pnpm build`. Node diperlukan untuk proses build/development; pengunjung cukup membuka website di browser. `pnpm preview` hanya preview hasil statis, bukan pengujian penuh server Cloudflare.

## 2. Simpan di GitHub

1. Buat repository **private**, misalnya `chii-nails-website`, di akun GitHub milikmu.
2. Gunakan GitHub Desktop: tambahkan folder source, buat commit pertama, lalu Publish repository dengan opsi private tetap aktif. Jangan publikasikan seluruh folder ChatGPT project; hanya isi folder `chii-nails-astro` yang sudah diperiksa.
3. File `.gitignore` mengecualikan `node_modules`, `dist`, dan file rahasia. Pastikan token Instagram, `.env.local`, dan `.dev.vars` tidak masuk daftar file yang akan di-commit.

## 3. Hubungkan Cloudflare Pages

1. Masuk/daftar Cloudflare. Di dashboard, buka **Workers & Pages**.
2. Pilih alur membuat aplikasi **Pages**, lalu impor repository Git yang sudah dibuat. Berikan akses GitHub hanya ke repository proyek jika tersedia.
3. Gunakan konfigurasi berikut:

| Setting | Nilai |
| --- | --- |
| Production branch | `main` |
| Framework preset | Astro (static), atau None dengan build command di bawah; tanpa Astro Cloudflare adapter |
| Root directory | Kosong jika `package.json` ada di root repo |
| Build command | `pnpm build` |
| Build output directory | `dist` |
| Build environment variable `PNPM_VERSION` | `11.25.0` |
| Build environment variable `NODE_VERSION` | `24.19.0` (atau versi genap didukung >=22.22.0 yang tersedia di build image) |

4. Pilih Node LTS yang didukung pada pengaturan build jika versi default tidak cocok. Simpan dan deploy.
5. Buka subdomain `*.pages.dev` yang benar-benar diberikan dashboard. Nama proyek yang diinginkan bisa sudah digunakan orang lain.
6. Set build variable Production `SITE_URL` ke alamat HTTPS produksi yang sebenarnya, `SEO_PRODUCTION_BRANCH=main`, dan `SEO_INDEXABLE=true`, lalu deploy ulang. Tanpa `SITE_URL`, build sengaja noindex dan tidak membuat sitemap. Ikuti [SEO.md](./SEO.md) untuk Search Console, domain utama dan validasi.

Struktur `functions/api/instagram.js` membuat route API; `public/_routes.json` disalin ke `dist` untuk membatasi pemanggilan Function. Ikuti alur **Git integration**, bukan sekadar drag-and-drop `dist` pada dashboard, karena dashboard Direct Upload tidak mendukung Functions. [Static Astro deployment](https://developers.cloudflare.com/pages/framework-guides/deploy-an-astro-site/), [Functions](https://developers.cloudflare.com/pages/functions/get-started/).

## 4. Aktifkan newest Instagram posts

Website dapat dibuka sebelum API siap menggunakan foto/post lokal. Untuk feed otomatis tanpa LightWidget, ikuti [INSTAGRAM-SETUP.md](./INSTAGRAM-SETUP.md) secara berurutan:

1. Pemilik mengotorisasi akun profesional melalui Meta Instagram Login; dapatkan numeric account ID, long-lived token, expiry sebenarnya dan versi API.
2. Simpan konfigurasi secara privat dalam `.env.local`, buat key enkripsi dan jalankan `pnpm seed:instagram`.
3. Buat namespace Cloudflare KV produksi, upload encrypted seed, dan hubungkan binding `INSTAGRAM_TOKENS` ke Pages.
4. Pada Pages produksi, tambahkan secret `TOKEN_ENCRYPTION_KEY` dan variables `INSTAGRAM_USER_ID`/`INSTAGRAM_API_VERSION`; redeploy. Token produksi dibaca dari KV, bukan ditanam pada JavaScript browser.
5. Jalankan `pnpm build:worker`, deploy file module hasil build sebagai Worker terpisah, hubungkan KV/key/account ID yang sama, dan aktifkan cron harian sesuai panduan.
6. Periksa `/api/instagram` berisi JSON `posts` tanpa token, post terbaru berada di awal, dan status cron diperbarui setiap hari.

Worker bekerja tanpa kunjungan dan menyimpan token baru sekitar setiap 30 hari untuk token 60 hari. Cache feed sekitar lima menit. Meta tetap dapat mencabut izin; reconnect/reseed memerlukan pemilik dan operator. OAuth dashboard dan alert otomatis belum disediakan. Jangan mengirim token/key ke chat atau memasukkannya ke GitHub. [Pengaturan secrets](https://developers.cloudflare.com/pages/functions/bindings/#secrets).

## 5. Domain tetap gratis

Pertahankan chiinails.pages.dev sebagai domain utama. HTTPS sudah disediakan Pages. Tidak ada pembelian atau perpindahan domain dalam scope ini.

## 6. Pemeriksaan sebelum memasang link di bio Instagram

- Desktop dan HP: logo menyatu dengan header; menu tidak terpotong; halaman tidak melebar ke samping.
- Booking wajib DP; nominal dikonfirmasi di WhatsApp; pembatalan DP hangus; denda Rp10.000/10 menit.
- Senin–Jumat 08.00–17.00, Last book 14.00; Sabtu–Minggu 08.00–12.00, Last book 10.00 WIB. Tidak menerima walk-in.
- Slider: geser, tombol panah, postingan terbaru, link asli, dan fallback ketika Instagram gagal.
- Chat tetap di kanan bawah, bisa ditutup, WhatsApp dan Instagram menuju akun yang benar.
- Peta interaktif mengarah ke Dewi Salon & Chii.Nails, dan Get directions memakai link yang diberikan pemilik.
- Konfirmasi nomor WhatsApp pilihan, nominal DP dan izin penggunaan foto. Uji dengan perangkat/akun pengunjung, bukan hanya browser pemilik.

## 7. Cara update dan pemulihan

Ubah konten di `src/content.js`, periksa lokal, jalankan `pnpm test` dan `pnpm build`, lalu commit/push melalui GitHub Desktop. Cloudflare membangun ulang Pages dari commit. Worker renewal dideploy terpisah bila kodenya berubah; jangan membuat dua job penulis token. Gunakan deployment terakhir yang baik jika perlu rollback. Periksa status cron/log, kuota Cloudflare dan email domain; aktifkan auto-renew domain bila dipakai.
