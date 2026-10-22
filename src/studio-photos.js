import photos from './studio-photo-catalog.json' with { type: 'json' };

// Original owner photos age out under the same 50-photo cap.
export const studioPhotos = photos;
export const studioPhoto = name => studioPhotos.find(photo => photo.name === name);
export const photoSourceSet = photo => photo.widths.map(width => `/images/${photo.name}-${width}.webp ${width}w`).join(', ');
