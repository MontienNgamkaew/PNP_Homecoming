# Mobile blessing card v1

- card-background-v1.png — 1024 × 1536 PNG; navy/gold Thai ornament with blank center. Created using built-in ImageGen; exact prompt in prompt.txt.
- gong-soft-v1.wav — original synthesized gong/bell, mono 22,050 Hz, 4.8 seconds. Generated from decaying inharmonic sine partials; no external recording or attribution dependency.
- card.js — full-screen dialog, audio unlock/replay/mute, and receipt handoff.

Mobile layout uses 100dvh with safe-area padding and scrolls within the card for long blessings. Text remains HTML so the admin can edit blessings without regenerating the artwork. Honor reduced-motion preference. Sound is played once after a successful API response and is prepared from the submit gesture; browsers that block it show a replay button instead. Mute preference alone is stored locally. No names, slips, or tracking tokens are saved in localStorage.

Preview: /#blessing-preview (explicitly labelled as a sample; creates no order).
Actual popup: successful /api/orders response only, still marked pending slip verification. The tracking reference/token remains available from the gold action button.

Verified: CSS build, JS syntax, 7 existing backend tests, 390 × 844 browser preview, playback control, successful fake-slip submission on isolated 8082 QA database, and receipt handoff. Physical iOS/Android devices and speaker output have not been independently tested.
