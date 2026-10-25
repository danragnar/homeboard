import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_CONFIG} from '../custom_components/homeboard_tv/frontend/model.mjs';
globalThis.HTMLElement=class {};
globalThis.customElements={define(){}};
globalThis.window={};
globalThis.document={activeElement:null,body:{}};
const {HomeboardTVCard}=await import('../custom_components/homeboard_tv/frontend/homeboard-tv-card.js');
function fixture() {
 const calls=[];
 const card=Object.create(HomeboardTVCard.prototype);
 Object.assign(card,{_config:{...DEFAULT_CONFIG,tvs:[{name:'Living room',entry_id:'first'},{name:'Bedroom',entry_id:'second'}]},_selectedTV:1,_busy:false,render(){},shadowRoot:{activeElement:null},_hass:{async callService(...args){calls.push(args);}}});
 return {card,calls};
}
const click=(card,disabled=false)=>card.onClick({target:{closest(){return {disabled,dataset:{action:'home'},getAttribute(){return null;}};}}});
test('Home action targets the selected TV entry, never sends a power or Cast command',async()=>{
 const {card,calls}=fixture();await click(card);
 assert.deepEqual(calls,[['homeboard_tv','return_home',{entry_id:'second'}]]);
 assert.match(card._notice,/temporarily paused/);assert.equal(card._busy,false);
});
test('Disabled and busy Home controls dispatch nothing; failures are visible',async()=>{
 const {card,calls}=fixture();await click(card,true);card._busy=true;await click(card);assert.deepEqual(calls,[]);
 card._busy=false;card._hass.callService=async()=>{throw Error('Remote unavailable');};await click(card);assert.match(card._notice,/Remote unavailable/);assert.equal(card._busy,false);
});
test('Demo Home retains the simulated-action notice',async()=>{
 const {card}=fixture();card.demoMode=true;await click(card);assert.match(card._notice,/Demo action simulated/);
});
