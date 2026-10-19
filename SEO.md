# Persiapan SEO Chii Nails

## Yang sudah disiapkan di source

- Halaman utama dan About dibuat menjadi HTML lengkap saat build. Google dan pengunjung dapat membaca layanan, lokasi dan aturan tanpa menunggu React. React mengaktifkan interaksi setelah halaman dimuat.
- Judul dan deskripsi unik berbahasa Indonesia, satu H1 per halaman, alt gambar, tautan internal, serta bahasa dokumen `id`. Headline Inggris tetap dipertahankan untuk gaya brand.
- Canonical URL, Open Graph/Twitter preview, robots.txt dan sitemap dua halaman dibuat dari alamat produksi yang sama.
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
4. Kirim `sitemap.xml`, lalu gunakan URL Inspection untuk halaman utama dan `/about`. Periksa status indexing setelah Google memprosesnya; hasil tidak selalu langsung.
5. Periksa structured data melalui [Rich Results Test](https://search.google.com/test/rich-results) dan performa melalui [PageSpeed Insights](https://pagespeed.web.dev/). Skor produksi belum diukur dalam proyek ini.

## SEO lokal yang perlu pemilik lakukan

Pastikan nama usaha, alamat, WhatsApp, jam buka dan booking-only konsisten di website, Instagram dan Google Business Profile. Tambahkan website pada profil Google, gunakan foto asli dan minta ulasan pelanggan secara wajar tanpa membuat rating palsu. Informasi terakhir harus ditinjau pemilik: nomor WA yang dipilih, nominal DP dan ejaan alamat.

Post Instagram terbaru membantu showcase, tetapi tidak otomatis menjadi artikel/halaman SEO baru di domain salon. Website ini menjelaskan layanan dan lokasi melalui kontennya sendiri. Tidak perlu blog rutin untuk meluncurkan versi ini.

Tidak ada jaminan peringkat atau rich result. Relevansi usaha, jarak pencari, reputasi, kualitas konten dan pengalaman website ikut menentukan hasil. Domain custom membantu identitas brand; suffix domain sendiri tidak menjamin peningkatan ranking.

Referensi: [Google JavaScript SEO](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics), [Local Business](https://developers.google.com/search/docs/appearance/structured-data/local-business), [Sitemap](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap), [Google local ranking](https://support.google.com/business/answer/7091), [Cloudflare preview deployments](https://developers.cloudflare.com/pages/configuration/preview-deployments/).
