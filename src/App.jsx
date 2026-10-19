import React, { useEffect, useRef, useState } from 'react';
import { salon, services, bookingRules } from './content';
import { InstagramFeedProvider, useInstagramFeed } from './instagram-feed.jsx';
import { selectHeroMedia } from './feed-data.js';
import './styles.css';

const image = (name) => `/images/${name}.${name === 'map' || name === 'studio' ? 'png' : 'jpg'}`;
const external = { target: '_blank', rel: 'noopener noreferrer' };

function LinkButton({ href = salon.custom, children, secondary = false, ...props }) {
  return <a className={`button${secondary ? ' button-secondary' : ''}`} href={href} {...external} {...props}>{children}</a>;
}

function Header() {
  const [open, setOpen] = useState(false);
  const toggle = useRef(null);
  useEffect(() => {
    const close = (event) => { if (event.key === 'Escape') { setOpen(false); toggle.current?.focus(); } };
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, []);
  return <header className="site-header">
    <div className="header-inner container">
      <a href="/" className="brand" aria-label="Chii Nails — Beranda"><img src={image('logo')} width="88" height="88" alt="Chii Nails Nail Art Studio" /></a>
      <button ref={toggle} className="menu-toggle" aria-expanded={open} aria-controls="main-navigation" onClick={() => setOpen(!open)}>{open ? 'Tutup ×' : 'Menu ☰'}</button>
      <nav id="main-navigation" className={open ? 'navigation is-open' : 'navigation'} aria-label="Menu utama">
        <a href="/#services" onClick={() => setOpen(false)}>Services</a><a href="/#gallery" onClick={() => setOpen(false)}>Custom sets</a><a href="/about.html" onClick={() => setOpen(false)}>About & rules</a><a href="/#visit" onClick={() => setOpen(false)}>Visit us</a>
        <a className="mobile-booking" href={salon.custom} {...external}>Kirim desain inspirasimu ↗</a>
      </nav>
      <LinkButton className="button header-booking">Kirim desain inspirasimu</LinkButton>
    </div>
  </header>;
}

function Photo({ name, alt, className = '', priority = false }) {
  return <img className={`photo ${className}`} src={image(name)} alt={alt} loading={priority ? 'eager' : 'lazy'} fetchPriority={priority ? 'high' : 'auto'} decoding="async" width="720" height="960" />;
}

function HeroPhoto({ post, priority = false }) {
  const [failed, setFailed] = useState(false);
  const media = failed ? post.backup : post;
  return <a className="mosaic-photo-link" href={media.url} {...external}>
    <img className="photo" src={media.imageUrl || image(media.image)} alt={media.alt}
      width="720" height="960" loading={priority ? 'eager' : 'lazy'} fetchPriority={priority ? 'high' : 'auto'} decoding="async"
      onError={() => setFailed(true)} />
  </a>;
}

function Hero() {
  const media = selectHeroMedia(useInstagramFeed());
  return <>
    <section className="hero-intro container"><p className="eyebrow">NAIL ART STUDIO · PALEMBANG</p><h1>Your inspiration. Your nails.</h1><p>Bawa desain apa pun yang kamu suka. Kami kreasikan jadi nail art untukmu.</p></section>
    <section className="mosaic container" aria-label="Karya nail art Chii">
      <div className="mosaic-feature"><HeroPhoto post={media[0]} key={media[0].id + (media[0].imageUrl || '')} priority /><div className="mosaic-caption"><h2>Your nails. Your little joy.</h2><p>Bawa inspirasimu. Kita wujudkan.</p><LinkButton>Kirim desain inspirasimu</LinkButton></div></div>
      <div className="mosaic-support"><HeroPhoto post={media[1]} key={media[1].id + (media[1].imageUrl || '')} /><div className="mosaic-pair"><HeroPhoto post={media[2]} key={media[2].id + (media[2].imageUrl || '')} /><HeroPhoto post={media[3]} key={media[3].id + (media[3].imageUrl || '')} /></div></div>
    </section>
    <div className="care-strip"><div className="container"><span>✧ Custom request, always</span><span>✧ Basic manicure & vitamin oil</span><span>✧ Booking via WhatsApp</span></div></div>
  </>;
}

function Services() {
  return <section id="services" className="section container"><p className="eyebrow">THE SERVICE MENU</p><h2>Pilih perawatan, temukan gayamu.</h2><p className="muted">Dari simple sampai statement. Kirim referensi untuk konsultasi desain dan harga.</p><div className="service-grid">{services.map(service => <article className="service-card" key={service.title}><p className="eyebrow">{service.kicker}</p><h3>{service.title}</h3><p>{service.description}</p><a href={salon.custom} {...external}>Konsultasi via WhatsApp →</a></article>)}</div><p className="small muted">Harga mengikuti desain dan tingkat kesulitan. Konfirmasi harga saat booking.</p></section>;
}

let instagramScript;
function loadInstagram() {
  if (window.instgrm?.Embeds) return Promise.resolve();
  if (instagramScript) return instagramScript;
  instagramScript = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://www.instagram.com/embed.js'; script.async = true;
    script.onload = resolve;
    script.onerror = () => { script.remove(); instagramScript = null; reject(new Error('Instagram unavailable')); };
    document.body.appendChild(script);
  });
  return instagramScript;
}

function InstagramPost({ post, active }) {
  const host = useRef(null);
  const card = useRef(null);
  const [near, setNear] = useState(false);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const shouldEmbed = active && near;
  const preview = <img className="photo" src={post.imageUrl || image(post.image || 'maroon')} alt={post.alt} loading="lazy" decoding="async" onError={event => { if (!event.currentTarget.dataset.fallback) { event.currentTarget.dataset.fallback = 'true'; event.currentTarget.src = image(post.image || 'maroon'); } }} />;
  useEffect(() => {
    if (!active) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setNear(true); observer.disconnect(); }
    }, { root: card.current.parentElement, rootMargin: '0px 100px', threshold: 0.01 });
    observer.observe(card.current);
    return () => observer.disconnect();
  }, [active]);
  useEffect(() => {
    if (!shouldEmbed || !host.current) return;
    const container = host.current;
    let cancelled = false;
    const quote = document.createElement('blockquote');
    quote.className = 'instagram-media';
    quote.setAttribute('data-instgrm-permalink', post.url);
    quote.setAttribute('data-instgrm-version', '14');
    const fallback = document.createElement('a'); fallback.href = post.url; fallback.textContent = 'View this post on Instagram';
    quote.appendChild(fallback); container.replaceChildren(quote);
    const checkEmbed = () => {
      const iframe = container.querySelector('iframe');
      if (iframe) {
        iframe.title = `Instagram: ${post.title}`;
        if (iframe.getBoundingClientRect().height > 100 && !cancelled) setLoaded(true);
      }
    };
    const observer = new MutationObserver(checkEmbed);
    observer.observe(container, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'height'] });
    loadInstagram().then(() => { if (!cancelled) window.instgrm?.Embeds?.process(); }).catch(() => { if (!cancelled) setFailed(true); });
    const timeout = window.setTimeout(() => {
      const iframe = container.querySelector('iframe');
      if (!cancelled && (!iframe || iframe.getBoundingClientRect().height < 100)) setFailed(true);
    }, 16000);
    return () => { cancelled = true; observer.disconnect(); clearTimeout(timeout); container.replaceChildren(); };
  }, [shouldEmbed, post.url, post.title]);
  return <article ref={card} className="instagram-slide" aria-label={post.title}>
    {!shouldEmbed && <div className="post-placeholder">{preview}<p>Instagram post</p></div>}
    {shouldEmbed && !failed && <><div ref={host} className={`instagram-host${loaded ? ' is-loaded' : ''}`} />{!loaded && <div className="post-placeholder">{preview}<p className="small muted embed-status">Memuat postingan Instagram…</p></div>}</>}
    {failed && <div className="post-fallback">{preview}<p>Instagram belum bisa dimuat di browser ini.</p></div>}
    <a className="post-original" href={post.url} {...external}>{post.title} <span>View on Instagram ↗</span></a>
  </article>;
}

function InstagramSlider() {
  const section = useRef(null), track = useRef(null);
  const [active, setActive] = useState(false);
  const feed = useInstagramFeed();
  const [position, setPosition] = useState('1–3');
  const [edges, setEdges] = useState({ start: true, end: false });
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { setActive(true); observer.disconnect(); } }, { rootMargin: '250px' });
    observer.observe(section.current); return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const element = track.current;
    const update = () => {
      const slide = element.querySelector('.instagram-slide');
      const step = (slide?.getBoundingClientRect().width || 350) + 16;
      const first = Math.round(element.scrollLeft / step) + 1;
      const visible = Math.max(1, Math.floor((element.clientWidth + 16) / step));
      setPosition(`${first}–${Math.min(feed.length, first + visible - 1)}`);
      setEdges({ start: element.scrollLeft < 2, end: element.scrollLeft + element.clientWidth >= element.scrollWidth - 2 });
    };
    element.addEventListener('scroll', update, { passive: true });
    const observer = new ResizeObserver(update); observer.observe(element); update();
    return () => { element.removeEventListener('scroll', update); observer.disconnect(); };
  }, [feed.length]);
  const advance = (direction) => {
    const element = track.current;
    const width = element.querySelector('.instagram-slide').getBoundingClientRect().width + 16;
    element.scrollBy({ left: direction * width, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  };
  return <section id="gallery" ref={section} className="section gallery"><div className="container"><p className="eyebrow">FROM THE STUDIO</p><h2>Custom sets, made for you.</h2><a className="instagram-profile" href={salon.instagram} {...external}><img src={image('logo')} width="44" height="44" alt="" /><span><strong>@chii.nails_</strong><small>Real sets. Real little details.</small></span></a><div ref={track} id="instagram-posts" className="instagram-track" tabIndex="0" role="region" aria-label="Slider postingan Instagram Chii" onKeyDown={event => { if (event.target !== event.currentTarget) return; if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') { event.preventDefault(); advance(event.key === 'ArrowRight' ? 1 : -1); } }}>{feed.map(post => <InstagramPost post={post} active={active} key={post.id} />)}</div><div className="slider-controls"><p className="small muted">Custom nail art · French · Character · Press-on</p><div className="slider-arrows"><span className="sr-only" aria-live="polite">Postingan {position} dari {feed.length}</span><button className="circle-button" aria-label="Postingan sebelumnya" aria-controls="instagram-posts" disabled={edges.start} onClick={() => advance(-1)}><img src="/images/prev.svg" width="20" height="20" alt="" /></button><button className="circle-button" aria-label="Postingan berikutnya" aria-controls="instagram-posts" disabled={edges.end} onClick={() => advance(1)}><img src="/images/next.svg" width="20" height="20" alt="" /></button></div></div><LinkButton secondary>Request a custom set</LinkButton></div></section>;
}

function AboutIntro({ full = false }) {
  return <section className="section container about-grid"><Photo name="naykilla" alt="Nail art custom warna-warni dengan detail karakter dan bintang" /><div><p className="eyebrow">MEET CHII</p><h2>Small studio.<br />So much imagination.</h2><p>Chii Nails adalah nail art studio di Palembang untuk kamu yang suka detail personal. Kami bangga bisa mengkreasikan desain sesuai permintaanmu—bawa warna, karakter, atau referensi yang kamu suka, lalu ceritakan ide set berikutnya.</p><p className="small accent">Nail art · Extensions · Custom press-on</p><LinkButton secondary>Kirim desain inspirasimu</LinkButton>{!full && <a className="text-link" href="/about.html">Tentang Chii & aturan booking →</a>}</div></section>;
}

function WhyChii() {
  const items = [
    ['✧', 'Best Quality', 'Detail yang dikerjakan dengan teliti untuk setiap set.'],
    ['✎', 'Custom Premium Design', 'Desain sesuai request, dari ide sederhana sampai detail yang personal.'],
    ['◇', 'Competitive Price', 'Harga mengikuti desain. Konsultasikan budget dan inspirasimu bersama Chii.'],
    ['↗', 'Delivery Across Indonesia', 'Press-on nails dikirim ke seluruh Indonesia. Konfirmasi ongkir dan estimasi saat order.'],
  ];
  return <section className="section container why-section"><p className="eyebrow">WHY CHII NAILS?</p><h2>Little details. A little more Chii.</h2><div className="why-grid">{items.map(([icon, title, copy]) => <article key={title}><span className="why-icon" aria-hidden="true">{icon}</span><div><h3>{title}</h3><p>{copy}</p></div></article>)}</div></section>;
}

function StudioPhoto() {
  return <div className="studio-photo"><img src={image('studio')} alt="Ruang studio Chii yang sebenarnya, dengan dekorasi pink dan meja manicure" loading="lazy" decoding="async" /></div>;
}

function MapArea() {
  const [live, setLive] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!live || mapReady) return;
    const timeout = setTimeout(() => setFailed(true), 12000);
    return () => clearTimeout(timeout);
  }, [live, mapReady]);
  return <div className="map-column"><div className="map-area">{live && <iframe onLoad={() => setMapReady(true)} title="Google Maps — Dewi Salon & Chii.Nails, Palembang" src={salon.mapEmbed} loading="lazy" referrerPolicy="strict-origin-when-cross-origin" allowFullScreen />}{(!live || !mapReady) && <div className="map-loading-cover map-preview"><svg className="map-pin" width="42" height="48" viewBox="0 0 24 28" fill="none" aria-hidden="true"><path d="M21 10c0 7-9 16-9 16S3 17 3 10a9 9 0 1 1 18 0Z" stroke="currentColor" strokeWidth="1.5"/><circle cx="12" cy="10" r="3" stroke="currentColor" strokeWidth="1.5"/></svg><div className="map-place"><strong>Dewi Salon & Chii.Nails</strong><small>{salon.address}</small>{failed ? <><small>Peta belum bisa dimuat di browser ini.</small><a className="text-link" href={salon.maps} {...external}>Buka lokasi di Google Maps ↗</a></> : <button className="text-link" disabled={live} onClick={() => setLive(true)}>{live ? 'Memuat peta interaktif…' : 'Muat peta interaktif ↗'}</button>}</div></div>}</div><p className="muted">Satu studio, banyak inspirasi.<br />Temukan lokasi tepatnya lewat Google Maps.</p><LinkButton href={salon.maps}>Open Google Maps</LinkButton></div>;
}

function Visit() {
  return <section id="visit" className="section container"><p className="eyebrow">VISIT US IN PERSON</p><h2>Your next nail date, right here.</h2><div className="visit-grid"><div><StudioPhoto /><h3 className="studio-title">Dewi Salon & Chii.Nails</h3><address>{salon.address}</address><p className="small accent">{salon.hours}<br />{salon.lastBooking}<br />Booking only · Tidak menerima walk-in</p><LinkButton href={salon.directions} secondary>Get directions ↗</LinkButton></div><MapArea /></div></section>;
}

function Booking() {
  return <section className="section booking"><div className="container"><p className="eyebrow">LET’S MAKE IT YOURS</p><h2>Got a design in mind?</h2><p>Kirim inspirasimu, pilih jadwal, dan wujudkan set yang kamu inginkan bersama Chii.</p><LinkButton>Kirim desain inspirasimu</LinkButton><a className="text-link" href="/about.html#booking-rules">Baca aturan booking terlebih dahulu →</a></div></section>;
}

function RulesPage() {
  return <><section className="hero-intro container"><p className="eyebrow">ABOUT CHII & BOOKING RULES</p><h1>A little studio.<br />A lot of imagination.</h1><p>Desainmu personal. Waktu nail date-mu juga kami jaga.</p></section><AboutIntro full /><section id="booking-rules" className="section rules-section"><div className="container"><p className="eyebrow">BEFORE YOUR NAIL DATE</p><h2>Sebelum booking, baca dulu ya.</h2><p className="muted">Aturan ini membantu kami menyiapkan waktu khusus untuk setiap pelanggan.</p><div className="rules-layout"><div className="rules-list">{bookingRules.map((rule, index) => <details key={rule.title} open={index === 0}><summary><span className="rule-number">0{index + 1}</span>{rule.title}<span className="rule-plus" aria-hidden="true">+</span></summary><p>{rule.body}</p></details>)}</div><aside className="booking-note"><p className="eyebrow">A LITTLE REMINDER</p><h3>Your slot.<br />Reserved with a deposit.</h3><p>Booking wajib DP. Konfirmasikan nominal melalui WhatsApp. Pembatalan membuat DP hangus, dan keterlambatan dikenakan denda Rp10.000 per 10 menit.</p><p><strong>{salon.hours}</strong><br />{salon.lastBooking}<br />Booking only · Tidak menerima walk-in</p><LinkButton href={salon.whatsapp}>Booking via WhatsApp</LinkButton></aside></div></div></section><Booking /></>;
}

function FloatingChat() {
  const [open, setOpen] = useState(false);
  const widget = useRef(null), trigger = useRef(null), closeButton = useRef(null);
  useEffect(() => {
    if (!open) return;
    closeButton.current?.focus();
    const dismiss = event => {
      if (event.type === 'keydown' && event.key === 'Escape') { setOpen(false); trigger.current?.focus(); }
      if (event.type === 'pointerdown' && !widget.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('keydown', dismiss); document.addEventListener('pointerdown', dismiss);
    return () => { document.removeEventListener('keydown', dismiss); document.removeEventListener('pointerdown', dismiss); };
  }, [open]);
  return <div className="chat-widget" ref={widget}>{open && <section id="chat-panel" className="chat-panel" role="region" aria-labelledby="chat-title"><div className="chat-heading"><h2 id="chat-title">Let’s talk nails</h2><button ref={closeButton} className="icon-button" aria-label="Tutup chat" onClick={() => { setOpen(false); trigger.current?.focus(); }}>×</button></div><p className="muted">Punya desain incaran? Kirim referensimu lewat:</p><a className="contact-option" href={salon.custom} {...external}><span className="contact-symbol" aria-hidden="true">W</span><span><strong>WhatsApp</strong><small>Konsultasi desain & booking</small></span><span aria-hidden="true">↗</span></a><a className="contact-option" href={salon.instagram} {...external}><span className="contact-symbol" aria-hidden="true">◎</span><span><strong>Instagram</strong><small>Lihat karya & kirim DM</small></span><span aria-hidden="true">↗</span></a></section>}<button ref={trigger} className="chat-trigger" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="chat-panel"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M20 11.5a8 8 0 0 1-8 8 9 9 0 0 1-4-.9L3 20l1.4-4.4A8 8 0 1 1 20 11.5Z" stroke="currentColor" strokeWidth="1.6" /><path d="M8 9h7M8 13h5" stroke="currentColor" strokeWidth="1.6" /></svg>{open ? 'Close chat' : 'Chat with us'}</button></div>;
}

function Footer({ year }) {
  return <footer className="container footer"><div><a className="footer-brand" href="/">Chii Nails_ · Nail Art Studio</a><a href="/about.html">About & booking rules</a><a href={salon.instagram} {...external}>Instagram ↗</a><a href={salon.whatsapp} {...external}>WhatsApp ↗</a></div><p>© {year} Chii Nails · Palembang. Made for your little moments.</p></footer>;
}

export default function App({ pathname = '/', year = new Date().getFullYear() }) {
  const about = /^\/about(?:\.html)?\/?$/.test(pathname);
  return <><a href="#main" className="skip-link">Lewati ke konten</a><Header /><main id="main">{about ? <RulesPage /> : <InstagramFeedProvider><Hero /><Services /><InstagramSlider /><WhyChii /><AboutIntro /><Visit /><Booking /></InstagramFeedProvider>}</main><Footer year={year} /><FloatingChat /></>;
}








