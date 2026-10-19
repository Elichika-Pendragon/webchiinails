import React from 'react';
import { priceGroups, pressOnPricing, salon } from './content.js';

const number = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 });
const rupiah = value => `Rp${number.format(value)}`;
const range = (min, max) => max ? `${rupiah(min)}–${number.format(max)}` : rupiah(min);

export default function PriceList() {
  const prices = pressOnPricing;
  return <section id="price-list" className="price-guide" aria-labelledby="price-heading">
    <header className="price-heading">
      <p className="eyebrow">THE PRICE LIST</p>
      <h2 id="price-heading">A little guide to your next set.</h2>
      <p className="muted">Pilih gaya yang kamu suka. Lihat harga, lalu kirim inspirasimu untuk konfirmasi desain dan totalnya.</p>
    </header>
    <nav className="price-nav" aria-label="Kategori daftar harga">
      {priceGroups.map(group => <a href={`#price-${group.id}`} key={group.id}>{group.title}</a>)}
      <a href="#price-press-on">Press-on sets</a>
    </nav>
    <div className="price-grid">
      {priceGroups.map(group => <section className="price-card" key={group.id} id={`price-${group.id}`} aria-labelledby={`price-title-${group.id}`}>
        <h3 id={`price-title-${group.id}`}>{group.title}</h3>
        <p className="price-unit">{group.note}</p>
        <dl>{group.items.map(item => <div className="price-row" key={item.name + (item.detail || '')}>
          <dt>{item.name}{item.detail && <small>{item.detail}</small>}</dt>
          <dd>{range(item.price, item.max)}</dd>
        </div>)}</dl>
      </section>)}
    </div>
    <section id="price-press-on" className="press-on-price" aria-labelledby="press-on-heading">
      <header className="press-on-heading">
        <div><p className="eyebrow">MADE FOR YOU, SENT TO YOU</p><h3 id="press-on-heading">Your custom press-on set.</h3></div>
        <div className="press-on-total"><strong>{range(prices.min, prices.max)}</strong><span>Harga total set · sesuai desain / request</span></div>
      </header>
      <div className="press-on-layout">
        <div className="press-on-kit">
          <h4>Base kit <span>{rupiah(prices.base)}</span></h4>
          <p className="muted">Isi paket dasar sebelum tambahan desain:</p>
          <ul>{prices.kit.map(item => <li key={item}>{item}</li>)}</ul>
          <p className="glue-extra">Tambahan pilihan: <strong>super glue nails MXBON · {rupiah(prices.glue)}</strong></p>
        </div>
        <aside className="price-example" aria-labelledby="price-example-heading">
          <p className="eyebrow">HOW IT ADDS UP</p><h4 id="price-example-heading">Contoh: Cat Eye press-on</h4>
          <dl><div><dt>Base kit · 10 kuku</dt><dd>{rupiah(prices.base)}</dd></div><div><dt>Desain Cat Eye</dt><dd>{rupiah(prices.exampleDesign)}</dd></div><div className="example-total"><dt>Total contoh set</dt><dd>{rupiah(prices.base + prices.exampleDesign)}</dd></div></dl>
          <p>Paket dasar + desain pilihanmu. Rentang di atas adalah harga total set; konfirmasikan total pesanan dan ongkir melalui WhatsApp.</p>
        </aside>
      </div>
    </section>
    <div className="price-footer"><p>Semua harga dalam rupiah. Harga akhir mengikuti desain, tingkat kesulitan, dan tambahan yang dipilih. <a className="text-link" href="/about#booking-rules">Booking wajib DP · tidak menerima walk-in.</a></p><a className="button" href={salon.custom} target="_blank" rel="noopener noreferrer">Konsultasi desain &amp; harga ↗</a></div>
  </section>;
}
