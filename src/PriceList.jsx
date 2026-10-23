import React from 'react';
import { pressOnPricing, salon } from './content.js';
import { serviceChoices, priceRange, rupiah } from './pricing.js';

const menuGroups = [
  { id: 'nail-art', title: 'Nail Art', note: 'Harga untuk 10 jari', items: serviceChoices.filter(item => item.group === 'nail-art') },
  { id: 'cat-eye', title: 'Cat Eye', note: 'Harga untuk 10 jari', items: serviceChoices.filter(item => item.group === 'cat-eye') },
  { id: 'extension', title: 'Extension', note: '', items: serviceChoices.filter(item => ['extras-0', 'extras-1'].includes(item.id)) },
  { id: 'extras', title: 'Extras', note: '', items: serviceChoices.filter(item => item.group === 'extras' && !['extras-0', 'extras-1'].includes(item.id)) },
  { id: 'removal', title: 'Removal', note: '', items: serviceChoices.filter(item => item.group === 'removal') },
];

function MenuItem({ item }) {
  const detail = item.design && item.detail === '10 jari' ? '' : item.detail;
  const label = `${item.name}${item.detail ? ` · ${item.detail}` : ''}`;
  return <li className="price-menu-item" data-menu-item={item.id}>
    <label className="price-menu-row" htmlFor={`menu-${item.id}`}>
      <input id={`menu-${item.id}`} type="checkbox" data-menu-choice={item.id} disabled aria-label={label} aria-describedby={`menu-rate-${item.id}`} />
      <span className="price-menu-name">{item.name}{detail && <small>{detail}</small>}</span>
      <span id={`menu-rate-${item.id}`} className="price-menu-rate" data-price-id={item.id}>{priceRange(item.price, item.max)}</span>
    </label>
    {item.quantityMax > 1 && <div className="price-menu-quantity" data-menu-quantity={item.id} hidden>
      <span>{item.detail === '1 kuku' ? 'Jumlah kuku' : 'Jumlah'}</span>
      <div className="price-menu-stepper">
        <button type="button" data-quantity-step="-1" data-service-id={item.id} aria-label={`Kurangi ${label}`} disabled><svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M4 10h12" stroke="currentColor" strokeWidth="1.5" /></svg></button>
        <output data-menu-count={item.id} aria-label={`Jumlah ${label}`}>1</output>
        <button type="button" data-quantity-step="1" data-service-id={item.id} aria-label={`Tambah ${label}`}><svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M4 10h12M10 4v12" stroke="currentColor" strokeWidth="1.5" /></svg></button>
      </div>
    </div>}
  </li>;
}

export default function PriceList() {
  return <section id="price-list" className="price-guide" data-price-guide="" aria-labelledby="price-heading">
    <header className="price-heading"><h2 id="price-heading">Your next set.</h2><p className="muted">Ketuk layanan untuk menggabungkan pilihan dan menghitung estimasi.</p></header>
    <p className="price-sync-status" data-prices-status="" role="status">Harga sesuai daftar di halaman.</p>
    <button className="text-link price-retry" type="button" data-prices-retry="" hidden>Coba periksa harga lagi</button>
    <details id="estimate-summary" className="price-quote" data-estimate-summary="">
      <summary aria-label="Belum ada pilihan. Estimasi Rp0. Lihat rincian."><span className="price-quote-label"><span data-estimate-count="">Belum ada pilihan</span><small>Lihat rincian · belum ongkir</small></span><output data-estimate-total="" aria-live="polite">Rp0</output><svg className="price-quote-chevron" width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m5 7.5 5 5 5-5" stroke="currentColor" strokeWidth="1.5" /></svg></summary>
      <div className="price-quote-details"><ul className="price-quote-lines" data-estimate-lines="" aria-label="Rincian estimasi"></ul><p data-estimate-empty="">Ketuk layanan di bawah untuk mulai.</p><p className="price-quote-terms">Harga tiap pilihan dijumlahkan tanpa diskon kombinasi. Konfirmasikan satuan stiker / aksesori dan harga akhir melalui WhatsApp.</p><div className="price-quote-actions"><a className="button" data-estimate-link="" href={salon.custom} target="_blank" rel="noopener noreferrer" hidden>Konfirmasi via WhatsApp ↗</a><button className="text-link" type="button" data-estimate-reset="" hidden>Kosongkan pilihan</button></div></div>
    </details>
    <div className="price-menu">
      {menuGroups.map(group => <section className="price-menu-group" id={`price-${group.id}`} key={group.id} aria-labelledby={`price-title-${group.id}`}>
        <header className="price-menu-heading"><h3 id={`price-title-${group.id}`}>{group.title}</h3>{group.note && <p>{group.note}</p>}</header>
        <ul>{group.items.map(item => <MenuItem item={item} key={item.id} />)}</ul>
      </section>)}
      <section id="price-press-on" className="price-menu-group" aria-labelledby="price-title-press-on">
        <header className="price-menu-heading"><h3 id="price-title-press-on">Untuk press-on</h3><p>Opsional</p></header>
        <ul>
          <li className="price-menu-item"><label className="price-menu-row" htmlFor="menu-kit"><input id="menu-kit" type="checkbox" data-kit-choice="" disabled /><span className="price-menu-name">Base kit<small>10 kuku</small></span><span className="price-menu-rate" data-kit-price="">{rupiah(pressOnPricing.base)}</span></label></li>
          <li className="price-menu-item"><label className="price-menu-row" htmlFor="menu-glue"><input id="menu-glue" type="checkbox" data-glue-choice="" disabled /><span className="price-menu-name">Super glue nails MXBON</span><span className="price-menu-rate" data-glue-price="">{rupiah(pressOnPricing.glue)}</span></label></li>
        </ul>
        <details className="price-kit-details"><summary>Isi base kit</summary><ul>{pressOnPricing.kit.map(item => <li key={item}>{item}</li>)}</ul></details>
      </section>
    </div>
    <p className="sr-only" data-calculator-feedback="" role="status" aria-live="polite"></p>
    <noscript><p className="price-quote-terms">Daftar harga tetap dapat dibaca. Aktifkan JavaScript untuk menghitung estimasi.</p></noscript>
    <p className="price-footer"><a className="text-link" href="/about#booking-rules">Booking wajib DP · tidak menerima walk-in.</a></p>
  </section>;
}
