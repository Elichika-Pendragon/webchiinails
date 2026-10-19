# Chii Nails: tanpa LightWidget

Keputusan pemilik 19 Oktober 2026: integrasi Instagram sendiri, tanpa layanan feed berbayar. Renewal terjadwal sudah ada dalam source, tetapi **belum aktif** sebelum setup Meta/Cloudflare selesai.

| Bagian | Sistem | Tugas pemilik |
| --- | --- | --- |
| Website | Astro statis di Cloudflare Pages; React hanya saat build | Tidak perlu menjalankan server sendiri atau mengurus plugin WordPress. |
| Booking dan DP | WhatsApp | Jessica mengonfirmasi desain, jadwal dan DP; website tidak mengecek slot otomatis. |
| Galeri | API resmi, cache lima menit, slider embed | Posting Instagram seperti biasa setelah koneksi aktif. |
| Renewal | Worker harian dan token KV terenkripsi | Berjalan tanpa kunjungan, renewal sekitar 30 hari untuk token 60 hari. |
| Maps | Peta publik dan tautan pemilik | Update Google Business Profile jika data usaha berubah. |
| Konten utama | Teks/foto lokal | Jam, WA, alamat dan aturan perlu diperbarui saat berubah; tidak otomatis ditarik dari bio IG. |
| Domain | pages.dev atau domain sendiri | Auto-renew bila membeli domain, cek pembayaran dan email. |
| SEO | HTML/metadata/sitemap saat build | Search Console disiapkan sekali; posting IG tidak perlu build ulang. |

Setup pertama memerlukan operator teknis: otorisasi profesional Meta, encrypted seed, KV bindings, secrets dan Worker. Ikuti [INSTAGRAM-SETUP.md](./INSTAGRAM-SETUP.md). Tidak ada endpoint renewal publik atau token di JavaScript browser.

Workers/KV memiliki kuota Free. Job membaca satu record dan menulis status harian, ditambah penulisan saat renewal. Cache feed mengurangi panggilan KV/Meta. Free KV saat diperiksa mencakup 100.000 read dan 1.000 write/hari; kuota akun tetap berlaku. Tidak ada jaminan gratis tanpa batas. [KV pricing](https://developers.cloudflare.com/kv/platform/pricing/), [Pages Functions pricing](https://developers.cloudflare.com/pages/functions/pricing/).

Meta masih dapat mencabut izin. Jika itu terjadi, pemilik perlu mengotorisasi ulang dan operator melakukan seed ulang. **Belum ada dashboard OAuth satu klik atau email/WhatsApp alert otomatis.** Status aman tersimpan pada KV `instagram:status:v1` dan scheduled-event logs; operator harus menyiapkan pemantauan yang benar-benar diperiksa sebelum menyebutnya siap tanpa pengawasan.

Jika Instagram gagal, foto pilihan lokal/link asli, WhatsApp dan Maps tetap tersedia; fallback tidak diklaim sebagai post terbaru. Simpan akses/pemulihan GitHub, Cloudflare, Meta dan domain dalam pengelolaan salon. Perubahan API besar masih dapat memerlukan developer.

