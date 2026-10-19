# Tutorial publish Chii Nails dengan biaya rendah

Diperiksa 19 Oktober 2026. Pilihan pemilik: **tanpa LightWidget**, memakai Cloudflare Pages Free + API Instagram sendiri + Worker renewal harian + KV terenkripsi, dengan booking melalui WhatsApp. Lihat [LOW-MAINTENANCE.md](./LOW-MAINTENANCE.md). Source renewal sudah tersedia, tetapi setup/otorisasi/deployment produksi belum dilakukan. Tidak perlu membeli VPS, shared hosting, database booking atau payment gateway.

## Perkiraan biaya yang bisa dipilih

| Pilihan | Hosting | Alamat website | Biaya domain yang ditampilkan registrar |
| --- | --- | --- | --- |
| Mulai gratis | Rp0 dalam batas paket Free | Subdomain `nama-proyek.pages.dev` | Rp0 |
| Domain custom paling hemat | Rp0 dalam batas Free | Domain `.my.id` pilihanmu | Rumahweb menampilkan promo Rp9.900 tahun pertama; renewal Rp25.000/tahun |
| Pilihan saya untuk brand salon | Rp0 dalam batas Free | Domain `.com` pilihanmu | Rumahweb menampilkan promo Rp137.000 tahun pertama; renewal Rp201.000/tahun |

Harga domain adalah harga halaman penawaran, bukan tagihan final. Nama harus tersedia; cek pajak, promo, dan harga renewal saat checkout. Tidak perlu membeli paket hosting dari registrar jika memakai Cloudflare Pages. Contoh nama di panduan ini bukan nama yang sudah dipesan.

Cloudflare mencantumkan static asset requests gratis tanpa batas dan Pages Functions memakai kuota Workers Free: 100.000 request per hari, dibagi dengan Workers lain dalam akun. Batas CPU dan batas paket lain tetap berlaku. Endpoint proyek ini hanya dipanggil pada `/api/instagram`; foto, CSS dan halaman tidak perlu menjalankan Function. Kuota Meta Instagram terpisah. Ini perkiraan kecocokan untuk salon kecil, bukan jaminan hosting gratis tanpa batas selamanya. [Harga Cloudflare](https://developers.cloudflare.com/pages/functions/pricing/), [paket Workers](https://www.cloudflare.com/plans/developer-platform/), [domain Rumahweb](https://www.rumahweb.com/domain-murah/).

Saya tidak merekomendasikan Vercel Hobby untuk website salon komersial karena paket tersebut dibatasi untuk penggunaan personal/nonkomersial. Adapter Vercel tetap tersedia jika nanti memilih paket yang sesuai. Netlify Free alternatifnya memiliki 300 kredit/bulan yang dibagi untuk beberapa jenis penggunaan; Cloudflare lebih sederhana untuk kebutuhan ini. [Vercel Hobby](https://vercel.com/docs/plans/hobby), [harga Netlify](https://www.netlify.com/pricing/).

## 1. Siapkan folder proyek

Ekstrak ZIP source. Folder proyek yang benar berisi `package.json`, `src/`, `public/`, `functions/` dan `server/` pada tingkat yang sama. Jangan hanya mengambil `dist`, karena integrasi Instagram memerlukan kode server di `functions/`.

Untuk mencoba di komputer sendiri, instal Node.js LTS yang kompatibel (22.12+ atau LTS lebih baru yang didukung) dari [nodejs.org](https://nodejs.org/en/download). Buka ulang PowerShell setelah instalasi. Siapkan package manager sekali dengan `npm install --global pnpm@11.25.0`. Lalu buka terminal pada folder proyek:

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm dev
```

Buka alamat lokal yang dicetak terminal. Untuk membuat hasil produksi: `pnpm build`. Node diperlukan untuk proses build/development; pengunjung cukup membuka website di browser. `pnpm preview` hanya preview hasil statis, bukan pengujian penuh server Cloudflare.

## 2. Simpan di GitHub

1. Buat repository **private**, misalnya `chii-nails-website`, di akun GitHub milikmu.
2. Gunakan GitHub Desktop: tambahkan folder source, buat commit pertama, lalu Publish repository dengan opsi private tetap aktif. Jangan publikasikan seluruh folder ChatGPT project; hanya folder `chii-nails-react` yang diekstrak.
3. File `.gitignore` mengecualikan `node_modules`, `dist`, dan file rahasia. Pastikan token Instagram, `.env.local`, dan `.dev.vars` tidak masuk daftar file yang akan di-commit.

## 3. Hubungkan Cloudflare Pages

1. Masuk/daftar Cloudflare. Di dashboard, buka **Workers & Pages**.
2. Pilih alur membuat aplikasi **Pages**, lalu impor repository Git yang sudah dibuat. Berikan akses GitHub hanya ke repository proyek jika tersedia.
3. Gunakan konfigurasi berikut:

| Setting | Nilai |
| --- | --- |
| Production branch | `main` |
| Framework preset | React / Vite, jika tersedia |
| Root directory | Kosong jika `package.json` ada di root repo |
| Build command | `pnpm build` |
| Build output directory | `dist` |
| Build environment variable `PNPM_VERSION` | `11.25.0` |

4. Pilih Node LTS yang didukung pada pengaturan build jika versi default tidak cocok. Simpan dan deploy.
5. Buka subdomain `*.pages.dev` yang benar-benar diberikan dashboard. Nama proyek yang diinginkan bisa sudah digunakan orang lain.
6. Set build variable Production `SITE_URL` ke alamat HTTPS produksi yang sebenarnya, `SEO_PRODUCTION_BRANCH=main`, dan `SEO_INDEXABLE=true`, lalu deploy ulang. Tanpa `SITE_URL`, build sengaja noindex dan tidak membuat sitemap. Ikuti [SEO.md](./SEO.md) untuk Search Console, domain utama dan validasi.

Struktur `functions/api/instagram.js` membuat route API; `public/_routes.json` disalin ke `dist` untuk membatasi pemanggilan Function. Ikuti alur **Git integration**, bukan sekadar drag-and-drop `dist` pada dashboard, karena dashboard Direct Upload tidak mendukung Functions. [React deployment](https://developers.cloudflare.com/pages/framework-guides/deploy-a-react-site/), [Functions](https://developers.cloudflare.com/pages/functions/get-started/).

## 4. Aktifkan newest Instagram posts

Website dapat dibuka sebelum API siap menggunakan foto/post lokal. Untuk feed otomatis tanpa LightWidget, ikuti [INSTAGRAM-SETUP.md](./INSTAGRAM-SETUP.md) secara berurutan:

1. Pemilik mengotorisasi akun profesional melalui Meta Instagram Login; dapatkan numeric account ID, long-lived token, expiry sebenarnya dan versi API.
2. Simpan konfigurasi secara privat dalam `.env.local`, buat key enkripsi dan jalankan `pnpm seed:instagram`.
3. Buat namespace Cloudflare KV produksi, upload encrypted seed, dan hubungkan binding `INSTAGRAM_TOKENS` ke Pages.
4. Pada Pages produksi, tambahkan secret `TOKEN_ENCRYPTION_KEY` dan variables `INSTAGRAM_USER_ID`/`INSTAGRAM_API_VERSION`; redeploy. Token produksi dibaca dari KV, bukan ditanam pada React.
5. Jalankan `pnpm build:worker`, deploy file module hasil build sebagai Worker terpisah, hubungkan KV/key/account ID yang sama, dan aktifkan cron harian sesuai panduan.
6. Periksa `/api/instagram` berisi JSON `posts` tanpa token, post terbaru berada di awal, dan status cron diperbarui setiap hari.

Worker bekerja tanpa kunjungan dan menyimpan token baru sekitar setiap 30 hari untuk token 60 hari. Cache feed sekitar lima menit. Meta tetap dapat mencabut izin; reconnect/reseed memerlukan pemilik dan operator. OAuth dashboard dan alert otomatis belum disediakan. Jangan mengirim token/key ke chat atau memasukkannya ke GitHub. [Pengaturan secrets](https://developers.cloudflare.com/pages/functions/bindings/#secrets).

## 5. Domain custom, jika ingin

1. Beli **domain saja** di registrar pilihanmu setelah memeriksa harga perpanjangan. Hosting gratis bisa dipakai dulu tanpa domain.
2. Pada Pages → **Custom domains**, tambahkan domain melalui alur yang disediakan Cloudflare.
3. Domain utama/apex biasanya memerlukan zone domain di akun Cloudflare dan nameserver Cloudflare. Untuk subdomain, ikuti CNAME yang diminta oleh setup Pages. Jangan membuat record DNS secara acak sebelum domain ditambahkan ke proyek.
4. Jika domain sudah dipakai untuk email, pertahankan record MX/TXT yang diperlukan saat mengatur DNS.
5. Tunggu sampai domain dan HTTPS dinyatakan aktif, lalu tes halaman utama, About, Maps, WhatsApp dan API dari alamat baru. [Panduan domain Cloudflare](https://developers.cloudflare.com/pages/configuration/custom-domains/).

## 6. Pemeriksaan sebelum memasang link di bio Instagram

- Desktop dan HP: logo menyatu dengan header; menu tidak terpotong; halaman tidak melebar ke samping.
- Booking wajib DP; nominal dikonfirmasi di WhatsApp; pembatalan DP hangus; denda Rp10.000/10 menit.
- Senin–Jumat 08.00–17.00, last booking 15.00; Sabtu–Minggu 08.00–12.00, last booking 10.00 WIB. Tidak menerima walk-in.
- Slider: geser, tombol panah, postingan terbaru, link asli, dan fallback ketika Instagram gagal.
- Chat tetap di kanan bawah, bisa ditutup, WhatsApp dan Instagram menuju akun yang benar.
- Peta interaktif mengarah ke Dewi Salon & Chii.Nails, dan Get directions memakai link yang diberikan pemilik.
- Konfirmasi nomor WhatsApp pilihan, nominal DP dan izin penggunaan foto. Uji dengan perangkat/akun pengunjung, bukan hanya browser pemilik.

## 7. Cara update dan pemulihan

Ubah konten di `src/content.js`, periksa lokal, jalankan `pnpm test` dan `pnpm build`, lalu commit/push melalui GitHub Desktop. Cloudflare membangun ulang Pages dari commit. Worker renewal dideploy terpisah bila kodenya berubah; jangan membuat dua job penulis token. Gunakan deployment terakhir yang baik jika perlu rollback. Periksa status cron/log, kuota Cloudflare dan email domain; aktifkan auto-renew domain bila dipakai.
