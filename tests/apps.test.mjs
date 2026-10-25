import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_CONFIG,shortcutTarget,appLaunchMethod,validateShortcuts,shortcutSetupHint} from '../custom_components/homeboard_tv/frontend/model.mjs';
globalThis.HTMLElement=class {};
globalThis.customElements={define(){}};
globalThis.window={};
globalThis.document={activeElement:null,body:{}};
const {HomeboardTVCard}=await import('../custom_components/homeboard_tv/frontend/homeboard-tv-card.js');
const media={type:'app',app_id:'verified.app',content_id:'episode:42',params:{autoplay:true}};
function fixture() {
 const calls=[],card=Object.create(HomeboardTVCard.prototype);
 Object.assign(card,{_config:{...DEFAULT_CONFIG,apps:[{name:'Episode',activity:'https://media.example/42',targets:{webostv:media}}],tvs:[{name:'Android',entry_id:'android'},{name:'LG',entry_id:'lg',auto_entity:'switch.lg'}]},_selectedTV:1,_busy:false,render(){},shadowRoot:{activeElement:null},_hass:{states:{'switch.lg':{state:'on',attributes:{app_launch_method:'webostv'}}},async callService(...args){calls.push(args);}}});
 return {card,calls};
}
const click=card=>card.onClick({target:{closest(){return {dataset:{action:'app',index:'0'},getAttribute(){return null;}};}}});
test('Legacy shortcuts stay Android-only; live integration method overrides card fallback',()=>{
 assert.deepEqual(shortcutTarget({activity:'netflix://'},'androidtv_remote'),{type:'activity',activity:'netflix://'});
 assert.equal(shortcutTarget({activity:'netflix://'},'webostv'),null);
 assert.equal(shortcutTarget({target:media},'androidtv_remote'),null);
 assert.equal(appLaunchMethod({app_launch_method:'webostv'}),'webostv');
 assert.equal(appLaunchMethod({app_launch_method:'androidtv_remote',auto_entity:'switch.lg'},{'switch.lg':{attributes:{app_launch_method:'webostv'}}}),'webostv');
});
test('Selected TV chooses native media target or legacy Android destination',async()=>{
 const {card,calls}=fixture();await click(card);
 assert.deepEqual(calls[0],['homeboard_tv','launch_app',{entry_id:'lg',target:media}]);
 card._selectedTV=0;await click(card);
 assert.deepEqual(calls[1],['homeboard_tv','launch_app',{entry_id:'android',target:{type:'activity',activity:'https://media.example/42'}}]);
});
test('TV-specific shortcuts override global list; empty list hides shortcuts',async()=>{
 const {card,calls}=fixture();const target={type:'script',entity_id:'script.lg_episode'};
 card.tv().apps=[{name:'Custom',target}];await click(card);
 assert.deepEqual(calls[0],['homeboard_tv','launch_app',{entry_id:'lg',target}]);
 card.tv().apps=[];assert.deepEqual(card.apps(),[]);
});
test('Missing platform target and disabled launching send no request',async()=>{
 const {card,calls}=fixture();card._config.apps=[{name:'Android only',activity:'netflix://'}];
 assert.equal(card.appTarget(card.apps()[0]),null);await click(card);
 assert.deepEqual(calls,[]);assert.match(card._notice,/Configure a shortcut target/);
 card.tv().launch_apps=false;await click(card);assert.deepEqual(calls,[]);
});
test('Config validates platform destinations, nested app params and script fallback',()=>{
 const {card}=fixture();validateShortcuts(card._config);
 for(const app of [{name:'Media',target:media},{name:'Script',target:{type:'script',entity_id:'script.movie'}},{name:'Page',target:{type:'url',url:'https://example.test'}}]) validateShortcuts({apps:[app]});
 for(const app of [{name:'Missing'}, {name:'Wrong',targets:{other:media}}, {name:'Wrong',targets:{androidtv_remote:media}},
   {name:'Bad URL',target:{type:'url',url:'javascript:alert(1)'}}, {name:'Wrong script',target:{type:'script',entity_id:'scene.movie'}},
   {name:'Bad params',target:{...media,params:[]}}, {name:'Typo',target:{...media,contentID:'42'}}]) assert.throws(()=>validateShortcuts({apps:[app]}));
 assert.throws(()=>validateShortcuts({tvs:[{apps:'bad'}]}));
});
test('Native source shortcuts select the configured TV and preserve source names',async()=>{
 const {card,calls}=fixture();const target={type:'source',source:'SVT Play'};
 card._config.apps=[{name:'SVT Play',target}];validateShortcuts(card._config);
 assert.equal(shortcutTarget({target},'androidtv_remote'),null);
 assert.deepEqual(shortcutTarget({target},'webostv'),target);
 await click(card);assert.deepEqual(calls,[['homeboard_tv','launch_app',{entry_id:'lg',target}]]);
 assert.throws(()=>validateShortcuts({apps:[{name:'Wrong',target:{type:'source',source:''}}]}));
 assert.throws(()=>validateShortcuts({apps:[{name:'Wrong',targets:{androidtv_remote:target}}]}));
});
test('Disabled shortcut hints distinguish unsupported Android activities from disabled app controls',()=>{
 const tv={app_launch_method:'webostv'},apps=[{name:'Netflix',activity:'Netflix'}];
 assert.match(shortcutSetupHint(tv,apps),/Choose an app/);
 assert.match(shortcutSetupHint({...tv,launch_apps:false},apps),/launch_apps/);
 assert.equal(shortcutSetupHint(tv,[{name:'Netflix',target:{type:'source',source:'Netflix'}}]),'');
 assert.equal(shortcutSetupHint(null,apps),'');
});
test('One generic app shortcut sends the same request for either selected TV',async()=>{
 const {card,calls}=fixture();card._config.apps=[{name:'Netflix',app:'netflix',icon:'tv',color:'#e50914'}];
 validateShortcuts(card._config);
 const visual={...card.apps()[0]};
 await click(card);card._selectedTV=0;await click(card);
 assert.deepEqual(calls,[['homeboard_tv','launch_app',{entry_id:'lg',app:'netflix'}],['homeboard_tv','launch_app',{entry_id:'android',app:'netflix'}]]);
 assert.deepEqual(card.apps()[0],visual);
});
test('Generic launch_id overrides work with or without an app and preserve per-TV overrides',async()=>{
 const {card,calls}=fixture();card._config.apps=[{name:'Video',app:'youtube',launch_id:'https://media.example/42'}];
 await click(card);assert.deepEqual(calls[0][2],{entry_id:'lg',app:'youtube',launch_id:'https://media.example/42'});
 card.tv().apps=[{name:'Custom',launch_id:'custom.webos.app',icon:'fire',color:'#e8743b'}];
 await click(card);assert.deepEqual(calls[1][2],{entry_id:'lg',launch_id:'custom.webos.app'});
 assert.equal(shortcutSetupHint(card.tv(),card.apps(),card._hass.states),'');
 for(const app of [{name:'Bad',app:''},{name:'Bad',launch_id:''},{name:'Bad',app:'unknown'}]) assert.throws(()=>validateShortcuts({apps:[app]}));
});
test('Shipped shortcuts use the generic configuration with the same labels, colours and fireplace icon',()=>{
 assert.deepEqual(DEFAULT_CONFIG.apps.map(({name,color,icon})=>({name,color,icon})),[
  {name:'Netflix',color:'#e50914',icon:undefined},{name:'SVT Play',color:'#54cf87',icon:undefined},
  {name:'TV4 Play',color:'#ed3a45',icon:undefined},{name:'Tänd brasa',color:'#e8743b',icon:'fire'}]);
 for(const app of DEFAULT_CONFIG.apps) {
  validateShortcuts({apps:[app]});
  for(const method of ['androidtv_remote','webostv']) assert.equal(shortcutTarget(app,method).type,'launch');
 }
});
