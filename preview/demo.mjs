import '../custom_components/homeboard_tv/frontend/homeboard-tv-card.js?preview=0.5.0';
import {DEFAULT_CONFIG} from '../custom_components/homeboard_tv/frontend/model.mjs';
const card=document.querySelector('homeboard-tv-card');
card.demoMode=true;
// A fixed date makes preview prices reproducible and labels truthful.
card.demoNow='2026-10-22T18:42:00+02:00';
const state=(value,attributes={})=>({state:String(value),attributes});
const prices=[.42,.38,.32,.29,.34,.48,.72,.96,1.18,.98,.86,.71,.65,.63,.72,.94,1.22,1.48,1.36,1.09,.87,.69,.56,.48];
const raw=prices.flatMap((value,hour)=>Array.from({length:4},(_,q)=>({start:new Date(Date.parse('2026-10-22T00:00:00+02:00')+(hour*4+q)*900000).toISOString(),end:new Date(Date.parse('2026-10-22T00:00:00+02:00')+(hour*4+q+1)*900000).toISOString(),value:Math.round((value+Math.sin(q*2+hour)*.025)*1000)/1000})));
const states={
 'sensor.electricity_price':state(1.36,{raw_today:raw,unit_of_measurement:'SEK/kWh'}),
 'sensor.home_power':state(1840,{unit_of_measurement:'W'}),
 'sensor.living_temperature':state(21.6,{unit_of_measurement:'°C'}),
 'sensor.kitchen_temperature':state(21.3,{unit_of_measurement:'°C'}),
 'sensor.bedroom_temperature':state(20.8,{unit_of_measurement:'°C'}),
 'sensor.office_temperature':state(21.5,{unit_of_measurement:'°C'}),
 'media_player.demo_music':state('idle',{friendly_name:'Living room speakers · demo'}),
 'calendar.family':state('off',{friendly_name:'Family calendar'}),
 'weather.home':state('partlycloudy',{temperature:9,temperature_unit:'°C'}),
 'lock.front_door':state('locked',{friendly_name:'Front door'}),
 'lock.back_door':state('locked',{friendly_name:'Back door'}),
 'scene.evening':state('2026-10-22T16:20:00+00:00',{friendly_name:'Evening'}),
 'scene.movie':state('unknown'), 'scene.bright':state('unknown'),'scene.goodnight':state('unknown'),
 'binary_sensor.evening_active':state('on'),
 'switch.living_room_auto_dashboard':state('on',{status:'dashboard visible'}),
 'switch.lg_auto_dashboard':state('off',{status:'disabled'}),
};
const config={...DEFAULT_CONFIG,music_assistant:{url:'https://music.example/#/home',player_entity:'media_player.demo_music',playlists:[{name:'Evening favourites',media_id:'library://playlist/demo-evening',url:'https://music.example/#/playlists/demo-evening'},{name:'Weekend mornings',media_id:'library://playlist/demo-weekend',url:'https://music.example/#/playlists/demo-weekend'},{name:'Dinner together',media_id:'library://playlist/demo-dinner',url:'https://music.example/#/playlists/demo-dinner'}]},edge_to_edge:true,home_name:'Our home',weather_location:'Stockholm',
 price_entity:'sensor.electricity_price',power_entity:'sensor.home_power',calendar_entity:'calendar.family',
 temperature_entities:['sensor.living_temperature','sensor.kitchen_temperature','sensor.bedroom_temperature','sensor.office_temperature'],weather_entity:'weather.home',lock_entities:['lock.front_door','lock.back_door'],
 scenes:[{entity:'scene.evening',name:'Evening',icon:'sun',active_entity:'binary_sensor.evening_active'},{entity:'scene.movie',name:'Movie night',icon:'tv'},{entity:'scene.bright',name:'Bright & focused',icon:'bolt'},{entity:'scene.goodnight',name:'Good night',icon:'moon'}],
 tvs:[{name:'Living room · Google TV',entry_id:'demo-google',auto_entity:'switch.living_room_auto_dashboard'},{name:'Bedroom · LG TV',entry_id:'demo-lg',auto_entity:'switch.lg_auto_dashboard',launch_apps:false}]
};
try { card.setConfig(JSON.parse(localStorage.getItem('homeboard-demo-config')) || config); }
catch { card.setConfig(config); }
const hass={states,connected:true,async callApi(method,path){
 if(method!=='GET' || !path.startsWith('calendars/calendar.family?')) throw new Error('Demo calendar not available');
 return [
  {summary:'Dinner with friends',start:{dateTime:'2026-10-22T19:00:00+02:00'},end:{dateTime:'2026-10-22T21:00:00+02:00'},location:'At home'},
  {summary:'Autumn break',start:{date:'2026-10-23'},end:{date:'2026-10-24'}},
  {summary:'Swimming',start:{dateTime:'2026-10-24T10:00:00+02:00'},end:{dateTime:'2026-10-24T11:00:00+02:00'}}
 ];
},connection:{async subscribeMessage(callback){
 callback({forecast:Array.from({length:5},(_,i)=>({datetime:`2026-10-${22+i}T12:00:00+02:00`,condition:['partlycloudy','rainy','cloudy','sunny','partlycloudy'][i],temperature:[10,9,8,11,10][i],templow:[5,6,4,3,5][i]}))}); return ()=>{};
}},async callService(domain,service,data){
 if(domain==='scene') {
  states[data.entity_id]=state(new Date(card.demoNow).toISOString(),states[data.entity_id]?.attributes);
  // Match helpers are simulated explicitly; scenes have no built-in active flag.
  states['binary_sensor.evening_active']=state(data.entity_id==='scene.evening'?'on':'off');
 }
 if(domain==='switch') states[data.entity_id]=state(service==='turn_on'?'on':'off',states[data.entity_id]?.attributes);
 card.hass={...hass,states:{...states}};
}};
card.hass=hass;
