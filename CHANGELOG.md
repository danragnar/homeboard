# Changes

## 0.10.0

- Make browser dashboard launching configurable between Android TV Remote and LG webOS command. Existing entries keep Android TV Remote behavior.
- Support native LG playback/source signals or an explicit idle guard, with no Android remote required for dashboard opening; retain power, playback, idle-delay and cooldown checks.

## 0.9.0

- Keep electricity chart axis labels in proportion across dashboard sizes and use theme-aware chart colours.
- Add the Tänd brasa fireplace shortcut with a fire icon.
- Add Aurora green, Aurora teak, Nordic green, Nordic, Linen and Teak themes alongside Aurora and Forest.
- Allow preview themes through the URL and fall back safely when the requested theme is invalid.

## 0.8.0

- Load Music Assistant favorite playlists automatically with names, artwork, playback, refresh, and a configurable display limit (0 shows all).

## 0.7.0

- Combine indoor temperatures and locks into Home sensors, with automatic type detection, unit-aware readings, binary sensor statuses, and a unified entity picker. Existing selections carry over.

## 0.6.0

- Add a Google TV Home button and `homeboard_tv.return_home` action, with a temporary exit pause that survives browser-to-launcher detection.
- Embed a native Music Assistant now-playing panel with album art, track, artist, album and playback state from the HA media player entity.
- Add supported transport, volume and mute controls through HA; no Music Assistant URL or iframe is needed.
- Add a visual Music Assistant integration player picker and document the same-Cast-receiver display limitation.

## 0.5.0

- Add an optional Music Assistant box with playlist playback to an explicit player, playlist links and a full-interface link.
- Offer an optional browser launch on the selected Android/Google TV through existing app controls; document Cast receiver limitations.
- Include sample playlists in the local preview; no automatic music playback or UI launch.

## 0.4.1

- Start a fresh stable-idle delay in Browser mode after observing a foreground app return to an allowed launcher. End the previous app grace and dispatch cooldown only once playback, screen power, and idle guards agree.
- Retain failure cooldowns on the same launcher and fail closed for missing foreground or power signals.
- Expose foreground app, playback state, and remaining grace/cooldown seconds on the auto-dashboard switch.

## 0.4.0

- Add a configurable Home Assistant calendar panel with upcoming timed/all-day events, locations, a look-ahead window and event limit. Refresh on calendar state changes and every five minutes.
- Combine live household power consumption with electricity prices, retaining the six-card TV layout.

## 0.3.0

- Add TV browser transport to each screen's integration options. Open a full dashboard URL through Android TV Remote instead of Cast, using the same auto-dashboard switch, stable idle delay, cooldown, and app grace.
- Require browser URL, remote, foreground app, and screen power configuration; retain Cast playback protection and launcher-only takeover. Never reopen the browser while it is foreground.
- Keep Cast connection retries exclusive to Cast transport and expose transport/browser diagnostics. Foreground browser status explicitly leaves the page unconfirmed.
- Document migration of an existing Cast entry to TV Bro, retained authentication, physical-TV checks, and TV Bro's new-tab/direct-navigation limitation.

## 0.2.9

- Preserve interactive DOM elements across live data updates and notices, retaining browser focus and native selector state. Skip unrelated HA entity updates and cache price interval parsing.
- Capture remote keys before page-level handlers; normalize Android/legacy Select and arrow keys, activate once on OK/Space, and ignore held-button activation repeats.
- Prefer aligned controls for directional focus, show an explicit remote focus outline, and allow left/right to leave TV selectors. Pending actions stay focusable and do not steal newer focus when they finish.
- Add browser regression checks for live updates, notice insertion/removal, native activation, and pending requests. TV Bro hardware verification remains necessary.

## 0.2.8

- Promote edge-to-edge Homeboard to the browser top layer so HA sidebar stacking and ancestor clipping cannot leave navigation above the card.
- Preserve the same card and sensor updates while expanded; Exit full screen, Escape, and navigation release the top layer. Older engines retain a visible fixed-position fallback.
- Add an explicit sidebar/header stacking regression fixture and lifecycle tests.

## 0.2.7

- Keep edge-to-edge Homeboard above Home Assistant’s sidebar layer. Escape and Exit full screen restore access to navigation.

## 0.2.6

- Brighter Aurora theme with blue, lilac and mint panels, clearer secondary text, and an optional Forest palette.
- Optional edge-to-edge TV display covering HA navigation and outer margins. Escape or Exit full screen restores navigation; card editors remain accessible.
- Spatial arrow-key navigation in browsers that forward keyboard input, with visible focus and focus restored after actions. Physical Google TV remote support still depends on the receiver.
- Reduced-motion preferences preserve the TV layout fit.

## 0.2.5

- Keep three balanced columns on landscape Cast receivers with smaller logical viewports, including 960×540.
- Keep electricity to one compact column rather than the mobile full-width layout.
- Fit TV mode from 740px card width on landscape displays, and add a 960×540 Cast preview.

## 0.2.4

- Preserve the full card width when fitting the TV dashboard into a short viewport; anchor it at the upper left instead of shrinking it into the center.
- Remove the desktop content-width cap in TV mode while preserving normal embedded/mobile layout behavior.

## 0.2.3

- Distinguish a launched Cast receiver from a dashboard title reported by the receiver.
- Retry unconfirmed Homeboard-launched Cast connections with configurable delay and bounded attempts, without closing the receiver.
- Require independent power, Cast foreground and guard confirmation before recovery; stop for app changes and screen-off.
- Clarify the Google TV Remote selector and expose selected entity IDs and retry diagnostics.

## 0.2.2

- Set card text alignment explicitly so the Cast receiver cannot center dashboard labels, readings and descriptions.
- Exercise centered receiver inheritance in the TV preview while keeping the clock, forecast and app buttons intentionally aligned.

## 0.2.1

- Recognize current Google TV launcher and screensaver IDs; migrate only the previous default allowlist.
- Treat a Cast receiver in `off` as idle only with independent screen power and foreground confirmation.
- Close stale Home Assistant Cast sessions before relaunching the configured dashboard, with a bounded wait and fresh safety checks.
- Preserve media playback, screen power, app grace and custom allowlist protections.
- Document receiver connection errors separately from successful dispatch.

## 0.2.0

- One HACS integration now contains the casting service and frontend card.
- Bundled static assets with versioned URLs, automatic UI resource registration and legacy resource migration.
- Root HACS metadata, repository preparation command and checked GitHub release workflow.
- Source and integration-only release archives; updated manual installer and HACS setup guide.

## 0.1.0

- Initial native Home Assistant integration with per-screen UI configuration.
- Safe stable-idle casting, app foreground guards, persistent opt-out, app-launch grace and cooldown retries.
- Google Cast and script-based LG dashboard transports.
- Configurable Homeboard Lovelace card, widescreen TV fitting and responsive phone layout.
- Electricity intervals, live consumption, indoor mean temperature, forecast subscriptions, lock states, honest scene status and configurable app activities.
- Offline sample preview, backup installer, example packages and regression checks.
