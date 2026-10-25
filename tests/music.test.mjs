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
 assert.deepEqual(calls,[['homeboard_tv','launch_app',{entry_id:'tv-entry',launch_id:'https://music.example/#/home?player=Livingroom'}]]);
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

test('Native now playing needs only an entity; metadata is escaped and idle states clear stale tracks',async()=>{
 const {card}=fixture();card._config.music_assistant={player_entity:'media_player.ma_living_room'};card._config.tvs=[];
 const p=card._hass.states['media_player.ma_living_room'];p.state='playing';p.attributes={supported_features:16385,media_title:'<b>Track</b>',media_artist:'Artist & band',media_album_name:'Album',entity_picture:'javascript:alert(1)'};
 const html=card.musicPanel();assert.match(html,/&lt;b&gt;Track/);assert.match(html,/Artist &amp; band/);assert.match(html,/Album/);assert.doesNotMatch(html,/<img|data-action="music-(?:open|playlist|tv)"|iframe/);assert.match(html,/aria-label="Pause"/);
 p.state='idle';assert.match(card.musicPanel(),/Nothing playing/);assert.doesNotMatch(card.musicPanel(),/Artist &amp; band|&lt;b&gt;Track/);
 p.state='unavailable';assert.match(card.musicPanel(),/Player unavailable/);assert.doesNotMatch(card.musicPanel(),/data-action="music-control"/);
});
test('Transport controls use standard HA services on the configured Music Assistant entity',async()=>{
 const {card,calls}=fixture();const player=card._hass.states['media_player.ma_living_room'];
 player.state='playing';player.attributes={supported_features:17469,volume_level:.5,is_volume_muted:false};
 await click(card,'music-control','toggle');assert.equal(calls.at(-1)[1],'media_pause');
 player.state='paused';await click(card,'music-control','toggle');assert.equal(calls.at(-1)[1],'media_play');
 await click(card,'music-control','next');assert.equal(calls.at(-1)[1],'media_next_track');
 await click(card,'music-control','previous');assert.equal(calls.at(-1)[1],'media_previous_track');
 await click(card,'music-control','louder');assert.equal(calls.at(-1)[1],'volume_up');
 await click(card,'music-control','quieter');assert.equal(calls.at(-1)[1],'volume_down');
 await click(card,'music-control','mute');assert.deepEqual(calls.at(-1),['media_player','volume_mute',{entity_id:'media_player.ma_living_room',is_volume_muted:true}]);
 assert.ok(calls.every(([domain,,data])=>domain==='media_player' && data.entity_id==='media_player.ma_living_room'));
 player.attributes.supported_features=0;const count=calls.length;await click(card,'music-control','next');assert.equal(calls.length,count);assert.match(card._notice,/unavailable/);
});
test('Volume fallback respects capabilities and clamps levels; external state changes refresh now playing',async()=>{
 const {musicCommand}=await import('../custom_components/homeboard_tv/frontend/model.mjs');
 assert.deepEqual(musicCommand({state:'playing',attributes:{supported_features:4,volume_level:.99}},'louder'),{service:'volume_set',data:{volume_level:1}});
 assert.deepEqual(musicCommand({state:'playing',attributes:{supported_features:4,volume_level:.01}},'quieter'),{service:'volume_set',data:{volume_level:0}});
 assert.equal(musicCommand({state:'playing',attributes:{supported_features:4}},'louder'),null);
 const {card,calls}=fixture();let renders=0;card.render=()=>renders++;
 card.hass={...card._hass,states:{...card._hass.states,'media_player.ma_living_room':{state:'playing',attributes:{media_title:'Changed elsewhere'}}}};
 assert.equal(renders,1);assert.match(card.musicPanel(),/Changed elsewhere/);assert.equal(calls.length,0);
});

function favoritesFixture() {
 const {card,calls}=fixture();const requests=[];
 card.isConnected=true;card._hass.connection={};
 card._hass.callWS=async message=>{
  requests.push(message);
  if(message.type==='config/entity_registry/get') return {config_entry_id:'ma-entry'};
  return {response:{items:[{name:'Jazz <night>',uri:'library://playlist/7',image:'https://images.example/jazz.jpg',favorite:true},{name:'Morning',uri:'library://playlist/8',image:'javascript:bad',favorite:true}]}};
 };
 return {card,calls,requests};
}
test('Favorites load from the selected integration, render artwork and play their URI',async()=>{
 const {card,calls,requests}=favoritesFixture();
 await card.refreshMusicFavorites();
 assert.deepEqual(requests[0],{type:'config/entity_registry/get',entity_id:'media_player.ma_living_room'});
 assert.deepEqual(requests[1],{type:'call_service',domain:'music_assistant',service:'get_library',service_data:{config_entry_id:'ma-entry',media_type:'playlist',favorite:true,order_by:'name',limit:100,offset:0},return_response:true});
 assert.equal(calls.length,0);
 const html=card.musicPanel();assert.match(html,/Jazz &lt;night&gt;/);assert.match(html,/src="https:\/\/images.example\/jazz.jpg"/);assert.doesNotMatch(html,/javascript:bad/);
 await click(card,'music-play','1');assert.equal(calls[0][2].media_id,'library://playlist/7');
 await card.refreshMusicFavorites();assert.equal(requests.length,2,'cache suppresses repeated requests');
 await click(card,'music-refresh');assert.equal(requests.length,4);
});
test('Favorites paginate completely, respect display limits, and preserve manual shortcuts',async()=>{
 const {card,requests}=favoritesFixture();
 card._config.music_assistant.max_playlists=2;
 const original=card._hass.callWS;
 card._hass.callWS=async message=>{
  if(message.type!=='call_service') return original(message);
  requests.push(message);
  return {response:{items:Array.from({length:message.service_data.offset===0?100:3},(_,i)=>({uri:`library://playlist/${message.service_data.offset+i+100}`,name:`Playlist ${i}`,favorite:true}))}};
 };
 await card.refreshMusicFavorites();
 assert.deepEqual(requests.filter(m=>m.type==='call_service').map(m=>m.service_data.offset),[0,100]);
 assert.equal(card._musicFavorites.length,103);assert.equal(card.musicPlaylists().length,3);
 card._config.music_assistant.max_playlists=0;assert.equal(card.musicPlaylists().length,104);
 card._config.music_assistant.show_favorites=false;assert.equal(card.musicPlaylists().length,1);
 await card.refreshMusicFavorites();assert.equal(card._musicFavorites.length,0);
});
test('Favorite failures remain visible, retry works, and stale responses cannot replace a new player',async()=>{
 const {card}=favoritesFixture();
 card._hass.callWS=async()=>{throw Error('Service not found');};
 await card.refreshMusicFavorites();assert.match(card.musicPanel(),/Favorites unavailable/);assert.equal(card._musicPending,false);
 let resolveOld;card._config.music_assistant.config_entry_id='old';
 card._hass.callWS=()=>new Promise(resolve=>resolveOld=resolve);
 const old=card.refreshMusicFavorites(true);
 card._config.music_assistant={player_entity:'media_player.new',config_entry_id:'new'};
 card._hass.callWS=async()=>({response:{items:[{name:'New',uri:'library://playlist/new'}]}});
 await card.refreshMusicFavorites();
 resolveOld({response:{items:[{name:'Old',uri:'library://playlist/old'}]}});await old;
 assert.deepEqual(card._musicFavorites.map(item=>item.name),['New']);assert.equal(card._musicError,'');
});
test('Favorites never fetch in demo, when disabled or after disconnect; config rejects invalid limits and artwork',async()=>{
 for(const value of [-1,101,1.5,'6']) assert.throws(()=>validateMusic({...DEFAULT_CONFIG,music_assistant:{max_playlists:value}}));
 assert.throws(()=>validateMusic({...DEFAULT_CONFIG,music_assistant:{show_favorites:'yes'}}));
 assert.throws(()=>validateMusic({...DEFAULT_CONFIG,music_assistant:{playlists:[{name:'Unsafe',media_id:'x',image:'javascript:bad'}]}}));
 for(const mode of ['demo','disabled','disconnected']) {
  const {card,requests}=favoritesFixture();
  if(mode==='demo') card.demoMode=true;
  if(mode==='disabled') card._config.music_assistant.show_favorites=false;
  if(mode==='disconnected') card.isConnected=false;
  await card.refreshMusicFavorites();assert.equal(requests.length,0);
 }
});
