# Avast — repo config

This is a pointer file, not the source of truth. Full history, rules, and card list live in the vault at `C:\Users\bouca\Claude Development\ObsidianVaults\MyFirstVault\MyFirstValut\14 - Avast\` ([[Avast]], [[Avast Rules]], [[Avast Cards]], [[Avast Development Notes]]) — read those for anything beyond the quick conventions below, and if this file and a vault note ever disagree, the vault note wins; fix this file to match rather than the reverse.

## Repo
Local: this folder, independent git repo (nested inside the wider `Claude Development` tree, excluded from sibling repos via their `.gitignore`). Remote: `github.com/Boucaner/Avast`. Deployed on Netlify at `https://avastpirategame.netlify.app/`, auto-deploying from GitHub.

## Standing permission — push without asking
Build a change, verify it, commit, and push without asking first — Boss's standing call for this repo specifically. Still verify before pushing every time (syntax check, smoke test, and/or live browser check as fits the change); the permission is about not needing to *ask*, not about skipping verification. Never applies to genuinely destructive git operations (force-push, history rewrite) — those still need an explicit ask.

## Versioning — bump on every build
Bump the version with every build (patch for small fixes/tweaks, minor for a meaningful new feature/system, judgment call each time). Five places in `index.html` need updating together: `#build-tag` span text, and the `?v=` query string on `style.css`, `cards.js`, `game.js`, and `ui.js`. Mention the new version in the commit message.

## Verification approach
`node --check` on every changed `.js` file. For logic changes, a headless smoke test bundling `cards.js`+`game.js` via `vm.runInContext` (see [[Avast Development Notes]] for the full pattern, including the AI-pacing adapter needed since v0.3.0) — write it fresh to scratch each time rather than trusting an old copy. For anything UI-visible, a live browser pass — prefer driving/inspecting via the JS console (`javascript_tool`) over click automation, which has been intermittently unreliable here.

## Ship model, current phase order, and other live conventions
Covered in [[Avast]]'s "v1 Build Notes" section — don't duplicate here, it changes too often to keep two copies in sync. Check there before assuming how a phase or mechanic currently works.
