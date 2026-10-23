// Old open tabs receive an explicit refresh instruction; no credential is issued or checked.
export function retiredBookingAccess() {
  return Response.json({ code:'BOOKING_UPDATE_REQUIRED', message:'Kode akses booking tidak diperlukan lagi. Muat ulang halaman booking untuk melanjutkan; isian tetap dipulihkan.' }, { status:409, headers:{
    'Cache-Control':'private, no-store', 'X-Robots-Tag':'noindex, nofollow', 'Referrer-Policy':'no-referrer',
    'X-Content-Type-Options':'nosniff', 'Cross-Origin-Resource-Policy':'same-origin',
  } });
}
