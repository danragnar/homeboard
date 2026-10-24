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
export function validateMusic(config) {
  const music = config.music_assistant;
  if (music !== undefined && music !== null) {
    if (typeof music !== 'object' || Array.isArray(music)) throw new Error('music_assistant must be an object');
    if (music.url && !musicURL(music.url)) throw new Error('music_assistant.url must be an HTTP(S) URL or Home Assistant path');
    if (music.player_entity && (typeof music.player_entity !== 'string' || !/^media_player\.[a-z0-9_]+$/.test(music.player_entity))) throw new Error('music_assistant.player_entity must be a media_player entity ID');
    if (music.playlists !== undefined && !Array.isArray(music.playlists)) throw new Error('music_assistant.playlists must be a list');
    for (const item of music.playlists || []) {
      if (!item || typeof item.name !== 'string' || !item.name.trim() || (!item.media_id && !item.url)) throw new Error('Each music playlist needs a name and media_id or url');
      if (item.media_id !== undefined && (typeof item.media_id !== 'string' || !item.media_id.trim())) throw new Error('Playlist media_id must be a nonempty string');
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
  price_factor:1, price_offset:0, power_entity:"", temperature_entities:[], weather_entity:"", forecast_type:"daily",
  music_assistant:null, calendar_entity:"", calendar_days:7, calendar_max_events:3, lock_entities:[], scenes:[], tvs:[], apps:[
    {name:"Netflix", activity:"netflix://", color:"#e50914"},
    {name:"SVT Play", activity:"https://www.svtplay.se", color:"#54cf87"},
    {name:"TV4 Play", activity:"https://www.tv4play.se", color:"#ed3a45"}
  ]
};
