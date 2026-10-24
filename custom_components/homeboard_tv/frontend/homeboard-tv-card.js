import {DEFAULT_CONFIG, esc, finite, number, temperatureMean, priceIntervals, priceSummary, priceBand, lockSummary, sceneStatus, zonedDate} from './model.mjs';
import {navigationKey, directionalTarget} from './navigation.mjs';
import {patchHTML} from './dom.mjs';
import {styles} from './styles.mjs';

const paths = {
 home:'M3 10 12 3l9 7M5 9v12h14V9M9 21v-7h6v7',
 bolt:'m13 2-9 12h7l-1 8 10-12h-7l1-8',
 power:'M12 2v10M6 5a9 9 0 1 0 12 0',
 temp:'M9 14.5V5a3 3 0 0 1 6 0v9.5a5 5 0 1 1-6 0ZM12 8v9',
 sun:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5',
 cloud:'M6 18a4 4 0 1 1 1-7.9A6 6 0 0 1 19 12a3 3 0 1 1 0 6Z',
 rain:'M6 15a4 4 0 1 1 1-7.9A6 6 0 0 1 19 9a3 3 0 1 1 0 6M8 18l-1 3m6-3-1 3m6-3-1 3',
 lock:'M6 10h12v11H6ZM8 10V6a4 4 0 0 1 8 0v4M12 14v3',
 shield:'m12 2 9 4v6c0 5-9 10-9 10S3 17 3 12V6ZM8 12l3 3 5-6',
 scene:'m12 3 2.8 5.7L21 9.8l-4.5 4.4 1 6.3-5.5-3-5.5 3 1-6.3L3 9.8l6.2-1.1Z',
 moon:'M20 15A9 9 0 0 1 9 4a9 9 0 1 0 11 11Z',
 settings:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M9 3l-1 3-3 1-2 3 2 2-1 3 3 3 3-1 2 2 3-1 1-3 3-1 2-3-2-2 1-3-3-3-3 1-2-2Z',
 tv:'M3 6h18v14H3ZM8 2l4 4 4-4',
 cast:'M3 3h18v18h-7M3 21v-1m0-4a5 5 0 0 1 5 5M3 11a10 10 0 0 1 10 10',
 arrow:'m9 5 7 7-7 7',
 close:'m6 6 12 12M6 18 18 6',
};
const icon = (name, size = 18) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name] || paths.scene}"/></svg>`;
const weatherIcon = condition => /rain|pour|lightning/.test(condition) ? 'rain' : /sun|clear/.test(condition) ? 'sun' : 'cloud';

export class HomeboardTVCard extends HTMLElement {
  constructor() {
    super(); this.attachShadow({mode:'open'}); this._config = {...DEFAULT_CONFIG};
    this._forecast = []; this._weatherGeneration = 0; this._selectedTV = 0; this._busy = false; this._notice = '';
    this._onResize = () => this.scheduleFit();
    this._onKey = event => this.navigate(event);
    this._onKeyUp = event => {
      const key = navigationKey(event);
      if (this._activationKey === key) { this._activationKey = null; event.preventDefault(); event.stopPropagation(); }
    };
    this.shadowRoot.addEventListener('pointerdown', () => this.removeAttribute('remote-navigation'));
    this._resizeObserver = new ResizeObserver(entries => {
      const width = entries[0]?.contentRect.width;
      if (width !== this._lastWidth) { this._lastWidth = width; this.scheduleFit(); }
    });
    this.shadowRoot.addEventListener('click', e => this.onClick(e));
    this.shadowRoot.addEventListener('change', e => {
      if (e.target.matches('[data-tv]')) { this._selectedTV = Number(e.target.value); this.render(); }
    });
    this.shadowRoot.addEventListener('keydown', e => {
      if (e.key === 'Escape' && this._drawer) { this._drawer = false; this.render(); this.shadowRoot.querySelector('[data-action="settings"]')?.focus(); e.preventDefault(); e.stopPropagation(); }
      if (e.key === 'Tab' && this._drawer) {
        const els = [...this.shadowRoot.querySelectorAll('.drawer button, .drawer input, .drawer textarea')].filter(el => !el.disabled);
        const first = els[0], last = els.at(-1);
        if (e.shiftKey && this.shadowRoot.activeElement === first) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && this.shadowRoot.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    });
  }
  static getConfigElement() { return document.createElement('homeboard-tv-editor'); }
  static getStubConfig() { return {...DEFAULT_CONFIG}; }
  setConfig(config) {
    for (const key of ['temperature_entities','lock_entities','scenes','tvs','apps']) {
      if (config[key] !== undefined && !Array.isArray(config[key])) throw new Error(`${key} must be a list`);
    }
    const next = {...DEFAULT_CONFIG, ...config};
    new Intl.DateTimeFormat(next.locale, {timeZone:next.time_zone}).format();
    if (!['°C','°F'].includes(next.temperature_unit)) throw new Error('temperature_unit must be °C or °F');
    for (const tv of next.tvs) if (!tv || !tv.name || !tv.entry_id) throw new Error('Each TV needs a name and entry_id');
    for (const scene of next.scenes) if (!scene || !scene.entity?.startsWith('scene.')) throw new Error('Each scene needs a scene.entity_id in entity');
    for (const app of next.apps) if (!app || !app.name || !app.activity) throw new Error('Each app needs name and activity');
    if (!['aurora','forest'].includes(next.theme)) throw new Error('theme must be aurora or forest');
    this._config = next;
    this.setAttribute('theme', next.theme);
    this._selectedTV = Math.min(this._selectedTV, Math.max(0,next.tvs.length-1));
    if (this._hass && this.isConnected) this.subscribeWeather();
    this.render();
  }
  set hass(hass) {
    const previous = this._hass; this._hass = hass;
    if (this.isConnected && (!previous || previous.connection !== hass.connection)) this.subscribeWeather();
    const ids = new Set([this._config.price_entity,this._config.power_entity,this._config.weather_entity,
      ...this._config.temperature_entities,...this._config.lock_entities,
      ...this._config.scenes.flatMap(scene => [scene.entity,scene.active_entity]),
      ...this._config.tvs.map(tv => tv.auto_entity)].filter(Boolean));
    if (!this._drawer && (!previous || previous.connected !== hass.connected || [...ids].some(id => previous.states?.[id] !== hass.states?.[id]))) this.render();
  }
  getCardSize() { return 12; }
  getGridOptions() { return {columns:'full', rows:'auto'}; }
  scheduleFit() {
    cancelAnimationFrame(this._fitFrame);
    this._fitFrame = requestAnimationFrame(() => this.fitTV());
  }
  fitTV() {
    const card = this.shadowRoot.querySelector('ha-card'), shell = this.shadowRoot.querySelector('.shell');
    if (!card || !shell) return;
    // Keep the HA editor accessible; full-screen display is opt-in and escapable.
    let editing = false;
    for (let node = this; node; node = node.parentElement || node.getRootNode()?.host) {
      if (['HUI-CARD-EDIT-MODE','HUI-DIALOG-EDIT-CARD','HA-DIALOG'].includes(node.tagName)) editing = true;
    }
    this.syncEdgeToEdge(Boolean(this._config.tv_mode && this._config.edge_to_edge && !this._exitFullscreen && !editing));
    const landscape = this._config.tv_mode && this.getBoundingClientRect().width >= 740 && innerWidth / innerHeight >= 1.4;
    this.toggleAttribute('tv-landscape', landscape);
    shell.style.transform = ''; shell.style.width = ''; shell.style.maxWidth = ''; shell.style.margin = '';
    card.style.height = ''; card.style.minHeight = '';
    // Fit the complete dashboard inside the actual space below HA's own header.
    // Keep natural scrolling on phones and narrow desktop panels.
    if (!landscape) return;
    const available = innerHeight - Math.max(0, this.getBoundingClientRect().top) - (this.hasAttribute('edge-to-edge') ? 0 : 14);
    if (available < 300) return;
    const width = card.clientWidth;
    if (!width) return;
    shell.style.maxWidth = 'none'; shell.style.margin = '0';
    shell.style.width = '100%';
    let scale = 1;
    // Compensate the layout width before scaling so a short screen does not
    // turn the dashboard into a narrow island in the middle of a wide TV.
    for (let pass = 0; pass < 4; pass++) {
      const natural = shell.offsetHeight;
      if (!natural) return;
      const next = Math.min(scale, available / natural);
      if (Math.abs(next - scale) < .001) break;
      scale = next;
      shell.style.width = `${100 / scale}%`;
    }
    shell.style.transform = `scale(${scale})`;
    shell.style.transformOrigin = 'top left';
    card.style.minHeight = '0'; card.style.height = `${Math.ceil(shell.offsetHeight * scale)}px`;
  }
  syncEdgeToEdge(enabled) {
    this.toggleAttribute('edge-to-edge', enabled);
    // A normal fixed element can be trapped in HA's stacking/clipping contexts.
    // A manual popover promotes this same card above the application chrome,
    // without moving it out of Lovelace or requiring browser fullscreen access.
    if (enabled && this.isConnected && typeof this.showPopover === 'function') {
      if (this.hasAttribute('popover') && !this._edgePopover) return;
      try {
        this._edgePopover = true;
        this.setAttribute('popover', 'manual');
        if (!this.matches(':popover-open')) this.showPopover();
      } catch {
        // Older TV engines retain the fixed-position fallback. Never leave the
        // card with a closed popover attribute: UA styles would hide it entirely.
        this.removeAttribute('popover'); this._edgePopover = false;
      }
    } else if (this._edgePopover) {
      try { if (this.matches(':popover-open')) this.hidePopover(); } catch { /* Detached during navigation. */ }
      this.removeAttribute('popover'); this._edgePopover = false;
    }
  }
  connectedCallback() {
    this._resizeObserver.observe(this);
    window.addEventListener('resize', this._onResize);
    window.addEventListener('keydown', this._onKey, true);
    window.addEventListener('keyup', this._onKeyUp, true);
    this._timer = setInterval(() => { if (!this._drawer) this.render(); }, 30000);
    if (this._hass) this.subscribeWeather();
    this.render();
  }
  disconnectedCallback() {
    this.syncEdgeToEdge(false);
    this._resizeObserver.disconnect(); window.removeEventListener('resize', this._onResize);
    window.removeEventListener('keydown', this._onKey, true);
    window.removeEventListener('keyup', this._onKeyUp, true);
    cancelAnimationFrame(this._fitFrame);
    clearInterval(this._timer); this._weatherGeneration++;
    this._weatherUnsub?.(); this._weatherUnsub = null; this._weatherKey = null;
  }
  remoteControls() {
    const scope = this._drawer ? this.shadowRoot.querySelector('.drawer') : this.shadowRoot;
    return [...(scope?.querySelectorAll('button:not(:disabled),select:not(:disabled),input:not(:disabled),textarea:not(:disabled)') || [])]
      .filter(el => !el.hidden && el.getBoundingClientRect().width && el.getBoundingClientRect().height);
  }
  navigate(event) {
    if (!this._config.tv_mode) return;
    const path = event.composedPath(), key = navigationKey(event);
    const owned = path.includes(this);
    // Capture before HA's global handlers, but leave unrelated dialogs/inputs alone.
    if (!owned && path.some(el => el.tagName && ['INPUT','TEXTAREA','SELECT','HA-DIALOG','DIALOG'].includes(el.tagName))) return;
    if (!owned && !this.hasAttribute('edge-to-edge') && !['BODY','HTML'].includes(event.target?.tagName)) return;
    const active = this.shadowRoot.activeElement;
    const editing = active && ['INPUT','TEXTAREA'].includes(active.tagName);
    if (key === 'Escape') {
      if (this._drawer) { this._drawer=false; this.render(); this.shadowRoot.querySelector('[data-action="settings"]')?.focus(); }
      else if (this.hasAttribute('edge-to-edge')) { this._exitFullscreen=true; this.render(); }
      else return;
      event.preventDefault(); event.stopPropagation(); return;
    }
    if (!this._config.keyboard_navigation || editing) return;
    const arrow = ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(key);
    const activate = key === 'Enter' || key === ' ';
    if (!arrow && !activate && key !== 'Tab') return;
    // Keep native select's up/down and opening behavior; left/right always leave it.
    if (active?.tagName === 'SELECT' && !['ArrowLeft','ArrowRight','Tab'].includes(key)) return;
    const controls = this.remoteControls();
    if (!controls.length) return;
    if (key === 'Tab') {
      if (!this.hasAttribute('edge-to-edge') && !this._drawer) return;
      const index = controls.indexOf(active), step = event.shiftKey ? -1 : 1;
      controls[(index+step+controls.length)%controls.length]?.focus({preventScroll:this.hasAttribute('tv-landscape')});
    } else {
      event.preventDefault(); event.stopPropagation();
      this.setAttribute('remote-navigation','');
      if (event.repeat && Date.now()-(this._lastRemoteMove || 0) < 150) return;
      if (activate) {
        if (event.repeat) return;
        this._activationKey = key;
      }
      const hasFocus = controls.includes(active);
      if (!hasFocus) {
        const first = controls.find(el => el.classList?.contains('scene')) || controls.find(el => el.classList?.contains('app')) || controls[0];
        first.focus({preventScroll:this.hasAttribute('tv-landscape')});
      } else if (activate) {
        if (active.getAttribute('aria-disabled') !== 'true') active.click();
      } else {
        const target = directionalTarget(active.getBoundingClientRect(),controls.filter(el => el !== active).map(el => ({el,box:el.getBoundingClientRect()})),key);
        target?.focus({preventScroll:this.hasAttribute('tv-landscape')}); this._lastRemoteMove=Date.now();
      }
    }
    event.preventDefault(); event.stopPropagation();
  }
  async subscribeWeather() {
    const {weather_entity:entity, forecast_type:type} = this._config;
    const key = `${entity}/${type}`;
    if (this._weatherKey === key && this._weatherConnection === this._hass?.connection) return;
    this._weatherUnsub?.(); this._weatherUnsub = null; this._forecast = []; this._weatherError = '';
    this._weatherKey = key; this._weatherConnection = this._hass?.connection;
    const generation = ++this._weatherGeneration;
    if (!entity || !this._hass?.connection) return;
    try {
      const unsubscribe = await this._hass.connection.subscribeMessage(message => {
        if (generation !== this._weatherGeneration) return;
        this._forecast = message.forecast || []; if (!this._drawer) this.render();
      }, {type:'weather/subscribe_forecast', entity_id:entity, forecast_type:type});
      if (generation !== this._weatherGeneration || !this.isConnected) unsubscribe();
      else this._weatherUnsub = unsubscribe;
    } catch (error) {
      if (generation !== this._weatherGeneration) return;
      this._weatherError = error.message || 'Forecast unavailable'; this.render();
    }
  }
  get now() { return this.demoNow ? new Date(this.demoNow) : new Date(); }
  time(date, options = {}) { return date ? new Date(date).toLocaleTimeString(this._config.locale, {timeZone:this._config.time_zone,hour:'2-digit',minute:'2-digit',...options}) : '—'; }
  fmt(value,digits=1) { return number(value,digits,this._config.locale); }
  tv() { return this._config.tvs[this._selectedTV]; }
  renderChart(rows, summary) {
    if (!rows.length) return '<div class="empty">Connect a price sensor with timestamped intervals.<br>Hourly and 15-minute prices are supported.</div>';
    const left=28, width=670, height=112, top=12;
    const min=Math.min(0,...rows.map(r=>r.value)), max=Math.max(0,...rows.map(r=>r.value)), range=max-min||1;
    const start=+rows[0].start, end=+rows.at(-1).end;
    const x = time => left + (time-start)/(end-start)*width;
    const y = value => top + height - (value-min)/range*height;
    const zero=y(0);
    const guides=[min,(min+max)/2,max].map(n => `<line x1="${left}" x2="${left+width}" y1="${y(n)}" y2="${y(n)}" stroke="#ffffff0d"/><text x="${left-7}" y="${y(n)+3}" text-anchor="end">${this.fmt(n,1)}</text>`).join('');
    const bars=rows.map(r => {
      const band=priceBand(r.value,rows), current=r===summary.current;
      const color=current?'#f3f5e9':band==='low'?'#c7e7a5':band==='high'?'#e5b36d':'#6e8b75';
      const w=Math.max(.5,x(+r.end)-x(+r.start)-1.5);
      return `<rect x="${x(+r.start)}" y="${Math.min(zero,y(r.value))}" width="${w}" height="${Math.max(1,Math.abs(y(r.value)-zero))}" rx="1.5" fill="${color}"><title>${esc(this.time(r.start))}–${esc(this.time(r.end))}: ${esc(this.fmt(r.value,3))} ${esc(this._config.price_unit)}</title></rect>`;
    }).join('');
    const indices=[0,Math.floor(rows.length*.25),Math.floor(rows.length*.5),Math.floor(rows.length*.75),rows.length-1];
    const labels=indices.map((i,j)=>`<text x="${x(j===4 ? +rows[i].end : +rows[i].start)}" y="149" text-anchor="${j===0?'start':j===4?'end':'middle'}">${esc(this.time(j===4 ? rows[i].end : rows[i].start))}</text>`).join('');
    return `<svg viewBox="0 0 710 159" preserveAspectRatio="none" role="img" aria-label="Today's electricity price. Lowest ${esc(this.fmt(summary.low.value,3))} at ${esc(this.time(summary.low.start))}; highest ${esc(this.fmt(summary.high.value,3))} at ${esc(this.time(summary.high.start))} ${esc(this._config.price_unit)}">${guides}${bars}${labels}</svg>`;
  }
  render() {
    if (!this.shadowRoot || this._drawer) return;
    const focus = this.shadowRoot.activeElement;
    const focusAction = focus?.dataset?.action, focusIndex=focus?.dataset?.index;
    const focusTV=focus?.hasAttribute?.('data-tv');
    const c=this._config, states=this._hass?.states || {}, now=this.now;
    const priceState=states[c.price_entity];
    const rawPrices=priceState?.attributes?.[c.price_attribute], priceDay=zonedDate(now,c.time_zone);
    if (!this._priceCache || this._priceCache.raw !== rawPrices || this._priceCache.config !== c || this._priceCache.day !== priceDay) {
      this._priceCache={raw:rawPrices,config:c,day:priceDay,rows:priceIntervals(rawPrices,c,now)};
    }
    const rows=this._priceCache.rows;
    const summary=priceSummary(rows,now);
    const current=summary.current?.value ?? (finite(priceState?.state) === null ? null : finite(priceState.state)*(finite(c.current_price_factor)??1)+(finite(c.price_offset)??0));
    const band=priceBand(current,rows);
    const power=states[c.power_entity], powerValue=finite(power?.state), powerUnit=power?.attributes?.unit_of_measurement || 'W';
    const showKW=powerUnit==='W' && powerValue!==null && Math.abs(powerValue)>=1000;
    const temp=temperatureMean(states,c.temperature_entities,c.temperature_unit);
    const weather=states[c.weather_entity];
    const locks=lockSummary(states,c.lock_entities);
    const tv=this.tv(), auto=tv?.auto_entity ? states[tv.auto_entity] : null;
    const period=(row,high=false)=>`<div class="period"><div><div class="period-label">${high?'↗ Highest':'↘ Lowest'}</div><div class="period-time">${row?`${esc(this.time(row.start))}–${esc(this.time(row.end))}`:'—'}</div></div><div class="period-price ${high?'high':''}">${this.fmt(row?.value,3)}<small>${esc(c.price_unit)}</small></div></div>`;
    const date=now.toLocaleDateString(c.locale,{timeZone:c.time_zone,weekday:'long',day:'numeric',month:'long'});
    const forecast=this._forecast.filter(item=> {
      if(c.forecast_type==='hourly') return Date.parse(item.datetime)>=+now;
      return Date.parse(item.datetime) >= +now-86400000;
    }).slice(0,5);
    patchHTML(this.shadowRoot,`<style>${styles}</style><ha-card data-homeboard-fit><div class="shell" data-homeboard-fit>
      <header class="topbar"><div class="brand">${icon('home',25)} homeboard<span>${esc(c.home_name)}</span></div><div class="meta"><span>HOME, IN BALANCE</span>${this.demoMode?'<span class="pill amber">Demo · sample data</span>':''}<button class="icon-button" data-action="settings" aria-label="Dashboard settings">${icon('settings',17)}</button></div></header>
      <section class="heading"><div><div class="eyebrow">YOUR EVERYDAY, AT A GLANCE</div><h1 class="greeting">${esc(c.title)}</h1><p class="subheading">${esc(c.subtitle || 'A comfortable home. A clearer picture.')}</p></div><div class="clock">${esc(this.time(now))}<small>${esc(date)}</small></div></section>
      ${this._notice?`<div class="notice" role="status">${esc(this._notice)}<button data-action="dismiss" aria-label="Dismiss notification">×</button></div>`:''}
      <main class="grid">
        <section class="card energy"><div class="card-head"><span class="card-title">${icon('bolt')} Today's electricity</span><span class="pill ${band==='high'?'high':band==='neutral'?'neutral':''}"><i class="dot"></i>${band==='low'?'Lower price':band==='high'?'Higher price':band==='neutral'?'Price overview':'Typical price'}</span></div>
          <div class="price-value">${this.fmt(current,3)}<span class="unit">${esc(c.price_unit)}</span></div><div class="energy-description">${rows.length?`Today's time-weighted average ${this.fmt(summary.average,3)} ${esc(c.price_unit)} · ${rows.length} intervals`:'No interval data · configure the price source in the card editor'}</div>
          <div class="chart">${this.renderChart(rows,summary)}</div><div class="legend"><span><i></i>Lower quarter</span><span><i class="expensive"></i>Upper quarter</span><span><i class="now"></i>Now</span></div><div class="periods">${period(summary.low)}${period(summary.high,true)}</div>
        </section>
        <section class="card metric"><div class="card-head"><span class="card-title">${icon('power')} Power right now</span><span class="reduced">LIVE</span></div><div class="stat-line"><div class="stat-number">${this.fmt(showKW?powerValue/1000:powerValue,showKW?2:powerUnit==='W'?0:2)}<span class="unit">${esc(showKW?'kW':powerUnit)}</span></div><div class="mini-icon">${icon('bolt',24)}</div></div><div class="metric-note">${powerValue===null?'Choose an instantaneous power sensor':'Current household consumption'}</div></section>
        <section class="card metric"><div class="card-head"><span class="card-title">${icon('temp')} Inside, on average</span></div><div class="stat-line"><div class="stat-number">${this.fmt(temp.value)}<span class="unit">${esc(c.temperature_unit)}</span></div><div class="mini-icon">${icon('home',24)}</div></div><div class="metric-note">${temp.count} of ${temp.total} temperature sensors reporting</div><div class="temperature-strip">${Array.from({length:Math.max(1,temp.total)},(_,i)=>`<i class="${i<temp.count?'filled':''}"></i>`).join('')}</div></section>
        <section class="card weather"><div class="card-head"><span class="card-title">${icon('sun')} A look outside</span><span class="reduced">${esc(c.weather_location || c.home_name)}</span></div><div class="forecast-current"><div><div class="weather-temp">${this.fmt(weather?.attributes?.temperature,0)}<span class="unit">${esc(weather?.attributes?.temperature_unit||c.temperature_unit)}</span></div><div class="condition">${esc((weather?.state === 'partlycloudy' ? 'Partly cloudy' : (weather?.state || 'Weather not configured').replaceAll('-',' ')))}</div></div><div class="weather-symbol">${icon(weatherIcon(weather?.state || ''),48)}</div></div>
          <div class="forecast">${forecast.length?forecast.map(f=>`<div class="forecast-day">${esc(c.forecast_type==='hourly'?this.time(f.datetime):new Date(f.datetime).toLocaleDateString(c.locale,{timeZone:c.time_zone,weekday:'short'}))}${icon(weatherIcon(f.condition||''),20)}<strong>${this.fmt(f.temperature,0)}°</strong>${f.templow!==undefined?`<small>${this.fmt(f.templow,0)}°</small>`:''}</div>`).join(''):`<div class="empty" style="grid-column:1/-1;padding:0">${esc(this._weatherError || 'Choose a weather entity for the forecast.')}</div>`}</div>
        </section>
        <section class="card security"><div class="card-head"><span class="card-title">${icon('lock')} Peace of mind</span><span class="pill ${locks.secured?'':'amber'}">${locks.items.length?`${locks.items.filter(i=>i.state==='locked').length}/${locks.items.length} secured`:'Not configured'}</span></div><div class="security-title">${icon('shield',31)}<div><strong>${locks.secured?'All doors secured':!locks.items.length?'Add your doors':locks.unknown?'Check door status':'A door needs attention'}</strong><small>Live lock status · view only</small></div></div>${locks.items.length?locks.items.map(lock=>`<div class="lock-row"><span>${esc(lock.name)}</span><span class="lock-state ${lock.state==='locked'?'':'warn'}">${icon('lock',12)}${esc(lock.state.charAt(0).toUpperCase()+lock.state.slice(1))}</span></div>`).join(''):'<div class="empty">Select your lock entities in the card editor.</div>'}</section>
        <section class="card scenes"><div class="card-head"><span class="card-title">${icon('scene')} Set the mood</span><span class="reduced">SCENES</span></div><div class="scene-list">${c.scenes.length?c.scenes.map((scene,i)=>{const status=sceneStatus(states,scene,c);return `<button class="scene ${status==='Active'?'active':''}" data-action="scene" data-index="${i}" aria-disabled="${this._busy}"><span class="scene-top">${icon(scene.icon || 'scene',18)}${status==='Active'?'<i class="dot" style="color:var(--mint)"></i>':''}</span><span class="scene-name">${esc(scene.name || states[scene.entity]?.attributes?.friendly_name || scene.entity)}</span><span class="scene-status">${esc(status)}</span></button>`}).join(''):'<div class="empty">Add scenes and optional activity helpers.</div>'}</div></section>
      </main>
      <section class="entertainment"><div><div class="entertainment-label">Something good to watch.<small>Open an app on your selected Google TV</small></div><div class="tv-control" style="margin-top:12px">${icon('tv',15)}<select data-tv aria-label="Target television" ${c.tvs.length?'':'disabled'}>${c.tvs.length?c.tvs.map((t,i)=>`<option value="${i}" ${this._selectedTV===i?'selected':''}>${esc(t.name)}</option>`).join(''):'<option>Add a TV in settings</option>'}</select></div></div><div class="apps">${c.apps.map((app,i)=>`<button class="app" data-action="app" data-index="${i}" ${!tv || tv.launch_apps===false?'disabled':''} aria-disabled="${this._busy}"><span class="app-mark" style="color:${/^#[0-9a-f]{3,8}$/i.test(app.color||'')?app.color:'#c7e7a5'}">${esc(app.name==='Netflix'?'N':app.name.startsWith('SVT')?'svt':app.name.startsWith('TV4')?'4':app.name[0])}</span>${esc(app.name)}${icon('arrow',12)}</button>`).join('')}</div></section>
      <footer class="footer"><div class="live"><i class="dot"></i>${this.demoMode?'Preview · actions are simulated':this._hass?.connected===false?'Home Assistant disconnected':'Connected to Home Assistant'}<span>· ${esc(c.time_zone)}</span></div><div class="footer-actions">${c.edge_to_edge?`<button class="text-button" data-action="fullscreen">${this._exitFullscreen?'Expand dashboard':'Exit full screen'}</button>`:''}${auto?`<span><button class="toggle ${auto.state==='on'?'on':''}" data-action="auto" role="switch" aria-checked="${auto.state==='on'}" aria-label="Automatic dashboard" ${!['on','off'].includes(auto.state)?'disabled':''}></button>Auto dashboard</span>`:''}<button class="text-button" data-action="cast" ${!tv?'disabled':''} aria-disabled="${this._busy}">${icon('cast',12)} Show dashboard</button></div></footer>
    </div></ha-card>`);
    this.scheduleFit();
    if(focusTV && !this.shadowRoot.activeElement) this.shadowRoot.querySelector('[data-tv]')?.focus({preventScroll:true});
    else if(focusAction && !this.shadowRoot.activeElement) [...this.shadowRoot.querySelectorAll('[data-action]')].find(el=>el.dataset.action===focusAction&&el.dataset.index===focusIndex)?.focus({preventScroll:true});
  }
  async onClick(event) {
    const target=event.target.closest('[data-action]'); if (!target || target.disabled || target.getAttribute('aria-disabled') === 'true') return;
    const action=target.dataset.action, index=Number(target.dataset.index), c=this._config;
    if(action==='fullscreen') { this._exitFullscreen=!this._exitFullscreen; this.render(); return; }
    if(action==='settings') { this.openSettings(); return; }
    if(action==='close') { this._drawer=false; this.render(); this.shadowRoot.querySelector('[data-action="settings"]')?.focus(); return; }
    if(action==='save-demo') { this.saveDemoSettings(); return; }
    if(action==='dismiss') { this._notice=''; this.render(); return; }
    if(this._busy) return;
    this._busy=true; this.render();
    try {
      if(action==='scene') await this._hass.callService('scene','turn_on',{entity_id:c.scenes[index].entity});
      if(action==='app') await this._hass.callService('homeboard_tv','launch_app',{entry_id:this.tv().entry_id,activity:c.apps[index].activity});
      if(action==='cast') await this._hass.callService('homeboard_tv','show_dashboard',{entry_id:this.tv().entry_id});
      if(action==='auto') {
        const id=this.tv().auto_entity;
        await this._hass.callService('switch',this._hass.states[id]?.state==='on'?'turn_off':'turn_on',{entity_id:id});
      }
      this._notice = this.demoMode ? 'Demo action simulated. No devices were controlled.' : action==='app'?'App launch requested. Automatic casting is temporarily suspended.':action==='scene'?'Scene activation requested.':action==='cast'?'Dashboard dispatch requested.':'Automatic dashboard updated.';
    } catch(error) { this._notice = `Action failed: ${error.message || error}`; }
    finally {
      this._busy=false; this.render();
      if (!this.shadowRoot.activeElement && (document.activeElement === this || document.activeElement === document.body)) {
        [...this.shadowRoot.querySelectorAll('[data-action]')].find(el => el.dataset.action === action && el.dataset.index === target.dataset.index)?.focus();
      }
    }
  }
  openSettings() {
    this._drawer=true;
    const overlay=document.createElement('div'); overlay.className='overlay';
    overlay.innerHTML=`<section class="drawer" role="dialog" aria-modal="true" aria-labelledby="settings-title"><div class="drawer-header"><h2 id="settings-title">Make yourself at home.</h2><button class="icon-button" data-action="close" aria-label="Close settings">${icon('close')}</button></div><p>${this.demoMode?'Explore the sample dashboard. Preview settings are saved only in this browser. Entity IDs below refer to simulated data.':'Configure this card using Edit dashboard → Edit card. The visual editor has entity pickers; the code editor exposes every mapping. TV automation rules are in Settings → Devices & services → Homeboard TV → Configure.'}</p>${this.demoMode?`<label>Home name<input data-setting="home_name" value="${esc(this._config.home_name)}"></label><label>Heading<input data-setting="title" value="${esc(this._config.title)}"></label><label>Time zone<input data-setting="time_zone" value="${esc(this._config.time_zone)}"></label>`:''}<label>${this.demoMode?'Full card configuration (JSON)':'Current card configuration (JSON)'}<textarea data-json ${this.demoMode?'':'readonly'}>${esc(JSON.stringify(this._config,null,2))}</textarea></label><p>Prices need timestamped start/end intervals. Configure field names, conversion factor, currency, and markup. Scene “Active” status requires a helper that tracks the actual device states.</p><div class="config-error" role="alert"></div>${this.demoMode?'<button class="save" data-action="save-demo">Save preview settings</button>':''}<p>Google Cast is a display receiver. Use this dashboard on your phone to launch apps and scenes, or use a TV browser with pointer/keyboard support.</p></section>`;
    overlay.addEventListener('click',event=>{if(event.target===overlay){this._drawer=false;this.render();}});
    this.shadowRoot.append(overlay); overlay.querySelector('button')?.focus();
  }
  saveDemoSettings() {
    try {
      const config=JSON.parse(this.shadowRoot.querySelector('[data-json]').value);
      for(const input of this.shadowRoot.querySelectorAll('[data-setting]')) config[input.dataset.setting]=input.value;
      this.setConfig(config);
      try { localStorage.setItem('homeboard-demo-config',JSON.stringify(this._config)); } catch { /* Preview storage may be blocked. */ }
      this._drawer=false; this.render();
    } catch(error) { this.shadowRoot.querySelector('.config-error').textContent=error.message; }
  }
}

class HomeboardTVEditor extends HTMLElement {
  constructor() { super(); this.attachShadow({mode:'open'}); }
  setConfig(config) { this._config={...DEFAULT_CONFIG,...config}; this.render(); }
  set hass(hass) { this._hass=hass; const form=this.shadowRoot.querySelector('ha-form'); if(form) form.hass=hass; }
  render() {
    if(!this._config) return;
    this.shadowRoot.innerHTML='<style>:host{display:block}p{line-height:1.6;color:var(--secondary-text-color)}textarea{width:100%;min-height:260px;box-sizing:border-box;background:var(--card-background-color);color:var(--primary-text-color);border:1px solid var(--divider-color);padding:12px;border-radius:8px;font-family:monospace}button{padding:10px;margin-top:8px}.error{color:var(--error-color)}</style><ha-form></ha-form><p>Advanced configuration: scenes, TVs, apps, and custom price field mappings. Edit the JSON below, then apply.</p><textarea aria-label="Advanced card configuration"></textarea><button>Apply advanced configuration</button><p class="error" role="alert"></p>';
    const form=this.shadowRoot.querySelector('ha-form');
    form.hass=this._hass; form.data=this._config;
    form.schema=[
      {name:'tv_mode',selector:{boolean:{}}},
      {name:'theme',selector:{select:{options:[{value:'aurora',label:'Aurora · brighter blues & mint'},{value:'forest',label:'Forest · warm greens'}]}}},
      {name:'edge_to_edge',selector:{boolean:{}}},
      {name:'keyboard_navigation',selector:{boolean:{}}},
      {name:'home_name',selector:{text:{}}},{name:'title',selector:{text:{}}},{name:'time_zone',selector:{text:{}}},{name:'locale',selector:{text:{}}},
      {name:'price_entity',selector:{entity:{domain:'sensor'}}},{name:'price_attribute',selector:{text:{}}},
      {name:'price_unit',selector:{text:{}}},{name:'price_factor',selector:{number:{mode:'box',step:'any'}}},{name:'price_offset',selector:{number:{mode:'box',step:'any'}}},
      {name:'power_entity',selector:{entity:{domain:'sensor'}}},
      {name:'temperature_entities',selector:{entity:{domain:'sensor',multiple:true}}},
      {name:'temperature_unit',selector:{select:{options:['°C','°F']}}},
      {name:'weather_entity',selector:{entity:{domain:'weather'}}},
      {name:'forecast_type',selector:{select:{options:['daily','hourly','twice_daily']}}},
      {name:'lock_entities',selector:{entity:{domain:'lock',multiple:true}}},
    ];
    form.computeLabel=s=>s.name.replaceAll('_',' ');
    form.addEventListener('value-changed',event=>{
      this._config={...this._config,...event.detail.value};
      this.shadowRoot.querySelector('textarea').value=JSON.stringify(this._config,null,2);
      this.dispatchEvent(new CustomEvent('config-changed',{detail:{config:this._config},bubbles:true,composed:true}));
    });
    this.shadowRoot.querySelector('textarea').value=JSON.stringify(this._config,null,2);
    this.shadowRoot.querySelector('button').onclick=()=>{
      try {
        const config=JSON.parse(this.shadowRoot.querySelector('textarea').value);
        const validator=new HomeboardTVCard(); validator.setConfig(config);
        this._config=validator._config;
        this.dispatchEvent(new CustomEvent('config-changed',{detail:{config:this._config},bubbles:true,composed:true})); this.render();
      } catch(error) {this.shadowRoot.querySelector('.error').textContent=error.message;}
    };
  }
}
customElements.define('homeboard-tv-card',HomeboardTVCard);
customElements.define('homeboard-tv-editor',HomeboardTVEditor);
window.customCards=window.customCards||[];
window.customCards.push({type:'homeboard-tv-card',name:'Homeboard TV',description:'A calm, live home dashboard for the big screen',preview:true});
