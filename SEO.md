# Persiapan SEO Chii Nails

Domain utama: **https://chiinails.pages.dev**. Alamat sebelumnya `webchiinails.pages.dev` memakai redirect 301 ke alamat baru, termasuk path dan query. Canonical, sitemap, robots dan structured data harus merujuk domain baru. Search Console memakai akun Google pemilik salon dan properti **Awalan URL** `https://chiinails.pages.dev/`; jangan menganggap situs sudah terindeks sampai laporan Google mengonfirmasinya.

File verifikasi yang diunduh langsung dari Google: `public/googlefe4df279dce4c32d.html`. Build menyalinnya tanpa perubahan ke root hasil deploy. Pertahankan nama dan isinya setelah verifikasi berhasil; jangan hapus pada pembaruan berikutnya. Ini token verifikasi publik, bukan password atau token API Instagram. Untuk alamat pages.dev ini, gunakan file HTML tersebut melalui properti Awalan URL, bukan mencoba mengatur TXT DNS milik Cloudflare. Kepemilikan properti Awalan URL berhasil diverifikasi pada 19 Oktober 2026. Sitemap sudah dikirim, tetapi Search Console masih melaporkan tidak dapat membaca sitemap. File publik mengembalikan HTTP 200 dan XML valid; status pemrosesan Google belum berhasil. Permintaan pengindeksan homepage ditolak karena kuota harian terlampaui; Google meminta mencoba lagi besok. Jangan menganggap situs sudah terindeks atau mengulang permintaan saat kuota habis.

## Yang sudah disiapkan di source

- Kelima halaman (Home, Services, Custom Sets & Prices, Visit, About) dibuat menjadi HTML lengkap saat build oleh Astro. Google dan pengunjung dapat membaca layanan, harga, lokasi dan aturan tanpa JavaScript. React hanya merender saat build; controller native mengaktifkan interaksi browser.
- Judul dan deskripsi unik berbahasa Indonesia, satu H1 per halaman, alt gambar, tautan internal, serta bahasa dokumen `id`. Headline Inggris tetap dipertahankan untuk gaya brand.
- Canonical URL, Open Graph/Twitter preview, robots.txt dan sitemap lima halaman dibuat dari alamat produksi yang sama.
- JSON-LD `NailSalon` mencantumkan alamat, WhatsApp, Instagram, Google Maps dan jam operasional. Batas booking terakhir dipisahkan dari jam tutup. Tidak ada rating atau harga yang dibuat-buat.
- Halaman 404 dan build preview diberi noindex. Konten utama tidak bergantung pada iframe Instagram untuk SEO.

## Setup satu kali di Cloudflare Pages

1. Deploy pertama untuk memperoleh alamat `https://nama-proyek.pages.dev` yang sebenarnya. Build awal **noindex** karena alamat produksi belum dikonfigurasi.
2. Pada environment variables **Production**, isi `SITE_URL` dengan alamat tersebut atau domain custom yang sudah aktif, tanpa path. Contoh bentuk saja: `https://domain-milik-salon.com`. Jangan memakai domain contoh ini sebagai nilai sebenarnya.
3. Isi `SEO_PRODUCTION_BRANCH=main` sesuai branch produksi dan `SEO_INDEXABLE=true`. Deploy ulang. Variable ini digunakan saat build, bukan diubah langsung oleh pengunjung.
4. Periksa source halaman: satu canonical, robots `index,follow`, JSON-LD berisi alamat yang benar. Buka `/robots.txt` dan `/sitemap.xml`; keduanya harus memakai domain produksi. `SITE_URL` kosong membuat noindex dan tidak menghasilkan sitemap untuk mencegah URL contoh masuk Google.
5. Jika mengganti dari pages.dev ke domain sendiri, ubah `SITE_URL`, deploy ulang, dan pasang redirect permanen dari alamat lama ke domain utama melalui Cloudflare. Pertahankan path dan query. Gunakan satu domain utama, bukan dua salinan yang dipromosikan bersamaan.

Preview branch selain `SEO_PRODUCTION_BRANCH` tetap noindex. Cloudflare juga memberi header noindex pada preview deployment. Jangan menambahkan blok robots seluruh situs produksi: Google perlu membaca halaman untuk melihat meta noindex bila sedang dipersiapkan.

## Search Console

1. Masuk [Google Search Console](https://search.google.com/search-console/). Akun Google tidak harus sama dengan pembuat lokasi Google Maps.
2. Untuk pages.dev gunakan properti **URL prefix** dengan alamat HTTPS lengkap. Untuk domain sendiri dapat memakai properti Domain dengan verifikasi DNS.
3. Jika memilih verifikasi HTML tag, salin hanya nilai `content` ke build variable `GOOGLE_SITE_VERIFICATION`, lalu deploy ulang dan klik Verify. String verifikasi ini bersifat publik; bukan password.
4. Kirim `sitemap.xml`, lalu gunakan URL Inspection untuk halaman utama, `/services`, `/custom-sets`, `/visit`, dan `/about`. Periksa status indexing setelah Google memprosesnya; hasil tidak selalu langsung.
5. Periksa structured data melalui [Rich Results Test](https://search.google.com/test/rich-results) dan performa melalui [PageSpeed Insights](https://pagespeed.web.dev/). Skor produksi belum diukur dalam proyek ini.

## SEO lokal yang perlu pemilik lakukan

Pastikan nama usaha, alamat, WhatsApp, jam buka dan booking-only konsisten di website, Instagram dan Google Business Profile. Tambahkan website pada profil Google, gunakan foto asli dan minta ulasan pelanggan secara wajar tanpa membuat rating palsu. Informasi terakhir harus ditinjau pemilik: nomor WA yang dipilih, nominal DP dan ejaan alamat.

Post Instagram terbaru membantu showcase, tetapi tidak otomatis menjadi artikel/halaman SEO baru di domain salon. Website ini menjelaskan layanan dan lokasi melalui kontennya sendiri. Tidak perlu blog rutin untuk meluncurkan versi ini.

Tidak ada jaminan peringkat atau rich result. Relevansi usaha, jarak pencari, reputasi, kualitas konten dan pengalaman website ikut menentukan hasil. Domain custom membantu identitas brand; suffix domain sendiri tidak menjamin peningkatan ranking.

Referensi: [Google JavaScript SEO](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics), [Local Business](https://developers.google.com/search/docs/appearance/structured-data/local-business), [Sitemap](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap), [Google local ranking](https://support.google.com/business/answer/7091), [Cloudflare preview deployments](https://developers.cloudflare.com/pages/configuration/preview-deployments/).

## Optimasi 19 Oktober 2026

- Judul homepage mencakup Chii Nails, Palembang, nail art, extensions, dan press-on; deskripsi menjelaskan lokasi dekat SMA N 5, pengiriman press-on, dan booking wajib DP.
- Hero tetap memakai headline Inggris, dengan penjelasan layanan dan kota dalam bahasa Indonesia. Deskripsi layanan memberi konteks nyata tanpa mengulang kata kunci secara berlebihan.
- Tiga pertanyaan pelanggan di homepage menjelaskan booking, harga sesuai desain, dan pesanan press-on dari luar kota. Jawaban tersedia dalam HTML hasil build, termasuk saat accordion ditutup; tidak bergantung pada Instagram.
- Link internal langsung memakai URL canonical /about dan teks link menyebut tujuan/layanan. Tidak menambah halaman tipis atau blog otomatis.
- Koordinat studio yang sama dengan Google Maps ditambahkan ke data NailSalon. WebSite dengan nama Chii Nails, jam buka, canonical, sitemap, dan HTML prerender sudah ada sebelumnya dan dipertahankan. Tidak menambah rating atau FAQ rich-result markup yang tidak sesuai.
- Tidak ada dependency tambahan. Uji build mencakup konten HTML, link internal, metadata, sitemap, file verifikasi, dan schema; tampilan mobile dan desktop ditinjau sebelum deploy.

Pantau setelah Google memproses: status sitemap, halaman yang terindeks, impressions, klik, dan kueri seperti Chii Nails / Chii Nails Palembang. Kueri layanan adalah sasaran konten, bukan hasil riset volume pencarian. Jangan mengubah judul tiap hari atau membeli backlink. Pemilik melaporkan link website Google Maps sudah diperbarui; isi listing publik belum diverifikasi ulang.

Panduan utama: [Google SEO Starter Guide](https://developers.google.com/search/docs/fundamentals/seo-starter-guide?hl=id). Fokus pada informasi yang membantu pelanggan, judul deskriptif, teks link jelas, gambar relevan, dan akses crawling. Dampak dapat memerlukan beberapa minggu atau lebih; verifikasi ownership tidak menjamin indexing atau ranking.
