# Homeboard TV

A local Home Assistant dashboard and automatic TV casting integration. Homeboard turns an idle screen into a home overview, then stays out of the way when you open another app.

The dashboard includes today's electricity prices with high/low intervals, live power consumption, mean indoor temperature, weather forecast, door lock status, scenes, and configurable Netflix / SVT Play / TV4 Play shortcuts. Every entity, app activity, TV destination, and price mapping is configurable.

**Status:** initial implementation. JavaScript/data tests and isolated Python policy/controller tests run without Home Assistant. The preview uses explicitly labeled sample data. A real Home Assistant installation and physical TVs are still needed to verify pairing, actual playback reporting, Cast, LG browser compatibility, app links, and the configuration flow end to end.

## What runs where

- `custom_components/homeboard_tv/`: event-driven integration in Home Assistant. Add one entry per television. No separate daemon, cloud hosting, tokens in URLs, or npm runtime is required.
- `custom_components/homeboard_tv/frontend/`: dependency-free Lovelace custom card, using Home Assistant's existing authenticated connection.
- `examples/`: dashboard configuration and optional LG, Nord Pool, and scene-tracking packages.
- `preview/`: the same card with simulated states and simulated actions, for local design review.

## Install through HACS (recommended)

Homeboard ships as **one HACS Integration**, including the dashboard card. HACS downloads from a GitHub repository; the local ZIP cannot be added as a custom repository. The repository is [danragnar/homeboard](https://github.com/danragnar/homeboard). HACS requires a **public** repository; a private copy can store the source but cannot be installed through standard HACS. See [Publishing](#publishing-for-hacs) below.

Once the repository is published:

1. Open **HACS → menu → Custom repositories**. Add `https://github.com/danragnar/homeboard` and choose **Integration**.
2. Find **Homeboard TV**, download it, and restart Home Assistant.
3. Under **Settings → Devices & services → Add integration**, add **Homeboard TV**. Add one entry per television, with the playback/idle entities described below.
4. With UI-managed Lovelace resources, Homeboard registers its dashboard card automatically. Refresh the frontend after adding the integration. Add a Homeboard TV card from the dashboard card picker and select your sensors in its visual editor. For a dedicated TV view, use a wide Sections view (four columns, one section spanning all four) with the supplied card.
5. Configure TV entries, scenes and app actions using the card editor's advanced configuration. Each integration entry creates an auto-dashboard switch; copy the switch's `entry_id` attribute into the matching card TV entry. Examples are in [examples/dashboard.yaml](examples/dashboard.yaml).
6. Test **Homeboard TV: Show dashboard** in HA Actions while the screen is safely idle, then test automatic casting and app shortcuts.

If you manage **resources** in YAML, add the resource below to your existing `lovelace.resources` list instead. Homeboard logs a reminder and leaves YAML resource configuration under your control:

```yaml
- url: /homeboard_tv/0.2.3/homeboard-tv-card.js
  type: module
```

Versioned asset URLs keep the card and its imported modules in sync after an update. The integration automatically upgrades its UI-managed resource URL and migrates old `/local/homeboard-tv/homeboard-tv-card.js` resource registrations. YAML-resource users must update the URL when upgrading. Refresh existing browsers and restart the Cast session after an update.

### Manual installation alternative

Copy **only** `custom_components/homeboard_tv` into your HA `custom_components/` directory. All runtime assets now live inside that integration directory; there is no separate `www` installation. Alternatively:

```bash
python scripts/install.py /path/to/your/home-assistant-config --dry-run
python scripts/install.py /path/to/your/home-assistant-config
```

The installer backs up replaced files under `homeboard-backups/<timestamp>/` and preserves YAML, dashboards and configuration entries. Restart HA, add the integration, and follow steps 4–6 above.

If you prefer the supplied file-managed dashboard, copy `examples/dashboard.yaml` to `/config/homeboard-dashboard.yaml` and merge `examples/configuration.yaml` into your existing configuration without duplicating the `lovelace:` key. Replace example entities and restart HA after registering the dashboard. Its URL is `/homeboard-home/overview`, so the integration's paths are `homeboard-home` and `overview` without leading slashes. Use the visual card editor for UI-managed dashboards; permanent changes to a YAML dashboard belong in its source file.

## Publishing for HACS

Use a GitHub repository containing this project at its root. Do not upload only the source ZIP as a repository file. Default HACS catalog inclusion is a separate optional review process; a **custom repository** can be used first.

Before publishing, fill in real repository metadata:

```bash
python scripts/prepare_hacs.py --repository danragnar/homeboard
npm run check
npm test
npm run package
```

For a fork, replace `danragnar/homeboard` with its actual owner/repository. The command sets the integration's documentation, issue tracker and codeowner. Review the generated codeowner if using an organization repository. Keep GitHub Issues enabled.

Commit/push the prepared source, create a tag matching `manifest.json` (currently `v0.2.3`), and push that tag. The included release workflow validates the metadata and version, runs checks, and publishes a GitHub Release with source and integration-only archives. It refuses to release unprepared metadata or a mismatched version tag. Publishing and repository creation are not performed by the local preparation command.

The root `hacs.json` uses normal repository-based integration installation; it does not require a release ZIP to exist before HACS can download the default branch. Each release includes `homeboard_tv.zip` as a convenience archive containing the **contents** of the integration directory. It is distinct from the source bundle `homeboard-tv-0.2.3.zip`.

The integration follows [HACS integration structure](https://www.hacs.dev/docs/publish/integration/): one integration directory containing all runtime files. HACS expects the repository to be available on GitHub; see [custom repositories](https://www.hacs.dev/docs/faq/custom_repositories/).

## Google TV

Pair both native integrations:

- **Google Cast:** use its `media_player` as `playback_entity`. It supplies actual Cast playback states.
- **Android TV Remote:** use its `remote` entity as `activity_entity` and `remote_entity`. Select the **Remote** entry explicitly: the media player may have the same display name but exposes `app_id`, not `current_activity`. Its `current_activity` attribute identifies the foreground app. Android TV Remote's media player alone does **not** reliably report playback.

Inspect the remote's `current_activity` while on the home launcher. Put those exact IDs in `idle_apps`, comma separated. The supplied IDs include Google TV launcher (`com.google.android.apps.tv.launcherx`) and screensaver (`com.google.android.apps.tv.dreamx`), alongside older launchers. Verify them for your device. Upgrades expand the previous shipped defaults automatically; customized lists are preserved. App menus, Netflix, paused media, missing activity information, and unavailable entities all block automatic casting. **Never include streaming apps in the idle app list.**

If the Cast receiver remains online with the TV powered off, set `power_entity` to an entity that reflects the actual screen's power. This avoids using an always-on Chromecast to wake an off screen through HDMI-CEC. A physical TV can only be treated as offline if you supply a signal that actually reports that condition.

Home Assistant Cast requires an HTTPS HA address reachable from the receiver, including working name resolution and a trusted certificate. Configure the HA external URL (Home Assistant Cloud is one option). Cast must be able to load the custom module resource. If you already set custom HTTP CORS rules, ensure `https://cast.home-assistant.io` is allowed. Do not add credentials to URLs or disable authentication. See the official [Cast action](https://www.home-assistant.io/actions/cast.show_lovelace_view/) and [Cast FAQ](https://cast.home-assistant.io/faq.html).

## LG television

Choose the appropriate transport per screen:

| Setup | Configuration |
| --- | --- |
| LG has an external Cast receiver or supported Google Cast | Use `cast` mode, the receiver's playback entity, LG's actual power entity, and a reliable foreground/idle guard. |
| LG's native webOS browser can render your HA frontend | Use `script` mode and a script that opens the dashboard. `examples/lg-package.yaml` uses the native `webostv.command` action. |

For script transport, configure `dashboard_script` and an `idle_guard` binary sensor. **`on` alone is not proof that LG is idle.** The example allows only source names you have verified to mean the home screen; replace the example `Home` source with values observed in your LG entity. If your model does not expose a trustworthy idle signal, automatic takeover cannot be determined safely; use an external receiver or keep the auto-dashboard switch off and invoke your opening script manually.

The LG browser needs its own authenticated HA session. Sign in on the TV using an appropriate HA account. Browser engine, cookies, HTTPS support, and modern JavaScript vary with webOS versions. Opening a URL successfully does not establish that HA rendered or logged in. The native integration does not make every LG model a Chromecast. See [webOS commands](https://www.home-assistant.io/actions/webostv.command/).

## Idle behavior

Defaults: **45 seconds stable idle**, **5 minutes between automatic attempts**, **10 minutes grace after app launch**.

1. Listen for changes to the configured playback, screen power, foreground app, and idle guard entities.
2. Require an online screen with `idle` playback. `on` is accepted only with an explicit guard. A Cast entity in `off` can mean no receiver app: it is accepted only when a separate screen power entity is online and the foreground app is an allowed launcher/screensaver. Other offline states block casting. Media playback (`playing`, `paused`, or `buffering`) blocks casting, except for a stale Home Assistant receiver as described below.
3. Require every configured guard to agree: allowed launcher app and/or an idle guard in `on`. Missing or unknown signals block casting.
4. Wait for the stable idle delay. Unrelated attribute updates do not postpone it. Busy/offline events cancel it.
5. Recheck all conditions immediately before dispatching the configured view or script.
6. Keep a visible dashboard session. If the Cast entity still reports the configured dashboard app while an independent foreground entity reports an allowed launcher/screensaver and the screen power entity is online, close that stale HA receiver, wait up to 10 seconds for it to close, recheck all guards, then cast the configured view. This only closes the Cast receiver app; it does not turn off the physical screen. Inspect the Cast entity's `app_name` and override `dashboard_app` if needed.
7. Failed or still-idle dispatches can retry after the cooldown. The switch exposes the last error; this is an attempt interval, not an infinite tight retry loop.

App launches cancel pending casts, start the grace period, and use the configured Android TV remote. A timer reevaluates when grace expires even without another entity event. Foreground detection continues protecting app browsing after grace expires. Turning the auto-dashboard switch off persists across HA restarts.

A successful Cast action means the request was dispatched; it does not prove the TV connected or rendered. Status is `receiver active; dashboard unconfirmed` until the receiver supplies a nonempty media title, then `dashboard reported`. A title is a receiver signal, not proof every custom card rendered. For a receiver opened by Homeboard, an absent title triggers one connection retry after 45 seconds by default, reusing the existing receiver. Retries require an online independent screen-power entity, a foreground entity reporting an explicitly allowed Cast receiver app (default `com.google.android.apps.mediashell`), and every configured guard. Other apps, screen-off, disabled automation and app grace prevent retries. After the last retry, Homeboard allows another retry-delay window for the title before recording an error and stopping recovery. Set `cast_retry_limit` (0–3), `cast_retry_seconds` (35–600), and `cast_receiver_apps` in integration options. These bounded connection retries are separate from the normal automatic-dispatch cooldown. The auto-dashboard switch also exposes the selected entity IDs, retry count and awaiting-dashboard state for diagnosis. If the TV shows “Not connected” or a WebSocket error, check the HTTPS external URL, DNS, certificate and reverse-proxy WebSocket forwarding. A fresh cast may clear a transient connection failure. Avoid changing network settings if the same URL works on retry.

An LG opening script is dispatched through `script.turn_on`; the integration reports dispatch errors, while errors inside the running script are visible in HA's script traces. It cannot prove a browser rendered the dashboard.

## Dashboard configuration

The visual card editor provides entity selectors for price, power, temperature sensors, weather, and locks. Advanced JSON in that editor (or normal Lovelace YAML) configures scenes, TV entries, app activities, and all remaining fields. All configuration belongs to the HA card, not browser-local storage. Only the standalone **demo** stores its preview configuration locally.

| Option | Meaning |
| --- | --- |
| `tv_mode` | Default `true`. Wide views fit the whole dashboard into the viewport below HA's header; narrow/mobile views scroll naturally. Turn off for a normal embedded card. |
| `home_name`, `title`, `subtitle`, `weather_location` | Visible names and heading. |
| `time_zone`, `locale` | Display dates/times and numeric formatting; default `Europe/Stockholm`, `en-GB`. |
| `price_entity`, `price_attribute` | Sensor and attribute holding today's timestamped price intervals. |
| `price_start_key`, `price_end_key`, `price_value_key` | Interval field names; default `start`, `end`, `value`. |
| `price_factor`, `price_offset` | Series conversion: `raw × factor + offset`. Use e.g. `0.001` for currency/MWh → currency/kWh. Taxes/fees are your configuration. |
| `current_price_factor` | Conversion for the sensor's numeric state when no current interval exists; default `1`. The same `price_offset` is added. |
| `price_unit` | Display label, e.g. `SEK/kWh`; must match the configured conversion. |
| `power_entity` | Instantaneous consumption sensor; W becomes kW above 1,000 W. Other units are preserved. Use power, not accumulated kWh. |
| `temperature_entities`, `temperature_unit` | Mean of valid Celsius/Fahrenheit readings, converted to `°C` or `°F`. Missing/incompatible values are excluded and the reporting count is shown. |
| `weather_entity`, `forecast_type` | Forecast subscription; choose `daily`, `hourly`, or `twice_daily` supported by your provider. |
| `lock_entities` | Read-only lock states. Unknown locks never count as secured. |
| `scenes` | Objects with `entity`, optional `name`, `icon`, `active_entity`. |
| `tvs` | Objects with `name`, `entry_id`, optional `auto_entity`, `launch_apps`. Set `launch_apps: false` on an LG-only entry without an Android remote. |
| `apps` | Objects with `name`, `activity`, optional hexadecimal `color`. Add/reorder freely. |

Scene icons supported: `sun`, `moon`, `tv`, `bolt`, `home`, `scene`, `temp`, `lock`, `shield`, `cloud`, `rain`, `cast`, `power`.

**TV formatting:** wide layout uses six balanced cards: compact electricity, power and mean temperature across the first row, weather/locks/scenes in the second row, and app shortcuts below. Electricity uses a small trend chart rather than a dominant panel. Exact low/high intervals remain available in chart tooltips and its accessible description; the expanded narrow-screen layout also lists them below the chart. A compact landscape layout is used on lower-height receivers. TV mode applies an additional fit to the available viewport so the supplied configuration stays on one screen. Prefer a dedicated view with roughly four scenes and a small set of door locks; many more items will reduce the fitted text size. Disable your TV's overscan if it crops display edges. The supplied view uses a four-column-spanning section rather than a single narrow section or Cast's unsupported `panel: true` mode.

### Electricity data

Example `raw_today` attribute:

```yaml
raw_today:
  - start: '2026-10-22T00:00:00+02:00'
    end: '2026-10-22T00:15:00+02:00'
    value: 0.42
  - start: '2026-10-22T00:15:00+02:00'
    end: '2026-10-22T00:30:00+02:00'
    value: 0.39
```

Timestamps must include their offset/time zone. The adapter filters by the configured local date, accepts negative and zero prices, supports both hourly and quarter-hour intervals, and preserves 23/25-hour daylight-saving days. It computes a duration-weighted daily average over available intervals. The lower quarter and upper quarter of today's interval prices are highlighted. The cheapest and most expensive individual interval times and values appear beneath the chart. Gaps are not interpolated; malformed/overlapping rows are ignored. Plain arrays of 24 numbers are intentionally not assumed to describe a day accurately across DST.

The **official Nord Pool integration** needs an adapter because its current-price sensor does not contain a full price array. `examples/nordpool-package.yaml` requests today's intervals periodically using `nordpool.get_prices_for_date`, converts MWh prices to kWh, and exposes an `intervals` attribute. Set the card's `price_entity` to that generated sensor and `price_attribute: intervals`; leave `price_factor: 1`. Replace the Nord Pool config entry and price area. Old intervals from yesterday are not rendered on a new day if fetching fails. Follow the official [Nord Pool action reference](https://www.home-assistant.io/actions/nordpool.get_prices_for_date/).

### Scenes and apps

HA scenes are snapshots, not on/off switches. Without an `active_entity`, Homeboard shows the scene's last activation time (or “Not tracked”). A helper can report whether actual lights/devices match the scene, in which case Homeboard can show “Active”. `examples/scene-tracking.yaml` shows one pattern; adapt it to the actual targets/brightness ranges defining your scene.

Netflix starts with `netflix://`. SVT and TV4 start with their public HTTPS links. **Verify routing on your Google TV:** Android may open a browser or reject a link depending on the installed apps and their link associations. Set each `activity` to an app-supported deep link or the actual package ID shown by your remote's `current_activity`. Package-ID launching itself is unreliable on some Android TV versions; the activities are deliberately editable rather than assuming a universal package. See [Android TV Remote](https://www.home-assistant.io/integrations/androidtv_remote/).

A standard Google Cast receiver on a TV is primarily a display; a Google TV D-pad does not automatically become a pointer for an HA Cast custom card. Use the same dashboard on your phone/tablet to tap scenes and apps. A compatible TV browser supports keyboard/pointer interaction. Homeboard does not claim remote-navigation support inside the Cast receiver.

## Local preview and checks

No installation is needed for the browser card or tests; Node and Python are sufficient:

```bash
npm run preview
# Open http://127.0.0.1:8124/preview/
npm run check
npm test
npm run package  # Creates artifacts/homeboard-tv-0.2.3.zip and homeboard_tv.zip
```

The preview opens a true 16:9 TV canvas even in a narrow app pane, with selectable 1080p, 720p, and responsive views. The preview always identifies sample data, uses a fixed sample day, and simulates every action. It never connects to HA or controls devices. Runtime assets use no CDN, external fonts, analytics, or front-end framework.

Tests cover missing sensors, mixed temperature units, negative/zero prices, quarter-hour intervals, both DST transitions, weighted means, missing locks, scene activity semantics, safe HTML escaping, paused/native-app guards, power-off behavior, stable idle debounce, dispatch-time races, cooldown retry, app grace, unload cleanup, context propagation, and installer backups. Controller tests use lightweight HA boundary fakes; they are not substitutes for real HA integration tests. `npm run check` checks syntax and compiles Python source. CI repeats these checks.

## Updates and rollback

With HACS, select the offered Homeboard TV update, install it and restart Home Assistant. Python and frontend assets update as one integration. The UI-managed resource is updated on startup, with a version-specific URL for all imported modules. Refresh browsers and restart Cast sessions. For YAML-managed resources, update the versioned module URL in YAML yourself. Your dashboard configuration and per-screen integration entries are preserved.

For manual updates, run the installer against the same HA configuration directory; replaced files are backed up. Restart HA and refresh clients. Restore the old runtime files from the backup to roll back, or select an earlier published version in HACS. Keep the full integration directory together, including the frontend assets.

When maintaining releases, update `manifest.json`, `const.py`'s `VERSION`, and `package.json` together; run checks/tests before tagging. CI verifies their consistency. The release tag must match the manifest version.

To uninstall, remove the Homeboard TV integration entries and its module resource, then uninstall the repository in HACS (or remove the installed integration directory). Remove any dashboard registration/file you no longer need. Helpers/packages you use elsewhere can remain. If upgrading from 0.1.0, the previous `www/homeboard-tv/` files are no longer needed after the resource migration and client refresh.
