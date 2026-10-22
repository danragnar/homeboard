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
export const DEFAULT_CONFIG = {
  type:"custom:homeboard-tv-card", title:"A little more at home.", home_name:"Our home",
  tv_mode:true, time_zone:"Europe/Stockholm", locale:"en-GB", temperature_unit:"°C", price_unit:"SEK/kWh",
  price_entity:"", price_attribute:"raw_today", price_value_key:"value", price_start_key:"start", price_end_key:"end",
  price_factor:1, price_offset:0, power_entity:"", temperature_entities:[], weather_entity:"", forecast_type:"daily",
  lock_entities:[], scenes:[], tvs:[], apps:[
    {name:"Netflix", activity:"netflix://", color:"#e50914"},
    {name:"SVT Play", activity:"https://www.svtplay.se", color:"#54cf87"},
    {name:"TV4 Play", activity:"https://www.tv4play.se", color:"#ed3a45"}
  ]
};
