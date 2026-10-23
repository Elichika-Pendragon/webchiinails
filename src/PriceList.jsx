import React from 'react';
import { priceGroups, pressOnPricing, salon } from './content.js';
import { priceFields, DEFAULT_DESIGN } from './pricing.js';

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
      <a href="#price-press-on">Press-on sets</a>
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
        <div><p className="eyebrow">MADE FOR YOU, SENT TO YOU</p><h3 id="press-on-heading">Your custom press-on set.</h3></div>
        <div className="press-on-total"><strong data-estimate-total="">{rupiah(prices.base + prices.exampleDesign)}</strong><span>Estimasi 1 set · 10 kuku · belum ongkir</span></div>
      </header>
      <div className="press-on-layout">
        <div className="press-on-kit">
          <h4>Base kit <span data-kit-price="">{rupiah(prices.base)}</span></h4>
          <p className="muted">Isi paket dasar sebelum tambahan desain:</p>
          <ul>{prices.kit.map(item => <li key={item}>{item}</li>)}</ul>
          <p className="glue-extra">Tambahan pilihan: <strong>super glue nails MXBON · <span data-glue-price="">{rupiah(prices.glue)}</span></strong></p>
        </div>
        <aside className="price-example press-on-calculator" aria-labelledby="price-example-heading">
          <h4 id="price-example-heading">Hitung press-on pilihanmu.</h4>
          <div data-calculator-controls="" hidden>
            <label htmlFor="press-on-design">Pilih desain</label>
            <select id="press-on-design" data-design-choice="" defaultValue={DEFAULT_DESIGN}>
              {priceGroups.filter(group => ['nail-art', 'cat-eye'].includes(group.id)).map(group => <optgroup key={group.id} label={group.title}>
                {priceFields.filter(item => item.group === group.id).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
              </optgroup>)}
            </select>
            <label className="calculator-check"><input type="checkbox" data-glue-choice="" /><span>Tambah super glue nails MXBON <small data-glue-price="">{rupiah(prices.glue)}</small></span></label>
          </div>
          <dl><div><dt>Base kit · 10 kuku</dt><dd data-kit-price="">{rupiah(prices.base)}</dd></div><div><dt data-design-label="">Cat eye / silky cat eye</dt><dd data-design-price="">{rupiah(prices.exampleDesign)}</dd></div><div data-glue-row="" hidden><dt>Super glue nails MXBON</dt><dd data-selected-glue=""></dd></div><div className="example-total"><dt>Estimasi total</dt><dd><output data-estimate-total="" aria-live="polite">{rupiah(prices.base + prices.exampleDesign)}</output></dd></div></dl>
          <p>Harga desain mengikuti menu Nail Art / Cat Eye + base kit. Rentang harga mengikuti detail desain. Belum termasuk ongkir dan tambahan di luar pilihan ini.</p>
          <a className="text-link calculator-contact" data-estimate-link="" href={salon.custom} target="_blank" rel="noopener noreferrer">Konfirmasi estimasi via WhatsApp ↗</a>
          <noscript><p>Aktifkan JavaScript untuk memilih desain dan menghitung estimasi.</p></noscript>
        </aside>
      </div>
    </section>
    <div className="price-footer"><p>Semua harga dalam rupiah. Harga akhir mengikuti desain, tingkat kesulitan, dan tambahan yang dipilih. <a className="text-link" href="/about#booking-rules">Booking wajib DP · tidak menerima walk-in.</a></p><a className="button" href={salon.custom} target="_blank" rel="noopener noreferrer">Konsultasi desain &amp; harga ↗</a></div>
  </section>;
}
