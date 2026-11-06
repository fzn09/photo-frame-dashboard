# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Fauzan and Amanda, a household in Berlin. They use a wall-mounted photo frame, assumed to hang where they cook, at a glance from across the room and by touch at arm's length, often with busy hands.

## Product Purpose

Home HQ is the family's always-on dashboard on a cheap Android photo frame: today at a glance, plus calendar, chores, shopping, fridge, kitchen tools and photos. Success is that the household reads what matters without opening a phone.

## Positioning

It runs on a frame the owners took over themselves and shows their own feeds together in one place, with no vendor app and no account of its own.

## Operating Context

Unattended, always on, 1280x800 at 160 ppi, touch only, no keyboard. Wi-Fi arrives after the page loads. Light palette by day and dark from sunset to 07:00, switched by the clock. Each household view can be turned off with the Worker's VIEWS var.

## Capabilities and Constraints

- Feeds come through a dependency-free Cloudflare Worker: weather, Google Calendar, Bring!, BVG, TickTick, Unsplash, the Cookidoo week plan, and REWE receipts pushed by a scheduled job.
- Android 6 with WebView 106: see docs/building-for-the-frame.md. No third-party hosts from the page, no infinite animation.
- The Cookidoo API is unofficial and reverse-engineered. Its plan has recipes per day only: no meal slot, time or servings.
- The household owns a Thermomix TM6 and runs no always-on listener, so there is no live cook state. The household plans a mix of lunches and dinners, so the dashboard must not imply a meal time.

## Evidence on Hand

Sample data lives in dashboard/js/data.js. Real Cookidoo data is available only after the refresh token is seeded (dashboard/SETUP.md). Do not present unverified device behaviour as fact.

## Product Principles

- Readable from across the room; nothing below 16 px.
- Show only what the feed really knows; a stale or missing feed says so.
- The page survives alone: last good data, never a blank screen.
- Orange is the warm accent of the house (counts, today, selection). The red-orange alert tone (`--alert`) is reserved for time-critical items: overdue, leave now, expiring.
