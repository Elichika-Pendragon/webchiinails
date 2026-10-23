export async function orderApi(path, body, headers = {}) {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(path, { method: 'POST', credentials: 'same-origin', cache: 'no-store', referrerPolicy: 'no-referrer', headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...headers }, body: JSON.stringify(body), signal: controller.signal });
    const data = await response.json();
    if (!response.ok) throw Object.assign(new Error(data.message || 'Rincian belum dapat dimuat. Coba lagi.'), { code: data.code, status: response.status });
    return data.order;
  } catch (error) {
    if (error.code) throw error;
    throw new Error('Koneksi belum tersedia. Isian tetap ada; coba lagi setelah koneksi pulih.');
  } finally { clearTimeout(timer); }
}
export async function orderSession() {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch('/api/booking/admission', { credentials: 'same-origin', cache: 'no-store', referrerPolicy: 'no-referrer', headers: { Accept: 'application/json' }, signal: controller.signal });
    const data = await response.json();
    if (!response.ok || !/^[a-f0-9]{64}$/.test(data.nonce || '')) throw new Error();
    return data;
  } catch { throw new Error('Pemeriksaan sesi belum tersedia. Coba lagi setelah koneksi pulih.'); }
  finally { clearTimeout(timer); }
}
