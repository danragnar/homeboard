import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_CONFIG,homeSensorIds,homeSensors} from '../custom_components/homeboard_tv/frontend/model.mjs';
globalThis.HTMLElement=class {};
globalThis.customElements={define(){}};
globalThis.window={};
const {HomeboardTVCard}=await import('../custom_components/homeboard_tv/frontend/homeboard-tv-card.js');
const entity=(state,attributes={})=>({state,attributes});
test('Home sensors merge legacy selections once and preserve selected order',()=>{
 assert.deepEqual(homeSensorIds({home_sensor_entities:['sensor.humidity','lock.front'],temperature_entities:['sensor.temp'],lock_entities:['lock.front','lock.back']}),['sensor.humidity','lock.front','sensor.temp','lock.back']);
});
test('Typed readings convert temperatures and retain other sensor units',()=>{
 const states={'sensor.temp':entity('68',{device_class:'temperature',unit_of_measurement:'°F',friendly_name:'Bedroom'}),'sensor.humidity':entity('46',{device_class:'humidity',unit_of_measurement:'%'}),'sensor.co2':entity('650',{device_class:'carbon_dioxide',unit_of_measurement:'ppm'}),'sensor.text':entity('very_good')};
 const items=homeSensors(states,{home_sensor_entities:Object.keys(states),temperature_unit:'°C'});
 assert.deepEqual(items.map(i=>[i.value,i.unit]),[['20.0','°C'],['46','%'],['650','ppm'],['Very good','']]);
 assert.equal(items[0].name,'Bedroom');assert.equal(items[0].icon,'temp');assert.equal(items[1].icon,'humidity');
 assert.equal(homeSensors(states,{home_sensor_entities:['sensor.temp'],temperature_unit:'°F'})[0].value,'68.0');
});
test('Locks and binary sensors distinguish normal, active and unavailable states',()=>{
 const states={'lock.front':entity('locked'),'lock.back':entity('unlocked'),'binary_sensor.window':entity('on',{device_class:'window'}),'binary_sensor.motion':entity('off',{device_class:'motion'}),'binary_sensor.smoke':entity('on',{device_class:'smoke'}),'binary_sensor.network':entity('on',{device_class:'connectivity'}),'sensor.offline':entity('unavailable',{unit_of_measurement:'%'}),'lock.unknown':entity('unknown')};
 const items=homeSensors(states,{home_sensor_entities:[...Object.keys(states),'sensor.missing']});
 assert.deepEqual(items.map(i=>[i.value,i.tone]),[['Locked','good'],['Unlocked','warn'],['Open','warn'],['Clear','good'],['Smoke detected','warn'],['Connected','good'],['Unavailable','muted'],['Unavailable','muted'],['Unavailable','muted']]);
 assert.equal(items[6].unit,'');
});
test('Unified sensor configuration rejects unsupported and malformed IDs',()=>{
 const card=Object.create(HomeboardTVCard.prototype);card.render=()=>{};card.setAttribute=()=>{};
 for(const home_sensor_entities of ['sensor.temp',[null],['switch.light'],['sensor.']]) assert.throws(()=>card.setConfig({home_sensor_entities}),/must be/);
 card.setConfig({home_sensor_entities:['sensor.temp','binary_sensor.window','lock.front']});assert.equal(card._config.home_sensor_entities.length,3);
});
test('Changes to selected home sensors trigger a live render',()=>{
 const card=Object.create(HomeboardTVCard.prototype);
 let renders=0;
 Object.assign(card,{_config:{...DEFAULT_CONFIG,home_sensor_entities:['sensor.humidity']},render(){renders++;}});
 const states={'sensor.humidity':entity('42')};
 card.hass={states,connected:true};
 card.hass={states:{...states,'sensor.other':entity('2')},connected:true};assert.equal(renders,1);
 card.hass={states:{...states,'sensor.humidity':entity('45')},connected:true};assert.equal(renders,2);
});
