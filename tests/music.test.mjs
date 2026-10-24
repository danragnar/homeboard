import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_CONFIG,musicURL,validateMusic} from '../custom_components/homeboard_tv/frontend/model.mjs';
globalThis.HTMLElement=class {};
globalThis.customElements={define(){}};
globalThis.window={};
globalThis.document={activeElement:null,body:{}};
const {HomeboardTVCard}=await import('../custom_components/homeboard_tv/frontend/homeboard-tv-card.js');
function fixture() {
 const calls=[];
 const card=Object.create(HomeboardTVCard.prototype);
 Object.assign(card,{_config:{...DEFAULT_CONFIG,music_assistant:{url:'/music-assistant',player_entity:'media_player.ma_living_room',playlists:[{name:'Evening',media_id:'library://playlist/42',url:'https://music.example/#/playlists/42'}]},tvs:[{name:'Living room',entry_id:'tv-entry',music_assistant_url:'https://music.example/#/home?player=Livingroom'}]},_selectedTV:0,_busy:false,render(){},shadowRoot:{activeElement:null},_hass:{states:{'media_player.ma_living_room':{state:'idle',attributes:{friendly_name:'Living room speakers'}}},async callService(...args){calls.push(args);}}});
 return {card,calls};
}
const click=(card,action,index='0')=>card.onClick({target:{closest(){return {dataset:{action,index},getAttribute(){return null;}};}}});
test('Music config is optional, rejects executable/ambiguous URLs and validates playlists',()=>{
 validateMusic(DEFAULT_CONFIG);
 for(const url of ['javascript:alert(1)','data:text/html,test','//evil.test','/\\evil.test',' /panel','https://user:pass@music.test/','/panel\n']) assert.equal(musicURL(url),false,url);
 for(const url of ['/music-assistant','https://music.test/#/playlists?player=Living%20room','http://192.0.2.1:8095/']) assert.equal(musicURL(url),true,url);
 assert.equal(musicURL('/panel',true),false);
 for(const music_assistant of [[],true,{playlists:{}},{player_entity:'switch.tv'},{playlists:[{name:'No destination'}]},{playlists:[{name:'Bad',media_id:42}]},{url:'javascript:alert(1)'}]) assert.throws(()=>validateMusic({...DEFAULT_CONFIG,music_assistant}));
 assert.throws(()=>validateMusic({...DEFAULT_CONFIG,tvs:[{music_assistant_url:'/panel'}]}));
});
test('Playlist Play sends only the intended Music Assistant player and URI',async()=>{
 const {card,calls}=fixture();await click(card,'music-play');
 assert.deepEqual(calls,[['music_assistant','play_media',{entity_id:'media_player.ma_living_room',media_id:'library://playlist/42',media_type:'playlist',enqueue:'replace'}]]);
 assert.match(card._notice,/Playlist playback requested/);assert.equal(card._busy,false);
});
test('Unavailable player blocks playback and failure remains visible',async()=>{
 const {card,calls}=fixture();card._hass.states['media_player.ma_living_room'].state='unavailable';
 assert.match(card.musicPanel(),/disabled/);await click(card,'music-play');assert.equal(calls.length,0);assert.match(card._notice,/unavailable/);
 card._hass.states['media_player.ma_living_room'].state='idle';card._hass.callService=async()=>{throw Error('Integration missing');};
 await click(card,'music-play');assert.match(card._notice,/Integration missing/);assert.equal(card._busy,false);
});
test('Links open the chosen view without starting playback or launching TV',async()=>{
 const {card,calls}=fixture();const urls=[];card.openMusicURL=url=>urls.push(url);
 await click(card,'music-open');await click(card,'music-playlist');
 assert.deepEqual(urls,['/music-assistant','https://music.example/#/playlists/42']);assert.deepEqual(calls,[]);
});
test('Open on TV uses the configured entry and browser URL; disabled TVs hide it',async()=>{
 const {card,calls}=fixture();await click(card,'music-tv');
 assert.deepEqual(calls,[['homeboard_tv','launch_app',{entry_id:'tv-entry',activity:'https://music.example/#/home?player=Livingroom'}]]);
 card._config.tvs[0].launch_apps=false;assert.doesNotMatch(card.musicPanel(),/data-action="music-tv"/);
});
test('Playlist names are escaped and link-only playlists work without a player',()=>{
 const {card}=fixture();card._config.music_assistant={url:'/panel',playlists:[{name:'<img src=x>',url:'/panel#/playlist'}]};
 const html=card.musicPanel();assert.match(html,/&lt;img/);assert.doesNotMatch(html,/<img|data-action="music-play"/);assert.match(html,/data-action="music-playlist"/);
 card._config.music_assistant=null;assert.equal(card.musicPanel(),'');
});
test('Demo links never navigate; local HA paths use HA routing and remote URLs load in browser',()=>{
 const {card}=fixture();card.demoMode=true;card.openMusicURL('https://music.example');assert.match(card._notice,/simulated/);
 card.demoMode=false;const events=[],assigned=[],paths=[];
 globalThis.history={pushState(...args){paths.push(args);}};
 globalThis.CustomEvent=class {constructor(type,options){this.type=type;this.detail=options.detail;}};
 window.dispatchEvent=e=>events.push(e);window.location={assign:url=>assigned.push(url)};
 card.openMusicURL('/music-assistant');assert.equal(paths[0][2],'/music-assistant');assert.equal(events[0].type,'location-changed');
 card.openMusicURL('https://music.example/#/home');assert.deepEqual(assigned,['https://music.example/#/home']);
});
