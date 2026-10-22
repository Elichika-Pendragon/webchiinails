import React, { useEffect, useRef, useState } from 'react';
import { salon, services, bookingRules } from './content';
import { InstagramFeedProvider, useInstagramFeed } from './instagram-feed.jsx';
import { studioPhotos, studioPhoto, photoSourceSet } from './studio-photos.js';
import PriceList from './PriceList.jsx';
import './styles.css';

const image = (name) => name === 'studio' ? '/images/studio-clean.webp' : `/images/${name === 'logo' ? 'logo-brand' : name}.${name === 'map' ? 'png' : 'webp'}`;
const external = { target: '_blank', rel: 'noopener noreferrer' };

function LinkButton({ href = salon.custom, children, secondary = false, ...props }) {
  return <a className={`button${secondary ? ' button-secondary' : ''}`} href={href} {...external} {...props}>{children}</a>;
}

export function Header() {
  const [open, setOpen] = useState(false);
  const toggle = useRef(null);
  useEffect(() => {
    const close = (event) => { if (event.key === 'Escape') { setOpen(false); toggle.current?.focus(); } };
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, []);
  return <header className="site-header">
    <div className="header-inner container">
      <a href="/" className="brand" aria-label="Chii Nails — Beranda"><img src={image('logo')} width="96" height="64" alt="Chii Nails Nail Art Studio" /></a>
      <button ref={toggle} className="menu-toggle" aria-expanded={open} aria-controls="main-navigation" onClick={() => setOpen(!open)}>{open ? 'Tutup ×' : 'Menu ☰'}</button>
      <nav id="main-navigation" className={open ? 'navigation is-open' : 'navigation'} aria-label="Menu utama">
        <a className="desktop-nav-link" href="/#services" onClick={() => setOpen(false)}>Services</a><a className="desktop-nav-link" href="/#gallery" onClick={() => setOpen(false)}>Custom sets</a><a className="mobile-nav-link" href="/services" onClick={() => setOpen(false)}>Services</a><a className="mobile-nav-link" href="/custom-sets" onClick={() => setOpen(false)}>Custom sets & prices</a><a href="/about" onClick={() => setOpen(false)}>About & rules</a><a className="desktop-nav-link" href="/#visit" onClick={() => setOpen(false)}>Visit us</a><a className="mobile-nav-link" href="/visit" onClick={() => setOpen(false)}>Visit us</a>
        <a className="mobile-booking" href={salon.custom} {...external}>Kirim desain inspirasimu ↗</a>
      </nav>
      <LinkButton className="button header-booking">Kirim desain inspirasimu</LinkButton>
    </div>
  </header>;
}

function Photo({ name, alt, className = '', priority = false, sizes = '(max-width: 720px) calc(100vw - 40px), (max-width: 1100px) 45vw, 552px' }) {
  const photo = studioPhoto(name);
  return <img className={`photo ${className}`} src={photo ? `/images/${name}-720.webp` : image(name)} srcSet={photo ? photoSourceSet(photo) : undefined} sizes={photo ? sizes : undefined} alt={alt || photo?.alt} style={photo ? { objectPosition: photo.position } : undefined} loading={priority ? 'eager' : 'lazy'} fetchPriority={priority ? 'high' : 'auto'} decoding="async" width={photo?.width || 720} height={photo?.height || 960} />;
}

function HeroPhoto({ post, priority = false, compact = false }) {
  return <a className="mosaic-photo-link" data-curated="true" href="/custom-sets#studio-portfolio">
    <Photo name={post.name} priority={priority} sizes={priority ? '(max-width: 720px) calc(100vw - 40px), (max-width: 1100px) calc((100vw - 92px) / 2), (max-width: 1440px) calc((100vw - 156px) / 2), 642px' : compact ? '(max-width: 720px) 1px, (max-width: 1100px) calc((100vw - 104px) / 4), (max-width: 1440px) calc((100vw - 168px) / 4), 315px' : '(max-width: 720px) 1px, (max-width: 1100px) calc((100vw - 92px) / 2), (max-width: 1440px) calc((100vw - 156px) / 2), 642px'} />
  </a>;
}

function Hero() {
  const media = studioPhotos;
  return <>
    <section className="hero-intro container"><p className="eyebrow">NAIL ART STUDIO · PALEMBANG</p><h1>Nail art di Palembang,<br />made personal.</h1><p>Custom nail art, nail extensions, dan press-on di Chii Nails Palembang.<br />Bawa desain yang kamu suka. Kami kreasikan jadi milikmu.</p></section>
    <section className="mosaic container" id="hero-photo" data-hero-slideshow aria-label="Karya nail art Chii">
      <div className="mosaic-feature"><HeroPhoto post={media[0]} priority /></div>
      <div className="mosaic-support"><HeroPhoto post={media[1]} /><div className="mosaic-pair"><HeroPhoto post={media[2]} compact /><HeroPhoto post={media[3]} compact /></div></div>
    </section>
    <div className="mosaic-caption container"><div><h2>Your nails. Your little joy.</h2><p>Bawa inspirasimu. Kita wujudkan.</p></div><LinkButton className="button hero-mobile-contact">Kirim desain inspirasimu</LinkButton></div>
    <div className="care-strip"><div className="container"><span>✧ Custom request, always</span><span>✧ Basic manicure & vitamin oil</span><span>✧ Booking via WhatsApp</span></div></div>
  </>;
}

function Services() {
  return <section id="services" className="section container"><p className="eyebrow">THE SERVICE MENU</p><h2>Nail art &amp; nail treatment in Palembang.</h2><p className="muted">Custom nail art, nail extensions, dan press-on dari studio kami di Palembang. Untuk nail treatment, tersedia basic manicure &amp; vitamin oil. Kirim referensi untuk konsultasi desain dan harga.</p><div className="service-grid">{services.map(service => <article className="service-card" key={service.title}><p className="eyebrow">{service.kicker}</p><h3>{service.title}</h3><p>{service.description}</p><a href={salon.custom} {...external}>Konsultasi {service.title.toLowerCase()} →</a></article>)}</div><p className="small muted">Lihat <a className="text-link" href="/custom-sets#price-list">daftar harga nail art, extensions &amp; press-on</a>. Konfirmasi desain dan total saat booking.</p></section>;
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

function InstagramPost({ post, active, priority = false }) {
  const host = useRef(null);
  const card = useRef(null);
  const [near, setNear] = useState(false);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const shouldEmbed = active && near;
  const preview = <img className="photo" src={post.imageUrl || image(post.image || 'maroon')} alt={post.alt} loading={priority ? "eager" : "lazy"} fetchPriority={priority ? "high" : undefined} decoding="async" onError={event => { if (!event.currentTarget.dataset.fallback) { event.currentTarget.dataset.fallback = 'true'; event.currentTarget.src = image(post.image || 'maroon'); } }} />;
  useEffect(() => {
    if (!active) return;
    if (!('IntersectionObserver' in window)) { setNear(true); return; }
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

function StudioPortfolio({ priority = false }) {
  return <div id="studio-portfolio" className="studio-portfolio" aria-label="Pilihan karya Chii Nails">
    {studioPhotos.map((photo, index) => <figure key={photo.name}><Photo name={photo.name} priority={priority && index === 0} sizes="(max-width: 540px) calc(100vw - 40px), (max-width: 720px) calc((100vw - 56px) / 2), (max-width: 1100px) calc((100vw - 112px) / 3), (max-width: 1440px) calc((100vw - 176px) / 3), 421px" /><figcaption>{photo.title}</figcaption></figure>)}
  </div>;
}

function InstagramSlider({ eagerPreview = false }) {
  const section = useRef(null), track = useRef(null);
  const [active, setActive] = useState(false);
  const feed = useInstagramFeed();
  const [position, setPosition] = useState('1–3');
  const [edges, setEdges] = useState({ start: true, end: false });
  useEffect(() => {
    if (!('IntersectionObserver' in window)) { setActive(true); return; }
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
    const observer = 'ResizeObserver' in window ? new ResizeObserver(update) : null;
    if (observer) observer.observe(element);
    else window.addEventListener('resize', update, { passive: true });
    update();
    return () => { element.removeEventListener('scroll', update); observer?.disconnect(); window.removeEventListener('resize', update); };
  }, [feed.length]);
  const advance = (direction) => {
    const element = track.current;
    const width = element.querySelector('.instagram-slide').getBoundingClientRect().width + 16;
    element.scrollBy({ left: direction * width, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  };
  return <section id="gallery" ref={section} className="section gallery"><div className="container"><p className="eyebrow">FROM THE STUDIO</p><h2>Custom sets, made for you.</h2><a className="text-link portfolio-price-link" href="#price-list">View price list ↓</a><StudioPortfolio priority={eagerPreview} /><a className="instagram-profile" href={salon.instagram} {...external}><img src={image('logo')} width="44" height="44" alt="" /><span><strong>@chii.nails_</strong><small>Real sets. Real little details.</small></span></a><div ref={track} id="instagram-posts" className="instagram-track" data-instagram-archive="/api/instagram-archive" tabIndex="0" role="region" aria-label="Slider postingan Instagram Chii" onKeyDown={event => { if (event.target !== event.currentTarget) return; if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') { event.preventDefault(); advance(event.key === 'ArrowRight' ? 1 : -1); } }}>{feed.map((post, index) => <InstagramPost post={post} active={active} priority={false} key={post.id} />)}</div><div className="slider-controls"><p className="small muted">Custom nail art · French · Character · Press-on</p><div className="slider-arrows"><span className="sr-only" aria-live="polite">Postingan {position} dari {feed.length}</span><button className="circle-button" aria-label="Postingan sebelumnya" aria-controls="instagram-posts" disabled={edges.start} onClick={() => advance(-1)}><img src="/images/prev.svg" width="20" height="20" alt="" /></button><button className="circle-button" aria-label="Postingan berikutnya" aria-controls="instagram-posts" disabled={edges.end} onClick={() => advance(1)}><img src="/images/next.svg" width="20" height="20" alt="" /></button></div></div><div className="gallery-actions"><LinkButton secondary>Request a custom set</LinkButton><a className="text-link" href="#price-list">View price list ↓</a></div><PriceList /></div></section>;
}

function AboutIntro({ full = false }) {
  return <section className="section container about-grid"><Photo name="jessica-press-on-collection" /><div><p className="eyebrow">MEET CHII</p><h2>Small studio.<br />So much imagination.</h2><p>Chii Nails adalah studio dan salon nail art di Palembang untuk kamu yang suka detail personal. Kami bangga bisa mengkreasikan desain sesuai permintaanmu—bawa warna, karakter, atau referensi yang kamu suka, lalu ceritakan ide set berikutnya.</p><p className="small accent">Nail art · Extensions · Custom press-on</p><LinkButton secondary>Kirim desain inspirasimu</LinkButton>{!full && <a className="text-link" href="/about">Tentang Chii & aturan booking →</a>}</div></section>;
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
  return <div className="studio-photo"><img src={image('studio')} alt="Studio Chii Nails di Palembang dengan meja manicure dan dekorasi pink" loading="lazy" decoding="async" /></div>;
}

function StudioHours() {
  const time = value => value.replace(':', '.');
  return <div className="studio-hours"><table><caption>Jam layanan · WIB</caption><thead className="sr-only"><tr><th scope="col">Hari</th><th scope="col">Jam layanan dan Last book</th></tr></thead><tbody>{salon.openingHours.map(day => <tr key={day.label}><th scope="row">{day.label}</th><td><strong>{time(day.opens)}–{time(day.closes)}</strong><small>Last book {day.lastBooking}</small></td></tr>)}</tbody></table><p className="booking-status"><strong>Booking only · Wajib DP</strong><span>Tidak menerima walk-in.</span></p></div>;
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
  return <section id="visit" className="section container"><p className="eyebrow">VISIT US IN PERSON</p><h2>Your next nail date, right here.</h2><div className="visit-grid"><div><StudioPhoto /><h3 className="studio-title">Dewi Salon & Chii.Nails</h3><address>{salon.address}</address><StudioHours /><LinkButton href={salon.directions} secondary>Get directions ↗</LinkButton></div><MapArea /></div></section>;
}

function Booking() {
  return <section className="section booking"><div className="container"><p className="eyebrow">LET’S MAKE IT YOURS</p><h2>Got a design in mind?</h2><p>Kirim inspirasimu, pilih jadwal, dan wujudkan set yang kamu inginkan bersama Chii.</p><LinkButton>Kirim desain inspirasimu</LinkButton><a className="text-link" href="/about#booking-rules">Baca aturan booking terlebih dahulu →</a></div></section>;
}

function RulesPage() {
  return <><section className="hero-intro container"><p className="eyebrow">ABOUT CHII & BOOKING RULES</p><h1>A little studio.<br />A lot of imagination.</h1><p>Kenali Chii Nails, nail art studio di Palembang, dan aturan booking sebelum datang.</p></section><AboutIntro full /><section id="booking-rules" className="section rules-section"><div className="container"><p className="eyebrow">BEFORE YOUR NAIL DATE</p><h2>Sebelum booking, baca dulu ya.</h2><p className="muted">Aturan ini membantu kami menyiapkan waktu khusus untuk setiap pelanggan.</p><div className="rules-layout"><div className="rules-list">{bookingRules.map((rule, index) => <details key={rule.title} open={index === 0}><summary><span className="rule-number">0{index + 1}</span>{rule.title}<span className="rule-plus" aria-hidden="true">+</span></summary><p>{rule.body}</p></details>)}</div><aside className="booking-note"><p className="eyebrow">A LITTLE REMINDER</p><h3>Your slot.<br />Reserved with a deposit.</h3><p>Booking wajib DP. Konfirmasikan nominal melalui WhatsApp. Pembatalan membuat DP hangus, dan keterlambatan dikenakan denda Rp10.000 per 10 menit.</p><StudioHours /><LinkButton href={salon.whatsapp}>Booking via WhatsApp</LinkButton></aside></div></div></section><Booking /></>;
}

function ServiceQuestions() {
  return <section id="questions" className="section container service-questions" aria-labelledby="questions-title">
    <p className="eyebrow">A FEW THINGS TO KNOW</p><h2 id="questions-title">Before your next set.</h2>
    <div className="rules-list">
      <details><summary>Bagaimana cara booking nail art di Chii Nails?<span className="rule-plus" aria-hidden="true">+</span></summary><p>Konsultasikan desain, harga, dan durasi melalui <a className="text-link" href={salon.whatsapp} {...external}>WhatsApp Chii Nails</a>. Setelah sepakat, Chii membagikan link form booking untuk mengisi data, memilih jadwal, dan mengunggah bukti DP atau full payment. Kirim permintaan yang disiapkan melalui WhatsApp; Chii memeriksa pembayaran dan menerima jadwal sebelum masuk ke kalender. Studio hanya melayani dengan booking dan tidak menerima walk-in. Baca <a className="text-link" href="/about#booking-rules">aturan booking lengkap</a> sebelum menentukan jadwal.</p></details>
      <details><summary>Berapa harga custom nail art dan extensions?<span className="rule-plus" aria-hidden="true">+</span></summary><p>Lihat <a className="text-link" href="/custom-sets#price-list">daftar harga Chii Nails</a> untuk pilihan nail art, extensions, dan tambahan. Harga akhir mengikuti desain dan tingkat kesulitan. Kirim foto inspirasi dan sampaikan budget-mu saat konsultasi agar total bisa dikonfirmasi sebelum booking.</p></details>
      <details><summary>Bisa pesan press-on dari luar Palembang?<span className="rule-plus" aria-hidden="true">+</span></summary><p>Bisa. Press-on nails custom dapat dikirim ke seluruh Indonesia. Hubungi Chii untuk membahas desain dan ukuran, lalu konfirmasikan ongkir serta estimasi pesanan. Untuk nail art dan extensions langsung, kunjungi <a className="text-link" href="/visit">studio Chii Nails di Palembang</a> sesuai jadwal booking.</p></details>
    </div>
  </section>;
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
  return <div className="chat-widget" ref={widget}><section hidden={!open} id="chat-panel" className="chat-panel" role="region" aria-labelledby="chat-title"><div className="chat-heading"><h2 id="chat-title">Let’s talk nails</h2><button ref={closeButton} className="icon-button" aria-label="Tutup chat" onClick={() => { setOpen(false); trigger.current?.focus(); }}>×</button></div><p className="muted">Punya desain incaran? Kirim referensimu lewat:</p><a className="contact-option" href={salon.custom} {...external}><span className="contact-symbol" aria-hidden="true"><img src="/images/whatsapp.svg" width="28" height="28" alt="" /></span><span><strong>WhatsApp</strong><small>Konsultasi desain & booking</small></span><span aria-hidden="true">↗</span></a><a className="contact-option" href={salon.instagram} {...external}><span className="contact-symbol" aria-hidden="true"><img src="/images/instagram.svg" width="28" height="28" alt="" /></span><span><strong>Instagram</strong><small>Lihat karya & kirim DM</small></span><span aria-hidden="true">↗</span></a></section><button ref={trigger} className="chat-trigger" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="chat-panel"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M20 11.5a8 8 0 0 1-8 8 9 9 0 0 1-4-.9L3 20l1.4-4.4A8 8 0 1 1 20 11.5Z" stroke="currentColor" strokeWidth="1.6" /><path d="M8 9h7M8 13h5" stroke="currentColor" strokeWidth="1.6" /></svg>{open ? 'Close chat' : 'Chat with us'}</button></div>;
}

function MobilePageTabs({ path }) {
  return <nav className="mobile-page-tabs" aria-label="Halaman Chii Nails">{[['/', 'Home'], ['/services', 'Services'], ['/custom-sets', 'Custom sets'], ['/visit', 'Visit'], ['/about', 'About']].map(([href, label]) => <a key={href} href={href} aria-current={path === href ? 'page' : undefined}>{label}</a>)}</nav>;
}

function PageIntro({ eyebrow, title, children }) {
  return <section className="hero-intro container"><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{children}</p></section>;
}

function MobileHomeSummary() {
  return <section className="mobile-home-summary section container"><p className="eyebrow">MAKE IT YOURS</p><h2>Your next nail date, made simple.</h2><p className="muted">Salon nail art di Palembang untuk custom nail art, extensions, basic manicure &amp; vitamin oil. Press-on custom bisa dikirim ke seluruh Indonesia.</p><div className="mobile-destination-cards"><a href="/services"><strong>Services <span>↗</span></strong><span>Nail art, extensions &amp; nail treatment.</span></a><a href="/custom-sets"><strong>Custom sets &amp; prices <span>↗</span></strong><span>Lihat karya, daftar harga &amp; paket press-on.</span></a><a href="/visit"><strong>Visit the studio <span>↗</span></strong><span>Lokasi di dekat SMA N 5 Palembang, jam layanan &amp; Last book.</span></a></div><p className="mobile-booking-note"><strong>Booking only · Wajib DP</strong><span>Tidak menerima walk-in. <a className="text-link" href="/about#booking-rules">Baca aturan booking →</a></span></p></section>;
}

function MobileHomeVisit() {
  return <section className="mobile-home-visit section container" aria-labelledby="home-visit-title"><p className="eyebrow">FIND US IN PALEMBANG</p><h2 id="home-visit-title">Your next nail date, right here.</h2><h3>Dewi Salon &amp; Chii.Nails</h3><address>{salon.address}</address><StudioHours /><MapArea /><a className="text-link" href="/visit">Lihat studio &amp; petunjuk lengkap →</a></section>;
}

export function Footer({ year }) {
  return <footer className="container footer"><div><a className="footer-brand" href="/">Chii Nails_ · Nail Art Studio</a><a href="/about">About & booking rules</a><a href={salon.instagram} {...external}>Instagram ↗</a><a href={salon.whatsapp} {...external}>WhatsApp ↗</a></div><p>© {year} Chii Nails · Palembang. Made for your little moments.</p></footer>;
}

export default function App({ pathname = '/', year = new Date().getFullYear() }) {
  const path = pathname.replace(/\.html$/, '').replace(/\/$/, '') || '/';
  let content;
  if (path === '/about') content = <RulesPage />;
  else if (path === '/services') content = <><PageIntro eyebrow="THE SERVICE MENU · PALEMBANG" title="Nail art, French nails & extensions.">Dari French nails yang clean, custom nail art, hingga nail extension di studio Chii Nails, Palembang. Pilih layanan dan kirim referensimu sebelum booking.</PageIntro><Services /><WhyChii /><ServiceQuestions /><Booking /></>;
  else if (path === '/custom-sets') content = <InstagramFeedProvider><PageIntro eyebrow="CUSTOM SETS & PRICE LIST" title="Nail art & press-on custom.">Custom nail art dan press-on karya Chii Nails di Palembang. Lihat French nails, desain karakter, dan daftar harga. Press-on dapat dikirim ke seluruh Indonesia.</PageIntro><InstagramSlider eagerPreview /><Booking /></InstagramFeedProvider>;
  else if (path === '/visit') content = <><PageIntro eyebrow="VISIT CHII · PALEMBANG" title="Kunjungi Chii Nails di Palembang.">Temukan Dewi Salon &amp; Chii.Nails, dekat SMA N 5 Palembang. Cek jam layanan dan booking melalui WhatsApp sebelum datang.</PageIntro><Visit /><Booking /></>;
  else content = <InstagramFeedProvider><Hero /><MobileHomeSummary /><MobileHomeVisit /><div className="desktop-home-details"><Services /><InstagramSlider /><WhyChii /><AboutIntro /><Visit /><ServiceQuestions /><Booking /></div></InstagramFeedProvider>;
  return <><a href="#main" className="skip-link">Lewati ke konten</a><Header /><MobilePageTabs path={path} /><main id="main" className={path === '/' ? 'home-page' : ''}>{content}</main><Footer year={year} /><FloatingChat /></>;
}
