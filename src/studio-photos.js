import photos from './studio-photo-catalog.json' with { type: 'json' };
import fixedPhotos from './studio-fixed-photos.json' with { type: 'json' };

// Original owner photos age out under the same 50-photo cap.
export const studioPhotos = photos;
export const aboutStudioPhoto = fixedPhotos[0];
export const studioPhoto = name => studioPhotos.find(photo => photo.name === name) || fixedPhotos.find(photo => photo.name === name);
export const photoSourceSet = photo => photo.widths.map(width => `/images/${photo.name}-${width}.webp ${width}w`).join(', ');
