import React from 'react';
import { priceGroups, pressOnPricing, salon } from './content.js';
import { priceFields } from './pricing.js';

const number = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 });
const rupiah = value => `Rp${number.format(value)}`;
const range = (min, max) => max ? `${rupiah(min)}–${number.format(max)}` : rupiah(min);

export default function PriceList() {
  const prices = pressOnPricing;
  return <section id="price-list" className="price-guide" data-price-guide="" aria-labelledby="price-heading">
    <header className="price-heading">
      <p className="eyebrow">THE PRICE LIST</p>
      <h2 id="price-heading">A little guide to your next set.</h2>
      <p className="muted">Pilih gaya yang kamu suka. Lihat harga, lalu kirim inspirasimu untuk konfirmasi desain dan totalnya.</p>
    </header>
    <p className="price-sync-status" data-prices-status="" role="status">Estimasi dari daftar harga halaman; konfirmasikan harga akhir melalui WhatsApp.</p><button className="text-link price-retry" type="button" data-prices-retry="" hidden>Coba periksa harga lagi</button>
    <nav className="price-nav" aria-label="Kategori daftar harga">
      {priceGroups.map(group => <a href={`#price-${group.id}`} key={group.id}>{group.title}</a>)}
      <a href="#price-press-on">Kalkulator &amp; press-on</a>
    </nav>
    <div className="price-grid">
      {priceGroups.map(group => <section className="price-card" key={group.id} id={`price-${group.id}`} aria-labelledby={`price-title-${group.id}`}>
        <h3 id={`price-title-${group.id}`}>{group.title}</h3>
        <p className="price-unit">{group.note}</p>
        <dl>{group.items.map((item, index) => <div className="price-row" key={item.name + (item.detail || '')}>
          <dt>{item.name}{item.detail && <small>{item.detail}</small>}</dt>
          <dd data-price-id={`${group.id}-${index}`}>{range(item.price, item.max)}</dd>
        </div>)}</dl>
      </section>)}
    </div>
    <section id="price-press-on" className="press-on-price" aria-labelledby="press-on-heading">
      <header className="press-on-heading">
        <div><p className="eyebrow">MADE FOR YOU, SENT TO YOU</p><h3 id="press-on-heading">Hitung layanan pilihanmu.</h3></div>
        <div className="press-on-total"><strong data-estimate-total="">Rp0</strong><span>Estimasi sesuai pilihan · belum ongkir</span></div>
      </header>
      <div className="press-on-layout">
        <div className="press-on-kit">
          <h4>Untuk press-on: base kit <span data-kit-price="">{rupiah(prices.base)}</span></h4>
          <p className="muted">Opsional untuk pesanan press-on. Isi paket dasar sebelum tambahan desain:</p>
          <ul>{prices.kit.map(item => <li key={item}>{item}</li>)}</ul>
          <p className="glue-extra">Tambahan pilihan: <strong>super glue nails MXBON · <span data-glue-price="">{rupiah(prices.glue)}</span></strong></p>
        </div>
        <aside className="price-example press-on-calculator" aria-labelledby="price-example-heading">
          <h4 id="price-example-heading">Gabungkan layananmu.</h4>
          <p className="calculator-intro">Pilih nail art, Cat Eye, extension, glitter, stiker, aksesori atau removal. Tambahkan satu per satu untuk melihat rinciannya.</p>
          <div data-calculator-controls="" hidden>
            <label htmlFor="estimate-service">Layanan / tambahan</label>
            <select id="estimate-service" data-service-choice="" defaultValue="nail-art-0">
              {priceGroups.map(group => <optgroup key={group.id} label={group.title}>
                {priceFields.filter(item => item.group === group.id).map(item => <option key={item.id} value={item.id}>{item.name}{item.detail ? ` · ${item.detail}` : item.design ? ' · 10 jari' : ''}</option>)}
              </optgroup>)}
            </select>
            <div className="calculator-add-row">
              <label className="calculator-quantity" data-add-quantity-label="" hidden htmlFor="estimate-quantity">Jumlah<input id="estimate-quantity" data-add-quantity="" type="number" min="1" max="10" step="1" inputMode="numeric" defaultValue="1" /></label>
              <button className="button calculator-add" type="button" data-service-add="">Tambahkan layanan</button>
            </div>
            <p className="calculator-feedback" data-calculator-feedback="" role="status" aria-live="polite"></p>
            <label className="calculator-check"><input type="checkbox" data-kit-choice="" /><span>Tambah base kit press-on · 10 kuku <small data-kit-price="">{rupiah(prices.base)}</small></span></label>
            <label className="calculator-check"><input type="checkbox" data-glue-choice="" /><span>Tambah super glue nails MXBON <small data-glue-price="">{rupiah(prices.glue)}</small></span></label>
          </div>
          <ul className="calculator-lines" data-estimate-lines="" aria-label="Rincian estimasi"></ul>
          <p className="calculator-empty" data-estimate-empty="">Belum ada layanan. Pilih layanan di atas, lalu tekan Tambahkan layanan.</p>
          <div className="calculator-total"><span>Estimasi total</span><output data-estimate-total="" aria-live="polite">Rp0</output></div>
          <p>Estimasi menjumlahkan setiap pilihan sesuai satuan menu. Kombinasi desain memakai harga penuh masing-masing, tanpa diskon otomatis. Konfirmasikan satuan stiker / aksesori dan harga akhir melalui WhatsApp.</p>
          <a className="text-link calculator-contact" data-estimate-link="" href={salon.custom} target="_blank" rel="noopener noreferrer" hidden>Konfirmasi estimasi via WhatsApp ↗</a>
          <button className="text-link calculator-reset" type="button" data-estimate-reset="" hidden>Kosongkan pilihan</button>
          <noscript><p>Aktifkan JavaScript untuk menggabungkan layanan dan menghitung estimasi.</p></noscript>
        </aside>
      </div>
    </section>
    <div className="price-footer"><p>Semua harga dalam rupiah. Harga akhir mengikuti desain, tingkat kesulitan, dan tambahan yang dipilih. <a className="text-link" href="/about#booking-rules">Booking wajib DP · tidak menerima walk-in.</a></p><a className="button" href={salon.custom} target="_blank" rel="noopener noreferrer">Konsultasi desain &amp; harga ↗</a></div>
  </section>;
}
