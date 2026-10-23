import { normalizeWhatsApp } from '../../server/booking.js';
import { rupiah } from '../pricing.js';

export function initApprovalReceipt({ api, getSession, getToken, onPayment = () => {} }) {
  const link=document.getElementById('approval-receipt-send'), retry=document.getElementById('approval-receipt-retry'), status=document.getElementById('approval-receipt-status');
  const controls=document.getElementById('approval-payment-controls'), confirm=document.getElementById('approval-payment-confirm'), label=document.getElementById('approval-payment-confirm-label'), button=document.getElementById('approval-payment-record');
  let generation=0, current=null, payment=null, busy=false;
  function clear() { generation++; current=null; payment=null; busy=false; link.hidden=true; link.removeAttribute('href'); retry.hidden=true; status.textContent=''; controls.hidden=true; confirm.checked=false; button.disabled=true; }
  function action(text,caption) { controls.hidden=false; label.textContent=text; button.textContent=caption; confirm.checked=false; button.disabled=true; }
  function checkedPayment(value,item) {
    if (!value || value.initialPayment!==item.deposit || !Number.isSafeInteger(value.paidAmount) || value.paidAmount<item.deposit || value.paidAmount>item.agreedPrice || (item.status==='cancelled'?value.amountDue!==null:value.amountDue!==item.agreedPrice-value.paidAmount)) throw new Error();
    return value;
  }
  async function prepare(item, confirmPayment=false) {
    const sequence=++generation; link.hidden=true; link.removeAttribute('href'); retry.hidden=true; controls.hidden=true; status.textContent='Menyiapkan tautan kuitansi…';
    try {
      if (!getSession()?.authenticated || !['accepted','cancelled'].includes(item.status)) throw new Error();
      const result=await api('/api/booking/receipt-issue',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':getSession().csrfToken},body:JSON.stringify({token:getToken(),...(confirmPayment?{confirmPayment:true}:{})})});
      const receipt=new URL(result.receiptUrl), phone=normalizeWhatsApp(result.whatsapp), latest=checkedPayment(result.payment,item);
      if (receipt.origin!==location.origin || receipt.pathname!=='/receipt' || receipt.search || !/^#r=[a-f0-9-]{36}\.[A-Za-z0-9_-]{43}$/.test(receipt.hash) || !phone || phone!==normalizeWhatsApp(item.whatsapp)) throw new Error();
      if (sequence!==generation) return;
      payment=latest; onPayment(payment,item);
      const state=item.status==='cancelled'?'Booking dibatalkan':payment.amountDue===0?'Lunas':`Belum Lunas · sisa ${rupiah(payment.amountDue)}`;
      const message=`Halo ${item.name}, berikut kuitansi pembayaran Chii Nails.\n${state}\nPembayaran diterima: ${rupiah(payment.paidAmount)}\n${receipt.href}\n\nBuka tautan untuk melihat rincian dan pilih Print / Save as PDF jika diperlukan. Terima kasih!`;
      link.href=`https://wa.me/${phone}?text=${encodeURIComponent(message)}`;link.hidden=false;
      status.textContent=`${state}. Pengiriman kuitansi opsional; tekan tombol WhatsApp hanya jika ingin mengirimnya.`;
      if (item.status==='accepted' && payment.amountDue>0) action(`Saya sudah menerima sisa pembayaran ${rupiah(payment.amountDue)}.`, 'Tandai Lunas');
    } catch { if (sequence===generation) {status.textContent='Tautan kuitansi belum tersedia. Status booking tetap tersimpan; coba muat ulang rincian pembayaran.';retry.hidden=false;} }
  }
  confirm.addEventListener('change',()=>{button.disabled=busy||!confirm.checked;});
  button.addEventListener('click',async()=>{
    if (busy || !confirm.checked || !current || !getSession()?.authenticated) return;
    busy=true;button.disabled=true;const item=current, sequence=generation;
    if (item.status==='cancelled') {await prepare(item,true);busy=false;return;}
    if (item.status!=='accepted' || !payment || payment.amountDue<1) {busy=false;return;}
    const expectedAmount=payment.amountDue;
    link.hidden=true;link.removeAttribute('href');status.textContent='Mencatat pelunasan…';
    try {
      const result=await api('/api/booking/settle',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':getSession().csrfToken},body:JSON.stringify({token:getToken(),confirmed:true,expectedAmount})});
      if (sequence!==generation) return;
      checkedPayment(result.payment,item);await prepare(item);
    } catch {if(sequence===generation){controls.hidden=true;status.textContent='Hasil pelunasan belum dapat diperiksa. Muat ulang rincian sebelum mencoba lagi; pembayaran tidak dicatat dua kali.';retry.hidden=false;}}
    finally {busy=false;}
  });
  retry.addEventListener('click',()=>{
    if(!current||busy)return;
    if(current.status==='cancelled'&&!current.cancelledViaCalendar){status.textContent='Periksa pembayaran masuk, lalu siapkan kuitansi pembatalan.';retry.hidden=true;action(`Saya sudah memeriksa pembayaran masuk ${rupiah(current.deposit)}.`, 'Siapkan kuitansi pembatalan');}
    else prepare(current);
  });
  return {clear,render(item){clear();if(!['accepted','cancelled'].includes(item.status))return;current=item;
    if(item.status==='cancelled'&&!item.cancelledViaCalendar){status.textContent='Kuitansi pembatalan opsional. Konfirmasikan pembayaran masuk sebelum menyiapkan tautannya.';action(`Saya sudah memeriksa pembayaran masuk ${rupiah(item.deposit)}.`, 'Siapkan kuitansi pembatalan');}
    else prepare(item);
  }};
}
