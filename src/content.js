export const salon = {
  name: 'Chii Nails',
  instagram: 'https://www.instagram.com/chii.nails_/',
  whatsapp: 'https://wa.me/6285111028211',
  custom: 'https://wa.me/6285111028211?text=Halo%20Chii%2C%20saya%20ingin%20konsultasi%20custom%20nail%20art.',
  mapsSource: 'https://share.google/jFSExFb9oiM3cob89',
  maps: 'https://www.google.com/maps?cid=13060782932404739183',
  directions: 'https://www.google.com/maps/dir/?api=1&destination=-2.9707861%2C104.7923294',
  mapEmbed: 'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3984.4563633447087!2d104.7923294!3d-2.9707861!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x2e3b771aec94583f%3A0xb54138e0c6781c6f!2sDewi%20Salon%20%26%20Chii.Nails%20(Salon%20Palembang)!5e0!3m2!1sen!2sid!4v1792399345679!5m2!1sen!2sid',
  hours: 'Senin–Jumat 08.00–17.00 · Sabtu–Minggu 08.00–12.00 WIB',
  lastBooking: 'Last booking: Senin–Jumat 15.00 · Sabtu–Minggu 10.00 WIB',
  address: 'SMA N 5 · Jl. Serda KKO Usman Ali, Sei Buah, Ilir Timur II, Palembang, Sumatera Selatan 30116',
  postalAddress: {
    streetAddress: 'Jl. Serda KKO Usman Ali, Sei Buah, Ilir Timur II, dekat SMA N 5',
    addressLocality: 'Palembang', addressRegion: 'Sumatera Selatan', postalCode: '30116', addressCountry: 'ID',
  },
  openingHours: [
    { label: 'Senin–Jumat', days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'], opens: '08:00', closes: '17:00', lastBooking: '15:00' },
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
  { kicker: '02 · EXTENSIONS', title: 'Nail extensions', description: 'Panjang dan bentuk sesuai gaya, dengan pilihan desain personal.' },
  { kicker: '03 · PRESS-ON', title: 'Press-on nails', description: 'Set custom sesuai request, praktis untuk momen spesialmu.' },
];

export const bookingRules = [
  { title: 'Isi data booking terlebih dahulu', body: 'Wajib booking sebelum datang. Kirim nama, nomor telepon, tanggal, jam, dan DP booking melalui WhatsApp agar jadwal tidak bertabrakan dengan pelanggan lain.' },
  { title: 'Booking wajib DP; pembatalan membuat DP hangus', body: 'Booking sekarang memerlukan DP. Konfirmasikan nominal dan cara pembayaran langsung melalui WhatsApp. Setelah booking, pembatalan tidak diperbolehkan; jika tetap dibatalkan, DP hangus.' },
  { title: 'Jam layanan & batas booking terakhir', body: 'Booking only, tanpa walk-in. Senin–Jumat buka 08.00–17.00 WIB, dengan booking terakhir pukul 15.00. Sabtu–Minggu buka 08.00–12.00 WIB, dengan booking terakhir pukul 10.00. Konfirmasikan ketersediaan jadwal melalui WhatsApp sebelum datang.' },
  { title: 'Tidak tersedia home service', body: 'Layanan dilakukan di studio. Kami belum dapat menerima home service karena keterbatasan kendaraan dan untuk menjaga jadwal booking tetap teratur.' },
  { title: 'Jadwal booking tidak bisa diganti', body: 'Pastikan kamu memiliki waktu luang pada hari dan jam yang dipilih. Jadwal tidak dapat diganti karena kami sudah menolak booking pelanggan lain pada slot tersebut.' },
  { title: 'Denda keterlambatan Rp10.000 per 10 menit', body: 'Datang tepat waktu sesuai jam booking. Keterlambatan dari jadwal booking dikenakan denda Rp10.000 per 10 menit.' },
];
