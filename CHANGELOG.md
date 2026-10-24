# Changes

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
