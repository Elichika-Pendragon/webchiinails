import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {normalizeWhatsApp} from './booking.js';
import {rupiah} from '../src/pricing.js';
const code=readFileSync(new URL('../src/scripts/approval-receipt.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'').replace('export function','function');
const flush=()=>new Promise(resolve=>setTimeout(resolve,0));
const item={status:'accepted',name:'Synthetic Customer',whatsapp:'6281234567890',deposit:30000,agreedPrice:100000};
function node(){return {hidden:true,disabled:false,checked:false,textContent:'',listeners:{},addEventListener(key,fn){this.listeners[key]=fn;},removeAttribute(key){delete this[key];}};}
function fixture(options={}){
 const nodes=Object.fromEntries([...code.matchAll(/getElementById\('([^']+)'\)/g)].map(x=>[x[1],node()]));const calls=[],updates=[];let paid=options.full?100000:30000;
 const payment=()=>({initialPayment:options.full?100000:30000,paidAmount:paid,amountDue:options.cancelled?null:100000-paid,settledAt:paid===100000?'2026-10-25T04:00:00Z':null});
 const api=async(path,request)=>{const body=JSON.parse(request.body);calls.push({path,body,request});if(path.endsWith('/settle')){paid=100000;if(options.uncertain)throw Error('synthetic uncertain');return {payment:payment()};}return {receiptUrl:'https://synthetic.example/receipt#r=00000000-0000-4000-a000-000000000001.'+'a'.repeat(43),whatsapp:options.wrongPhone?'6281234567899':item.whatsapp,payment:payment()};};
 const context={normalizeWhatsApp,rupiah,document:{getElementById:id=>nodes[id]},location:{origin:'https://synthetic.example'},URL};
 vm.createContext(context);vm.runInContext(code+'\nglobalThis.fixtureInit=initApprovalReceipt;',context);
 const control=context.fixtureInit({api,getSession:()=>({authenticated:true,csrfToken:'synthetic-csrf'}),getToken:()=>'o'.repeat(43),onPayment:value=>updates.push(value)});
 const value={...item,...(options.full?{deposit:100000}:{}),...(options.cancelled?{status:'cancelled'}:{})};
 return {nodes,calls,updates,control,value,async render(){control.render(value);await flush();},async confirm(){nodes['approval-payment-confirm'].checked=true;nodes['approval-payment-confirm'].listeners.change();await nodes['approval-payment-record'].listeners.click();await flush();}};
}
test('pending booking offers neither receipt nor settlement and performs no receipt request',async()=>{
 const f=fixture();f.control.render({...item,status:'pending'});await flush();assert.equal(f.calls.length,0);assert(f.nodes['approval-receipt-send'].hidden);assert(f.nodes['approval-payment-controls'].hidden);
});
test('DP receipt is optional and WhatsApp message contains only the customer link and current balance',async()=>{
 const f=fixture();await f.render();const link=f.nodes['approval-receipt-send'];assert.equal(link.hidden,false);const message=new URL(link.href).searchParams.get('text');assert(message.includes('Belum Lunas'));assert(message.includes('/receipt#r='));assert(!message.includes('/book/approve'));assert.equal(f.calls.length,1);assert(f.nodes['approval-payment-record'].disabled);assert.equal(f.updates[0].amountDue,70000);
});
test('marking paid requires an explicit checkbox and updates the same receipt link without sending WhatsApp',async()=>{
 const f=fixture();await f.render();const before=f.nodes['approval-receipt-send'].href;await f.nodes['approval-payment-record'].listeners.click();assert.equal(f.calls.filter(x=>x.path.endsWith('/settle')).length,0);
 await f.confirm();const mutation=f.calls.find(x=>x.path.endsWith('/settle'));assert.equal(mutation.body.expectedAmount,70000);assert.equal(mutation.body.confirmed,true);assert.equal(mutation.request.headers['X-CSRF-Token'],'synthetic-csrf');assert.equal(f.updates.at(-1).amountDue,0);assert(f.nodes['approval-payment-controls'].hidden);
 const oldReceipt=new URL(before).searchParams.get('text').match(/https:\/\/synthetic\.example\/receipt\S+/)[0];assert(new URL(f.nodes['approval-receipt-send'].href).searchParams.get('text').includes(oldReceipt));
});
test('full payment exposes the optional Lunas receipt without another settlement action',async()=>{
 const f=fixture({full:true});await f.render();assert(f.nodes['approval-payment-controls'].hidden);assert(new URL(f.nodes['approval-receipt-send'].href).searchParams.get('text').includes('Lunas'));assert.equal(f.calls.filter(x=>x.path.endsWith('/settle')).length,0);
});
test('cancelled booking requires payment verification before preparing its optional receipt',async()=>{
 const f=fixture({cancelled:true});await f.render();assert.equal(f.calls.length,0);assert(f.nodes['approval-receipt-send'].hidden);await f.confirm();assert.equal(f.calls[0].body.confirmPayment,true);const message=new URL(f.nodes['approval-receipt-send'].href).searchParams.get('text');assert(message.includes('Booking dibatalkan'));assert(!message.includes('sisa'));assert(f.nodes['approval-payment-controls'].hidden);
});
test('an uncertain settlement never automatically repeats; reload reads the current payment state',async()=>{
 const f=fixture({uncertain:true});await f.render();await f.confirm();assert.equal(f.calls.filter(x=>x.path.endsWith('/settle')).length,1);assert(f.nodes['approval-receipt-send'].hidden);assert.equal(f.nodes['approval-receipt-retry'].hidden,false);await f.nodes['approval-receipt-retry'].listeners.click();await flush();assert.equal(f.updates.at(-1).amountDue,0);assert.equal(f.calls.filter(x=>x.path.endsWith('/settle')).length,1);
});
test('wrong customer number cannot create a receipt send link and clearing removes private actions',async()=>{
 const f=fixture({wrongPhone:true});await f.render();assert(f.nodes['approval-receipt-send'].hidden);f.control.clear();assert.equal(f.nodes['approval-receipt-send'].href,undefined);assert(f.nodes['approval-payment-controls'].hidden);
});
