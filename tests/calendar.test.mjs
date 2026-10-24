import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.HTMLElement=class {};
globalThis.customElements={define(){}};
globalThis.window={};
const {HomeboardTVCard}=await import('../custom_components/homeboard_tv/frontend/homeboard-tv-card.js');
const {DEFAULT_CONFIG}=await import('../custom_components/homeboard_tv/frontend/model.mjs');
function fixture(callApi=async()=>[]) {
 const card=Object.create(HomeboardTVCard.prototype);
 Object.assign(card,{_config:{...DEFAULT_CONFIG,calendar_entity:'calendar.family'},_calendarGeneration:0,_calendarEvents:[],isConnected:true,_hass:{connected:true,connection:{},callApi},render(){this.renders=(this.renders||0)+1;},demoNow:'2026-10-24T12:00:00+02:00'});
 return card;
}
test('Calendar uses authenticated read API with bounded date range and caches polling',async()=>{
 const requests=[];
 const card=fixture(async(...args)=>{requests.push(args);return [{summary:'Test'}];});
 await card.refreshCalendar();await card.refreshCalendar();
 assert.equal(requests.length,1);assert.equal(requests[0][0],'GET');
 const url=new URL(requests[0][1],'https://ha.invalid/');
 assert.equal(url.pathname,'/calendars/calendar.family');
 assert.equal(url.searchParams.get('start'),'2026-10-24T10:00:00.000Z');
 assert.equal(url.searchParams.get('end'),'2026-10-31T10:00:00.000Z');
 card._calendarFetched=Date.now()-300001;await card.refreshCalendar();
 assert.equal(requests.length,2);
 await card.refreshCalendar(true);assert.equal(requests.length,3);
});
test('Calendar selection races cannot overwrite the newly selected calendar',async()=>{
 let resolve;
 const card=fixture(()=>new Promise(r=>resolve=r));
 const old=card.refreshCalendar();
 card._config={...card._config,calendar_entity:'calendar.work'};
 card._hass.callApi=async()=>[{summary:'New'}];
 await card.refreshCalendar();resolve([{summary:'Old'}]);await old;
 assert.equal(card._calendarEvents[0].summary,'New');
 card._config.calendar_entity='';await card.refreshCalendar();
 assert.deepEqual(card._calendarEvents,[]);
});
test('Calendar clears stale events on errors and reconnects without waiting for poll',async()=>{
 const card=fixture(async()=>[{summary:'Old'}]);await card.refreshCalendar();
 card._hass.callApi=async()=>{throw Error('Failure');};await card.refreshCalendar(true);
 assert.deepEqual(card._calendarEvents,[]);assert.match(card._calendarError,/unavailable/);
 card._hass={...card._hass,connection:{},callApi:async()=>[{summary:'Recovered'}]};
 await card.refreshCalendar();assert.equal(card._calendarEvents[0].summary,'Recovered');
 assert.equal(card._calendarError,'');
});
test('Detached calendars ignore pending responses',async()=>{
 let resolve;const card=fixture(()=>new Promise(r=>resolve=r));
 const request=card.refreshCalendar();card.isConnected=false;card._calendarGeneration++;
 resolve([{summary:'Late'}]);await request;assert.deepEqual(card._calendarEvents,[]);
});
test('State updates during a pending request queue one fresh fetch',async()=>{
 let resolve, calls=0;
 const card=fixture(()=>{calls++;return calls===1?new Promise(r=>resolve=r):Promise.resolve([{summary:'Latest'}]);});
 const request=card.refreshCalendar();await card.refreshCalendar(true);await card.refreshCalendar(true);
 assert.equal(calls,1);resolve([]);await request;await Promise.resolve();
 assert.equal(calls,2);assert.equal(card._calendarEvents[0].summary,'Latest');
});
test('All-day display uses the calendar date even across time zones',()=>{
 const card=fixture();card._config.time_zone='America/Los_Angeles';
 assert.match(card.calendarWhen({start:'2026-10-25',end:'2026-10-26',allDay:true}),/^Sun,? 25 Oct · All day$/);
});
