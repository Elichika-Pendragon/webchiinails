export const salon = {
  name: 'Chii Nails',
  geo: { latitude: -2.9707861, longitude: 104.7923294 },
  instagram: 'https://www.instagram.com/chii.nails_/',
  shopee: 'https://id.shp.ee/1isrkeoe',
  whatsapp: 'https://wa.me/6285111028211',
  custom: 'https://wa.me/6285111028211?text=Halo%20Chii%2C%20saya%20ingin%20konsultasi%20custom%20nail%20art.',
  mapsSource: 'https://share.google/jFSExFb9oiM3cob89',
  maps: 'https://www.google.com/maps?cid=13060782932404739183',
  directions: 'https://www.google.com/maps/dir/?api=1&destination=-2.9707861%2C104.7923294',
  mapEmbed: 'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3984.4563633447087!2d104.7923294!3d-2.9707861!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x2e3b771aec94583f%3A0xb54138e0c6781c6f!2sChii.Nails%20Art%20%26%20Dewi%20Salon!5e0!3m2!1sen!2sid!4v1792434072193!5m2!1sen!2sid',
  hours: 'Senin–Jumat 08.00–17.00 · Sabtu–Minggu 08.00–12.00 WIB',
  lastBooking: 'Last book: Senin–Jumat 14:00 · Sabtu–Minggu 10:00 WIB',
  address: 'SMA N 5 · Jl. Serda KKO Usman Ali, Sei Buah, Ilir Timur II, Palembang, Sumatera Selatan 30116',
  postalAddress: {
    streetAddress: 'Jl. Serda KKO Usman Ali, Sei Buah, Ilir Timur II, dekat SMA N 5',
    addressLocality: 'Palembang', addressRegion: 'Sumatera Selatan', postalCode: '30116', addressCountry: 'ID',
  },
  openingHours: [
    { label: 'Senin–Jumat', days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'], opens: '08:00', closes: '17:00', lastBooking: '14:00' },
    { label: 'Sabtu–Minggu', days: ['Saturday', 'Sunday'], opens: '08:00', closes: '12:00', lastBooking: '10:00' },
  ],
};

export const posts = [
  { id: 'Ddbohf_TKUi', title: 'Maroon, with a twist.', url: 'https://www.instagram.com/chii.nails_/reel/Ddbohf_TKUi/', image: 'maroon', alt: 'Nail art maroon dan silver hasil karya Chii' },
  { id: 'DdbCQmBzEhT', title: 'French nails again.', url: 'https://www.instagram.com/chii.nails_/reel/DdbCQmBzEhT/', image: 'french', alt: 'French manicure putih dengan detail garis melengkung' },
  { id: 'DdbD7ocz6nT', title: 'A custom character set.', url: 'https://www.instagram.com/chii.nails_/reel/DdbD7ocz6nT/', image: 'totoro', alt: 'Press-on karakter Totoro custom dari Chii' },
  { id: 'DdbqjqZk85b', title: 'Your next press-on set.', url: 'https://www.instagram.com/chii.nails_/p/DdbqjqZk85b/', image: 'presson', alt: 'Set press-on karakter hitam dan putih' },
];

export const services = [
  { kicker: '01 · NAIL ART', title: 'Custom nail art', description: 'Bawa desain apa pun yang kamu suka. Dari French yang clean sampai karakter dan detail yang playful.' },
  { kicker: '02 · EXTENSIONS', title: 'Nail extensions', description: 'Tambah panjang kuku dengan bentuk dan desain personal. Konsultasikan referensimu sebelum booking di studio Palembang.' },
  { kicker: '03 · PRESS-ON', title: 'Press-on nails', description: 'Kuku palsu custom sesuai request, praktis untuk momen spesialmu. Bisa dikirim ke seluruh Indonesia; konfirmasikan ukuran, ongkir, dan estimasi lewat WhatsApp.' },
];

// Owner-supplied price list. Numbers are rupiah; price ranges are inclusive.
export const priceGroups = [
  { id: 'nail-art', title: 'Nail art', note: 'Harga untuk 10 jari', items: [
    { name: 'Nail polos', price: 25000 },
    { name: 'Nail mood temperatur', price: 30000 },
    { name: 'French nails', price: 50000 },
    { name: 'Marble', price: 45000 },
    { name: 'Ombré nails', price: 50000, max: 55000 },
    { name: 'Request design', detail: 'Mengikuti tingkat kesulitan', price: 65000, max: 155000 },
  ] },
  { id: 'cat-eye', title: 'Cat eye', note: 'Harga untuk 10 jari', items: [
    { name: 'Cat eye / silky cat eye', price: 40000 },
    { name: 'Cat eye universal', price: 40000 },
    { name: 'Crystal cat eye', price: 40000 },
    { name: 'Cat eye rainbow / mix colors', price: 40000, max: 45000 },
    { name: 'Cat eye love / bunny', price: 40000 },
  ] },
  { id: 'extras', title: 'Extensions & extras', note: 'Tambahan untuk set pilihanmu', items: [
    { name: 'Extension', detail: '1 kuku', price: 4000 },
    { name: 'Extension', detail: '10 kuku', price: 30000 },
    { name: 'Glitter', detail: '10 jari', price: 5000 },
    { name: 'Stiker', price: 1000 },
    { name: 'Aksesori 3D', price: 1000, max: 8000 },
  ] },
  { id: 'removal', title: 'Nail removal', note: 'Pilih sesuai jenis dan jumlah kuku', items: [
    { name: 'Remove fake nails', detail: '1 kuku', price: 3500 },
    { name: 'Remove fake nails', detail: '10 kuku', price: 25000 },
    { name: 'Remove nail gel', detail: '1 kuku', price: 3000 },
    { name: 'Remove nail gel', detail: '10 kuku', price: 23000 },
    { name: 'Remove nail biasa', detail: '10 kuku', price: 6000 },
  ] },
];

// Press-on estimates: owner approved menu design fees + base kit (23 Oct 2026).
export const pressOnPricing = {
  base: 22000, glue: 13000,
  exampleDesign: 40000,
  kit: ['Fake nails 10 pcs', 'Kikir kuku 1 pcs', 'Lem stiker 3 pcs', 'Wipe kering pink', 'Alcohol wipe', 'Wooden cuticle pusher'],
};

export const bookingRules = [
  { title: 'Isi data booking terlebih dahulu', body: 'Wajib booking sebelum datang. Kirim nama, nomor telepon, tanggal, jam, dan pilihan pembayaran booking melalui WhatsApp agar jadwal tidak bertabrakan dengan pelanggan lain.' },
  { title: 'Booking wajib DP atau full payment', body: 'Isi nominal DP yang kamu bayar, minimum Rp20.000, atau pilih full payment. Nominal pembayaran tidak melebihi harga total; harga Rp20.000 atau kurang dibayar penuh. Konfirmasikan cara pembayaran melalui transfer atau QRIS langsung melalui WhatsApp. Setelah booking, pembatalan tidak diperbolehkan; jika tetap dibatalkan, DP hangus.' },
  { title: 'Jam layanan & Last book', body: 'Booking only, tanpa walk-in. Senin–Jumat buka 08.00–17.00 WIB, dengan Last book pukul 14:00. Sabtu–Minggu buka 08.00–12.00 WIB, dengan Last book pukul 10:00. Konfirmasikan ketersediaan jadwal melalui WhatsApp sebelum datang.' },
  { title: 'Tidak tersedia home service', body: 'Layanan dilakukan di studio. Kami belum dapat menerima home service karena keterbatasan kendaraan dan untuk menjaga jadwal booking tetap teratur.' },
  { title: 'Jadwal booking tidak bisa diganti', body: 'Pastikan kamu memiliki waktu luang pada hari dan jam yang dipilih. Jadwal tidak dapat diganti karena kami sudah menolak booking pelanggan lain pada slot tersebut.' },
  { title: 'Denda keterlambatan Rp10.000 per 10 menit', body: 'Datang tepat waktu sesuai jam booking. Keterlambatan dari jadwal booking dikenakan denda Rp10.000 per 10 menit.' },
];
