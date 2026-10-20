// Owner-supplied photography, independent of Instagram post destinations.
export const studioPhotos = [
  { name: 'jessica-french-gold', title: 'French, with a little gold.', alt: 'French manicure putih dan pink dengan garis emas dan bunga timbul karya Chii', width: 1080, height: 1440, widths: [360, 720, 1080], position: '50% 45%' },
  { name: 'jessica-red-silver', title: 'A little more dramatic.', alt: 'Nail art merah maroon dengan detail silver dan bentuk kuku almond', width: 1080, height: 1440, widths: [360, 720, 1080], position: '50% 46%' },
  { name: 'jessica-forest-characters', title: 'Tiny characters. Big personality.', alt: 'Sepuluh press-on hijau dan pink dengan karakter hutan, stroberi, dan detail timbul', width: 900, height: 1600, widths: [360, 720, 900], position: '50% 58%' },
  { name: 'jessica-cat-characters', title: 'For the cat people.', alt: 'Press-on warna pastel cerah dengan lukisan wajah kucing yang berbeda di setiap kuku', width: 1080, height: 1440, widths: [360, 720, 1080], position: '50% 55%' },
  { name: 'jessica-spider-art', title: 'Your character, your way.', alt: 'Nail art merah bertema laba-laba dengan detail jaring putih dan hitam', width: 1080, height: 1440, widths: [360, 720, 1080], position: '50% 42%' },
  { name: 'jessica-press-on-collection', title: 'Made to be yours.', alt: 'Tiga set press-on Chii dengan desain karakter merah, pastel, dan hitam silver', width: 1080, height: 1440, widths: [360, 720, 1080], position: '50% 57%' },
];

export const studioPhoto = name => studioPhotos.find(photo => photo.name === name);
export const photoSourceSet = photo => photo.widths.map(width => `/images/${photo.name}-${width}.webp ${width}w`).join(', ');
