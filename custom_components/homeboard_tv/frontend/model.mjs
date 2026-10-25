// Pure data adapters shared by the Home Assistant card and the local demo.
export const finite = value => value !== null && value !== undefined && String(value).trim() !== "" && Number.isFinite(Number(value)) ? Number(value) : null;
export const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
export function number(value, digits = 1, locale = "en-GB") {
  return finite(value) === null ? "—" : Number(value).toLocaleString(locale, {minimumFractionDigits: digits, maximumFractionDigits: digits});
}
export function temperatureMean(states, ids = [], unit = "°C") {
  const values = ids.map(id => states[id]).filter(Boolean).map(s => {
    let n = finite(s.state);
    const from = s.attributes?.unit_of_measurement;
    if (n === null || !["°C", "°F"].includes(from)) return null;
    if (from !== unit) n = unit === "°C" ? (n - 32) * 5/9 : n * 9/5 + 32;
    return n;
  }).filter(n => n !== null);
  return {value: values.length ? values.reduce((a,b) => a+b, 0)/values.length : null, count: values.length, total: ids.length};
}
// A small, intentionally conservative guide for getting children ready to go out.
// It uses the current weather observation rather than a forecast, so the advice
// changes as soon as the configured weather entity does.
export function dressingAdvice(temperature, condition = '') {
  const value = finite(temperature), weather = String(condition).toLowerCase();
  if (value === null) return {headline:'Kolla vädret först', items:['Välj kläder efter hur det känns ute'], icon:'cloud'};
  const snowy = /snow|sleet|hail|freezing/.test(weather);
  const wet = snowy || /rain|pour|lightning/.test(weather);
  let headline, items, icon;
  if (value <= -5) {
    headline = 'Riktigt kallt ute'; items = ['Vinteroverall', 'Varm mössa och vantar', 'Varma stövlar']; icon = 'snow';
  } else if (value <= 3) {
    headline = 'Kallt ute'; items = ['Varm jacka', 'Mössa och vantar', 'Rejäla skor']; icon = snowy ? 'snow' : 'jacket';
  } else if (value <= 10) {
    headline = 'Svalt ute'; items = ['Jacka eller tjock tröja', 'Långbyxor', 'Skor som tål lek']; icon = 'jacket';
  } else if (value <= 17) {
    headline = 'Lagom ute'; items = ['Tunn jacka eller tröja', 'Långa byxor', 'Vanliga skor']; icon = 'shirt';
  } else {
    headline = 'Varmt ute'; items = ['T-shirt eller tunn tröja', 'Lätta kläder', 'Keps i stark sol']; icon = 'sun';
  }
  if (wet) {
    items = ['Regnjacka', snowy ? 'Varma vattentäta stövlar' : 'Stövlar eller vattentäta skor', ...items.slice(0,1)];
    headline = snowy ? 'Blött och vinterväder' : 'Regnigt ute'; icon = snowy ? 'snow' : 'rain';
  }
  return {headline, items, icon};
}
// Legacy selections stay visible alongside the unified entity list, without duplicates.
export function homeSensorIds(config = {}) {
  return [...new Set([...(config.home_sensor_entities || []), ...(config.temperature_entities || []), ...(config.lock_entities || [])])];
}
export function homeSensors(states, config = {}) {
  return homeSensorIds(config).map(id => {
    const entity = states[id], a = entity?.attributes || {}, state = entity?.state;
    const domain = id.split('.')[0], kind = a.device_class || '';
    const unavailable = !state || ['unknown','unavailable'].includes(state);
    const label = value => String(value).replaceAll('_',' ').replace(/^./, c => c.toUpperCase());
    let type = domain === 'lock' ? 'lock' : kind === 'temperature' || ['°C','°F'].includes(a.unit_of_measurement) ? 'temperature' : kind || domain;
    let icon = ({temperature:'temp',humidity:'humidity',moisture:'humidity',door:'door',window:'door',opening:'door',motion:'motion',occupancy:'motion',presence:'motion',battery:'battery',power:'bolt',energy:'bolt',lock:'lock'})[type] || 'sensor';
    let value = unavailable ? 'Unavailable' : label(state), unit = '', tone = unavailable ? 'muted' : 'normal';
    if (!unavailable && domain === 'lock') tone = state === 'locked' ? 'good' : 'warn';
    else if (!unavailable && domain === 'binary_sensor') {
      const labels = ({door:['Closed','Open'],window:['Closed','Open'],opening:['Closed','Open'],motion:['Clear','Motion'],occupancy:['Clear','Occupied'],presence:['Away','Home'],moisture:['Dry','Wet'],smoke:['Clear','Smoke detected'],gas:['Clear','Gas detected'],safety:['Safe','Unsafe'],battery:['Normal','Low'],connectivity:['Disconnected','Connected'],problem:['Clear','Problem'],lock:['Locked','Unlocked']})[kind] || ['Off','On'];
      value = ['on','off'].includes(state) ? labels[state === 'on' ? 1 : 0] : label(state);
      if (['on','off'].includes(state)) tone = ['connectivity','presence','occupancy'].includes(kind) ? (state === 'on' ? 'good' : 'normal') : state === 'on' ? 'warn' : 'good';
    } else if (!unavailable && domain === 'sensor') {
      const numeric = finite(state);
      if (numeric !== null) {
        unit = a.unit_of_measurement || '';
        let reading = numeric;
        if (type === 'temperature' && ['°C','°F'].includes(unit)) {
          const converted = temperatureMean(states,[id],config.temperature_unit || '°C');
          reading = converted.value; unit = config.temperature_unit || '°C';
        }
        value = number(reading, type === 'temperature' ? 1 : Number.isInteger(reading) ? 0 : 1, config.locale || 'en-GB');
      }
    }
    return {id, name:a.friendly_name || id, type, icon, value, unit, tone};
  });
}
export function zonedDate(date, timeZone) {
  return new Intl.DateTimeFormat("en-CA", {timeZone, year:"numeric", month:"2-digit", day:"2-digit"}).format(date);
}
export function priceIntervals(raw, config = {}, now = new Date()) {
  if (!Array.isArray(raw)) return [];
  const zone = config.time_zone || "Europe/Stockholm";
  const factor = finite(config.price_factor) ?? 1;
  const offset = finite(config.price_offset) ?? 0;
  // Explicit timestamped intervals support quarter-hour data and 23/25-hour days.
  return raw.map(row => {
    if (!row || typeof row !== "object") return null;
    const start = new Date(row[config.price_start_key || "start"]);
    const end = new Date(row[config.price_end_key || "end"]);
    const value = finite(row[config.price_value_key || "value"]);
    if (!Number.isFinite(+start) || !Number.isFinite(+end) || end <= start || value === null) return null;
    if (zonedDate(start, zone) !== zonedDate(now, zone)) return null;
    return {start, end, value: value * factor + offset};
  }).filter(Boolean).sort((a,b) => a.start-b.start).filter((row,i,all) => i === 0 || row.start >= all[i-1].end);
}
export function priceSummary(rows, now = new Date()) {
  if (!rows.length) return {current:null, low:null, high:null, average:null};
  const low = rows.reduce((a,b) => b.value < a.value ? b : a);
  const high = rows.reduce((a,b) => b.value > a.value ? b : a);
  const duration = rows.reduce((s,r) => s + (r.end-r.start), 0);
  return {current: rows.find(r => r.start <= now && r.end > now) || null, low, high,
    average: rows.reduce((s,r) => s+r.value*(r.end-r.start), 0)/duration};
}
export function priceBand(value, rows) {
  if (!rows.length || finite(value) === null) return "neutral";
  const sorted = rows.map(r => r.value).sort((a,b) => a-b);
  if (sorted[0] === sorted.at(-1)) return "neutral";
  if (value <= sorted[Math.floor((sorted.length-1)*.25)]) return "low";
  if (value >= sorted[Math.ceil((sorted.length-1)*.75)]) return "high";
  return "normal";
}
export function lockSummary(states, ids = []) {
  const items = ids.map(id => ({id, state:states[id]?.state || "unavailable", name:states[id]?.attributes?.friendly_name || id}));
  return {items, secured:items.length > 0 && items.every(i => i.state === "locked"), unknown:items.filter(i => ["unavailable","unknown"].includes(i.state)).length};
}
export function sceneStatus(states, scene, config = {}) {
  if (scene.active_entity) {
    const state = states[scene.active_entity]?.state;
    return state === "on" ? "Active" : [undefined,"unknown","unavailable"].includes(state) ? "Status unavailable" : "Inactive";
  }
  const value = states[scene.entity]?.state;
  if (!value || ["unknown","unavailable"].includes(value)) return "Not tracked";
  return Number.isFinite(Date.parse(value)) ? "Last used " + new Date(value).toLocaleTimeString(config.locale || "en-GB", {hour:"2-digit",minute:"2-digit",timeZone:config.time_zone || "Europe/Stockholm"}) : "Ready";
}
// HA REST calendars use {date} for all-day events and {dateTime} for timed ones.
// Keep date-only values as calendar dates: UTC conversion shifts them in some zones.
export function calendarEvents(raw, config = {}, now = new Date()) {
  if (!Array.isArray(raw)) return [];
  const today = zonedDate(now, config.time_zone || "Europe/Stockholm");
  const until = new Date(+now + (config.calendar_days || 7) * 86400000);
  const lastDay = zonedDate(until, config.time_zone || "Europe/Stockholm");
  const dateOnly = value => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value;
  return raw.flatMap(event => {
    if (!event || typeof event !== "object") return [];
    const start = event.start?.dateTime ?? event.start?.date ?? event.start;
    const end = event.end?.dateTime ?? event.end?.date ?? event.end;
    const allDay = dateOnly(start) && dateOnly(end);
    if (!allDay && [start,end].some(value => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value))) return [];
    if (allDay ? end <= start || end <= today || start > lastDay :
      typeof start !== "string" || typeof end !== "string" || dateOnly(start) || dateOnly(end) ||
      !Number.isFinite(Date.parse(start)) || !Number.isFinite(Date.parse(end)) ||
      Date.parse(end) <= Date.parse(start) || Date.parse(end) <= +now || Date.parse(start) >= +until) return [];
    return [{summary:String(event.summary || "Untitled event"), location:String(event.location || ""), start, end, allDay}];
  }).sort((a,b) => {
    const day = event => event.allDay ? event.start : zonedDate(new Date(event.start), config.time_zone || "Europe/Stockholm");
    return day(a).localeCompare(day(b)) || Number(b.allDay)-Number(a.allDay) || Date.parse(a.start)-Date.parse(b.start);
  }).slice(0, config.calendar_max_events || 3);
}
// Accept HA sidebar paths or ordinary web URLs, never executable URL schemes.
export function musicURL(value, absolute = false) {
  if (typeof value !== 'string' || !value || value.trim() !== value || /[\\\s]/.test(value)) return false;
  if (!absolute && /^\/(?!\/)/.test(value)) return true;
  try {
    const url = new URL(value);
    return ['http:','https:'].includes(url.protocol) && Boolean(url.hostname) && !url.username && !url.password;
  } catch { return false; }
}
// HA MediaPlayerEntityFeature values; controls follow each player's capabilities.
export function musicCommand(player, control) {
  if (!player || ['unknown','unavailable'].includes(player.state)) return null;
  const a = player.attributes || {}, features = Number(a.supported_features) || 0;
  const has = bit => Boolean(features & bit);
  if (control === 'toggle') {
    const pause = ['playing','buffering'].includes(player.state);
    return has(pause ? 1 : 16384) ? {service:pause?'media_pause':'media_play',data:{}} : null;
  }
  if (control === 'previous' || control === 'next') return has(control === 'previous'?16:32) ? {service:control === 'previous'?'media_previous_track':'media_next_track',data:{}} : null;
  if (control === 'mute') return has(8) && typeof a.is_volume_muted === 'boolean' ? {service:'volume_mute',data:{is_volume_muted:!a.is_volume_muted}} : null;
  if (control === 'quieter' || control === 'louder') {
    if (has(1024)) return {service:control === 'louder'?'volume_up':'volume_down',data:{}};
    const volume = finite(a.volume_level);
    if (has(4) && volume !== null) return {service:'volume_set',data:{volume_level:Math.max(0,Math.min(1,volume+(control === 'louder'?.05:-.05)))}};
  }
  return null;
}
export function musicNowPlaying(player) {
  const available = Boolean(player && !['unknown','unavailable'].includes(player.state));
  const active = available && ['playing','paused','buffering'].includes(player.state);
  const a = player?.attributes || {};
  return {available, active, status:!available?'Unavailable':({playing:'Playing',paused:'Paused',buffering:'Buffering'})[player.state] || 'Idle',
    title:!available?'Player unavailable':active?String(a.media_title || 'Track information unavailable'):'Nothing playing',
    artist:active?String(a.media_artist || ''):'',album:active?String(a.media_album_name || ''):'',
    artwork:active && musicURL(a.entity_picture)?a.entity_picture:'',
    volume:available && finite(a.volume_level)!==null?Math.round(Math.max(0,Math.min(1,Number(a.volume_level)))*100):null};
}
export function validateMusic(config) {
  const music = config.music_assistant;
  if (music !== undefined && music !== null) {
    if (typeof music !== 'object' || Array.isArray(music)) throw new Error('music_assistant must be an object');
    if (music.url && !musicURL(music.url)) throw new Error('music_assistant.url must be an HTTP(S) URL or Home Assistant path');
    if (music.player_entity && (typeof music.player_entity !== 'string' || !/^media_player\.[a-z0-9_]+$/.test(music.player_entity))) throw new Error('music_assistant.player_entity must be a media_player entity ID');
    if (music.show_favorites !== undefined && typeof music.show_favorites !== 'boolean') throw new Error('music_assistant.show_favorites must be a boolean');
    if (music.max_playlists !== undefined && (!Number.isInteger(music.max_playlists) || music.max_playlists < 0 || music.max_playlists > 100)) throw new Error('music_assistant.max_playlists must be an integer from 0 to 100 (0 shows all)');
    if (music.config_entry_id !== undefined && (typeof music.config_entry_id !== 'string' || !music.config_entry_id.trim())) throw new Error('music_assistant.config_entry_id must be a nonempty string');
    if (music.playlists !== undefined && !Array.isArray(music.playlists)) throw new Error('music_assistant.playlists must be a list');
    for (const item of music.playlists || []) {
      if (!item || typeof item.name !== 'string' || !item.name.trim() || (!item.media_id && !item.url)) throw new Error('Each music playlist needs a name and media_id or url');
      if (item.media_id !== undefined && (typeof item.media_id !== 'string' || !item.media_id.trim())) throw new Error('Playlist media_id must be a nonempty string');
      if (item.image && !musicURL(item.image)) throw new Error('Playlist image must be an HTTP(S) URL or Home Assistant path');
      if (item.url && !musicURL(item.url)) throw new Error('Playlist url must be an HTTP(S) URL or Home Assistant path');
    }
  }
  for (const tv of config.tvs || []) {
    if (tv.music_assistant_url && !musicURL(tv.music_assistant_url, true)) throw new Error('TV music_assistant_url must be a full HTTP(S) URL');
  }
}
export const DEFAULT_CONFIG = {
  type:"custom:homeboard-tv-card", title:"A little more at home.", home_name:"Our home",
  tv_mode:true, theme:"aurora", edge_to_edge:false, keyboard_navigation:true, time_zone:"Europe/Stockholm", locale:"en-GB", temperature_unit:"°C", price_unit:"SEK/kWh",
  price_entity:"", price_attribute:"raw_today", price_value_key:"value", price_start_key:"start", price_end_key:"end",
  price_factor:1, price_offset:0, power_entity:"", home_sensor_entities:[], temperature_entities:[], weather_entity:"", forecast_type:"daily",
  music_assistant:null, calendar_entity:"", calendar_days:7, calendar_max_events:3, lock_entities:[], scenes:[], tvs:[], apps:[
    {name:"Netflix", activity:"netflix://", color:"#e50914"},
    {name:"SVT Play", activity:"https://www.svtplay.se", color:"#54cf87"},
    {name:"TV4 Play", activity:"https://www.tv4play.se", color:"#ed3a45"}
  ]
};
