import React from 'react';
import { priceGroups, pressOnPricing, salon } from './content.js';
import { serviceChoices } from './pricing.js';

const calculatorGroups = [
  { id: 'nail-art', title: 'Nail Art', action: 'Tambah nail art', choices: serviceChoices.filter(item => item.group === 'nail-art') },
  { id: 'cat-eye', title: 'Cat Eye', action: 'Tambah Cat Eye', choices: serviceChoices.filter(item => item.group === 'cat-eye') },
  { id: 'extension', title: 'Extension', action: 'Tambah extension', choices: serviceChoices.filter(item => ['extras-0', 'extras-1'].includes(item.id)) },
  { id: 'extras', title: 'Extras', action: 'Tambah extra', choices: serviceChoices.filter(item => item.group === 'extras' && !['extras-0', 'extras-1'].includes(item.id)) },
  { id: 'removal', title: 'Removal', action: 'Tambah removal', choices: serviceChoices.filter(item => item.group === 'removal') },
];

const number = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 });
const rupiah = value => `Rp${number.format(value)}`;
const range = (min, max) => max ? `${rupiah(min)}–${number.format(max)}` : rupiah(min);

export default function PriceList() {
  const prices = pressOnPricing;
  return <section id="price-list" className="price-guide" data-price-guide="" aria-labelledby="price-heading">
    <header className="price-heading">
      <h2 id="price-heading">A little guide to your next set.</h2>
      <p className="muted">Daftar harga dan estimasi untuk layanan pilihanmu.</p>
    </header>
    <p className="price-sync-status" data-prices-status="" role="status">Harga sesuai daftar di halaman.</p><button className="text-link price-retry" type="button" data-prices-retry="" hidden>Coba periksa harga lagi</button>
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
        <h3 id="press-on-heading">Hitung layanan pilihanmu.</h3>
        <div className="press-on-total"><strong data-estimate-total="">Rp0</strong><a className="text-link" href="#estimate-summary">Lihat rincian ↓</a></div>
      </header>
      <div className="press-on-layout calculator-layout">
        <div className="calculator-builder" data-calculator-controls="" hidden>
          <p className="calculator-intro">Gabungkan kategori yang kamu butuhkan. Semua pilihan masuk ke satu estimasi.</p>
          {calculatorGroups.map(group => <fieldset className="calculator-group" data-service-group={group.id} key={group.id}>
            <legend>{group.title}</legend>
            <label className="sr-only" htmlFor={`estimate-${group.id}`}>Pilihan {group.title}</label>
            <select id={`estimate-${group.id}`} data-service-choice="" defaultValue="">
              <option value="" disabled>Pilih {group.title.toLowerCase()}</option>
              {group.choices.map(item => <option key={item.id} value={item.id}>{item.name}{item.detail ? ` · ${item.detail}` : ''} · {range(item.price, item.max)}</option>)}
            </select>
            <div className="calculator-add-row">
              <label className="calculator-quantity" data-add-quantity-label="" hidden htmlFor={`estimate-${group.id}-quantity`}>Jumlah<input id={`estimate-${group.id}-quantity`} data-add-quantity="" type="number" min="1" max="10" step="1" inputMode="numeric" defaultValue="1" /></label>
              <button className="button calculator-add" type="button" data-service-add="" disabled>{group.action}</button>
            </div>
            <p className="calculator-feedback" data-group-feedback="" role="status" aria-live="polite"></p>
          </fieldset>)}
          <fieldset className="calculator-group calculator-press-on">
            <legend>Untuk pesanan press-on</legend>
            <label className="calculator-check"><input type="checkbox" data-kit-choice="" /><span>Base kit · 10 kuku <small data-kit-price="">{rupiah(prices.base)}</small></span></label>
            <label className="calculator-check"><input type="checkbox" data-glue-choice="" /><span>Super glue nails MXBON <small data-glue-price="">{rupiah(prices.glue)}</small></span></label>
            <details className="calculator-kit-details"><summary>Isi base kit</summary><ul>{prices.kit.map(item => <li key={item}>{item}</li>)}</ul></details>
          </fieldset>
        </div>
        <aside id="estimate-summary" className="price-example press-on-calculator" aria-labelledby="price-example-heading">
          <h4 id="price-example-heading">Rincian estimasimu.</h4>
          <p className="calculator-feedback" data-calculator-feedback="" role="status" aria-live="polite"></p>
          <ul className="calculator-lines" data-estimate-lines="" aria-label="Rincian estimasi"></ul>
          <p className="calculator-empty" data-estimate-empty="">Belum ada layanan. Pilih dari kategori mana saja, lalu tambahkan ke estimasi.</p>
          <div className="calculator-total"><span>Estimasi total</span><output data-estimate-total="" aria-live="polite">Rp0</output></div>
          <p className="calculator-terms">Harga tiap pilihan dijumlahkan sesuai satuan menu, tanpa diskon kombinasi. Belum termasuk ongkir. Konfirmasi satuan stiker / aksesori dan harga akhir melalui WhatsApp.</p>
          <a className="text-link calculator-contact" data-estimate-link="" href={salon.custom} target="_blank" rel="noopener noreferrer" hidden>Konfirmasi via WhatsApp ↗</a>
          <button className="text-link calculator-reset" type="button" data-estimate-reset="" hidden>Kosongkan pilihan</button>
          <noscript><p>Aktifkan JavaScript untuk menghitung estimasi.</p></noscript>
        </aside>
      </div>
    </section>
    <p className="price-footer"><a className="text-link" href="/about#booking-rules">Booking wajib DP · tidak menerima walk-in.</a></p>
  </section>;
}
