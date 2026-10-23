const main=document.querySelector('.code-manager');
if(main){
  const byId=id=>document.getElementById(`codes-${id}`);
  const form=byId('form'),status=byId('status'),workspace=byId('workspace'),list=byId('list');
  const signInPanel=byId('signin-panel'),signIn=byId('signin'),googleButton=byId('google-button'),signOut=byId('signout'),retry=byId('retry');
  let session=null,busy=false,googleLoading=null;
  const setStatus=(text,error=false)=>{status.textContent=text;status.dataset.tone=error?'error':'normal';};
  const message=error=>error.message==='api' ? ({AUTH_FORBIDDEN:'Akun ini bukan akun pemilik Chii.',AUTH_CSRF:'Sesi keamanan berakhir. Masuk kembali.',BOOKING_CODE_INPUT:'Periksa nama dan nomor WhatsApp.'}[error.code]||'Layanan belum tersedia. Coba lagi; jika pembuatan kode tidak pasti, buat kode pengganti sebelum membagikannya.') : 'Koneksi belum tersedia. Coba lagi.';
  async function api(path,options={}){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
    try{const response=await fetch(path,{...options,credentials:'same-origin',cache:'no-store',referrerPolicy:'no-referrer',signal:controller.signal,headers:{Accept:'application/json',...options.headers}});const data=await response.json();if(!response.ok)throw Object.assign(new Error('api'),{status:response.status,code:data.code||data.error?.code});return data;}finally{clearTimeout(timer);}
  }
  const mutation=body=>api('/api/booking/codes',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':session.csrfToken},body:JSON.stringify(body)});
  function setBusy(value){busy=value;main.setAttribute('aria-busy',String(value));main.querySelectorAll('button,input').forEach(node=>{node.disabled=value;});}
  function showSignIn(text){session=null;workspace.hidden=true;byId('result').hidden=true;byId('created').textContent='';byId('share').value='';list.replaceChildren();signInPanel.hidden=false;signIn.hidden=false;googleButton.hidden=true;googleButton.replaceChildren();setStatus(text);}
  function fail(error){if(error.status===401||error.code==='AUTH_CSRF')showSignIn('Masuk kembali dengan akun pemilik.');else{setStatus(message(error),true);retry.hidden=false;}}
  async function refresh(){
    const data=await api('/api/booking/codes');if(!Array.isArray(data.customers))throw new Error();list.replaceChildren();
    for(const customer of data.customers){const row=document.createElement('li'),text=document.createElement('span'),name=document.createElement('strong'),phone=document.createElement('small');name.textContent=customer.name;phone.textContent=`+${customer.whatsapp} · ${customer.active?'Aktif':'Nonaktif'}`;text.append(name,phone);row.append(text);if(customer.active){const button=document.createElement('button');button.type='button';button.textContent='Nonaktifkan';button.dataset.revoke=customer.id;button.setAttribute('aria-label',`Nonaktifkan kode ${customer.name}`);row.append(button);}list.append(row);}
    if(!data.customers.length){const row=document.createElement('li');row.textContent='Belum ada kode pelanggan.';list.append(row);}
  }
  async function load(){setBusy(true);retry.hidden=true;try{session=await api('/api/booking/auth/session');if(!session.authenticated){showSignIn('Masuk untuk mengelola kode booking.');return;}await refresh();signInPanel.hidden=true;workspace.hidden=false;setStatus('Akses pemilik terverifikasi. Kode tidak memesan jadwal; booking tetap perlu kamu terima.');}catch(error){fail(error);}finally{setBusy(false);}}
  function loadGoogle() {
    if (window.google?.accounts?.id) return Promise.resolve(window.google.accounts.id);
    if (googleLoading) return googleLoading;
    googleLoading = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      const timer = setTimeout(() => { script.remove(); reject(new Error('Sign-in unavailable')); }, 12000);
      script.src = 'https://accounts.google.com/gsi/client'; script.async = true; script.referrerPolicy = 'no-referrer';
      script.onload = () => { clearTimeout(timer); window.google?.accounts?.id ? resolve(window.google.accounts.id) : reject(new Error('Sign-in unavailable')); };
      script.onerror = () => { clearTimeout(timer); script.remove(); reject(new Error('Sign-in unavailable')); };
      document.head.append(script);
    }).catch(error => { googleLoading = null; throw error; });
    return googleLoading;
  }
  async function finishSignIn(result, challenge) {
    setBusy(true);
    try {
      session = await api('/api/booking/auth/session', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': challenge.csrfToken }, body: JSON.stringify({ credential: result.credential, nonce: challenge.nonce }) });
      await load();
    } catch (error) { showSignIn(message(error)); }
    finally { setBusy(false); }
  }
  signIn.addEventListener('click', async () => {
    setBusy(true);
    try {
      const challenge = await api('/api/booking/auth/session');
      if (challenge.authenticated) { await load(); return; }
      if (!challenge.clientId || !challenge.nonce || !challenge.csrfToken) throw new Error('Sign-in unavailable');
      const google = await loadGoogle();
      google.initialize({ client_id: challenge.clientId, nonce: challenge.nonce, callback: result => finishSignIn(result, challenge), auto_select: false, ux_mode: 'popup' });
      googleButton.replaceChildren(); googleButton.hidden = false; signIn.hidden = true;
      google.renderButton(googleButton, { theme: 'outline', size: 'large', type: 'standard', locale: 'id', width: Math.min(320, googleButton.clientWidth || 280) });
      setStatus('Pilih akun Google pemilik Chii.');
    } catch (error) { showSignIn(message(error)); }
    finally { setBusy(false); }
  });

  form.addEventListener('submit',async event=>{event.preventDefault();if(busy||!session?.authenticated||!form.reportValidity())return;setBusy(true);byId('result').hidden=true;try{const result=await mutation({action:'issue',name:byId('name').value,whatsapp:byId('phone').value});byId('created').textContent=result.code;byId('share').value=`Halo ${result.customer.name}, ini kode booking untuk nomor +${result.customer.whatsapp}: ${result.code}\n\nIsi booking di https://chiinails.pages.dev/book setelah kesepakatan layanan, harga dan durasi. Kode dapat dipakai kembali. Jadwal dikonfirmasi setelah Chii memeriksa pembayaran dan menerima permintaan.`;byId('result').hidden=false;await refresh();setStatus('Kode berhasil dibuat. Salin pesan dan kirim sendiri melalui WhatsApp.');}catch(error){fail(error);}finally{setBusy(false);}});
  byId('copy').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(byId('share').value);setStatus('Pesan dan tautan tersalin.');}catch{byId('share').focus();byId('share').select();setStatus('Pilih dan salin pesan secara manual.');}});
  list.addEventListener('click',async event=>{const button=event.target.closest('[data-revoke]');if(!button||busy)return;setBusy(true);try{await mutation({action:'revoke',id:button.dataset.revoke});byId('result').hidden=true;byId('created').textContent='';byId('share').value='';await refresh();setStatus('Kode dinonaktifkan. Permintaan dan booking yang sudah dibuat tetap ada.');}catch(error){fail(error);}finally{setBusy(false);}});
  signOut.addEventListener('click',async()=>{if(busy)return;setBusy(true);try{await api('/api/booking/auth/session',{method:'DELETE',headers:{'X-CSRF-Token':session.csrfToken}});form.reset();showSignIn('Kamu sudah keluar.');}catch(error){fail(error);}finally{setBusy(false);}});
  retry.addEventListener('click',load);load();
}
