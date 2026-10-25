import test from 'node:test';
import assert from 'node:assert/strict';
import {finite,temperatureMean,priceIntervals,priceSummary,priceBand,lockSummary,sceneStatus,dressingAdvice,esc} from '../custom_components/homeboard_tv/frontend/model.mjs';
const s=(state,unit='°C')=>({state,attributes:{unit_of_measurement:unit}});
test('Missing values remain missing; zero remains valid',()=>{
 for(const input of [null,undefined,'',' ','unknown','unavailable',Infinity]) assert.equal(finite(input),null);
 assert.equal(finite('0'),0);
});
test('Mean excludes unavailable and incompatible sensors, converts Fahrenheit',()=>{
 const result=temperatureMean({a:s('20'),b:s('68','°F'),c:s('unavailable'),d:s('40','%')},['a','b','c','d']);
 assert.deepEqual(result,{value:20,count:2,total:4});
 assert.equal(temperatureMean({},[]).value,null);
});
test('Quarter-hour prices preserve negative and zero values, units and dates',()=>{
 const raw=[{start:'2026-10-22T08:00:00+02:00',end:'2026-10-22T08:15:00+02:00',price:-120},{start:'2026-10-22T08:15:00+02:00',end:'2026-10-22T08:30:00+02:00',price:0},{start:'2026-10-23T08:00:00+02:00',end:'2026-10-23T08:15:00+02:00',price:200}];
 const rows=priceIntervals(raw,{price_value_key:'price',price_factor:.001},new Date('2026-10-22T12:00:00+02:00'));
 assert.equal(rows.length,2); assert.equal(rows[0].value,-.12); assert.equal(rows[1].value,0);
 const result=priceSummary(rows,new Date('2026-10-22T08:15:00+02:00'));
 assert.equal(result.current.value,0); assert.equal(result.average,-.06);
});
test('DST spring and autumn days are not truncated to 24 hours',()=>{
 for(const [date,start,count] of [['2026-03-29','2026-03-29T00:00:00+01:00',92],['2026-10-25','2026-10-25T00:00:00+02:00',100]]) {
  const begin=Date.parse(start);
  const raw=Array.from({length:count},(_,i)=>({start:new Date(begin+i*900000).toISOString(),end:new Date(begin+(i+1)*900000).toISOString(),value:i}));
  const rows=priceIntervals(raw,{},new Date(date+'T12:00:00+02:00'));
  assert.equal(rows.length,count);
 }
});
test('Unequal interval lengths use a weighted average',()=>{
 const rows=[{start:new Date(0),end:new Date(900000),value:1},{start:new Date(900000),end:new Date(3600000),value:3}];
 assert.equal(priceSummary(rows).average,2.5);
});
test('Invalid, overlapping, un-timestamped and prior-day data are ignored',()=>{
 const raw=[1,null,{start:'bad',end:'bad',value:1},{start:'2026-10-22T08:00:00Z',end:'2026-10-22T09:00:00Z',value:1},{start:'2026-10-22T08:30:00Z',end:'2026-10-22T09:30:00Z',value:2}];
 assert.equal(priceIntervals(raw,{},new Date('2026-10-22T12:00:00Z')).length,1);
 assert.equal(priceBand(1,[{value:1},{value:1}]),'neutral');
});
test('Missing locks never produce an all-secured result',()=>{
 assert.equal(lockSummary({},[]).secured,false);
 assert.equal(lockSummary({},['lock.front']).secured,false);
 assert.equal(lockSummary({'lock.front':s('locked')},['lock.front']).secured,true);
});
test('Scenes only claim active when an explicit tracking helper is on',()=>{
 const states={'scene.a':s('2026-10-22T12:00:00Z'),'binary_sensor.a':s('off')};
 assert.match(sceneStatus(states,{entity:'scene.a'}),/^Last used/);
 assert.equal(sceneStatus(states,{entity:'scene.a',active_entity:'binary_sensor.a'}),'Inactive');
 assert.equal(sceneStatus(states,{entity:'scene.a',active_entity:'binary_sensor.missing'}),'Status unavailable');
});
test('Entity names are escaped before rendering',()=>assert.equal(esc('<img src=x onerror="x">'), '&lt;img src=x onerror=&quot;x&quot;&gt;'));
test('Dressing advice is child-friendly and prioritises wet weather',()=>{
 assert.deepEqual(dressingAdvice(20,'sunny').items,['T-shirt eller tunn tröja','Lätta kläder','Keps i stark sol']);
 assert.deepEqual(dressingAdvice(8,'rainy').items,['Regnjacka','Stövlar eller vattentäta skor','Jacka eller tjock tröja','Långbyxor']);
 assert.match(dressingAdvice(-7,'snowy').headline,/Blött/);
 assert.equal(dressingAdvice(null).headline,'Kolla vädret först');
});

test('Calendar events preserve all-day dates, exclude ended events and sort/limit upcoming items',async()=>{
 const {calendarEvents}=await import('../custom_components/homeboard_tv/frontend/model.mjs');
 const now=new Date('2026-10-24T23:30:00-07:00');
 const config={time_zone:'America/Los_Angeles',calendar_days:7,calendar_max_events:3};
 const rows=calendarEvents([
  {summary:'Tomorrow',start:{date:'2026-10-25'},end:{date:'2026-10-26'}},
  {summary:'Ended',start:{date:'2026-10-23'},end:{date:'2026-10-24'}},
  {summary:'Today',start:{date:'2026-10-24'},end:{date:'2026-10-25'}},
  {summary:'Ongoing',start:{dateTime:'2026-10-24T23:00:00-07:00'},end:{dateTime:'2026-10-25T00:30:00-07:00'}},
  {summary:'Later',start:'2026-10-26T09:00:00-07:00',end:'2026-10-26T10:00:00-07:00'},
  {summary:'Outside',start:{date:'2026-11-12'},end:{date:'2026-11-13'}},
  null,{}, {start:'bad',end:'bad'}, {start:{date:'2026-02-30'},end:{date:'2026-03-02'}}
 ],config,now);
 assert.deepEqual(rows.map(r=>r.summary),['Today','Ongoing','Tomorrow']);
 assert.equal(rows[0].start,'2026-10-24');assert.equal(rows[0].allDay,true);
 assert.equal(rows[1].allDay,false);
 assert.deepEqual(calendarEvents(null,config,now),[]);
});
test('Timed calendar events handle DST offsets and exclusive end boundaries',async()=>{
 const {calendarEvents}=await import('../custom_components/homeboard_tv/frontend/model.mjs');
 const rows=calendarEvents([
  {summary:'Second',start:{dateTime:'2026-10-25T02:30:00+01:00'},end:{dateTime:'2026-10-25T03:00:00+01:00'}},
  {summary:'First',start:{dateTime:'2026-10-25T02:30:00+02:00'},end:{dateTime:'2026-10-25T03:00:00+01:00'}},
  {summary:'Ended',start:'2026-10-25T01:00:00+02:00',end:'2026-10-25T02:00:00+02:00'},
  {start:'2026-10-25T10:00:00Z',end:'2026-10-25T09:00:00Z'}
 ],{},new Date('2026-10-25T02:00:00+02:00'));
 assert.deepEqual(rows.map(r=>r.summary),['First','Second']);
});

test('Dressing advice converts Fahrenheit and rejects unavailable observations',()=>{
 assert.deepEqual(dressingAdvice(32,'cloudy','°F'),dressingAdvice(0,'cloudy'));
 assert.deepEqual(dressingAdvice(68,'sunny','°F'),dressingAdvice(20,'sunny'));
 for(const value of [null,undefined,'','unknown','unavailable']) assert.equal(dressingAdvice(value,'rainy').headline,'Kolla vädret först');
 for(const state of ['unavailable','unknown']) assert.equal(dressingAdvice(9,state).headline,'Kolla vädret först');
 assert.equal(dressingAdvice(9,'cloudy','K').headline,'Kolla vädret först');
});
test('Wet winter advice preserves warm layers, hats and mittens',()=>{
 for(const temperature of [-7,0]) {
  const advice=dressingAdvice(temperature,'snowy-rainy');
  assert.match(advice.items.join(' '),/mössa och vantar/i);
  assert.match(advice.items.join(' '),/Vinteroverall|Varm jacka/);
  assert.ok(advice.items.includes('Varma vattentäta stövlar'));
 }
});
