# How to demo Enigma Forge

A repeatable ~5-minute walkthrough for a live audience. The in-app **Presenter
mode** button automates the beats below; this page is the script behind it.

> This is a presenter aid, not the project README. The standardization pass owns
> the README.

## Setup

```bash
npm install
npm run dev        # serves at http://localhost:5173
```

Open the page and click **🎯 Start challenge** (or **▶ Presenter mode** to be
walked through it). Everything runs in the browser — no backend, nothing saved.

## The path to click

1. **Set up / inspect the machine** (Section 1). Type a few letters — lamps light,
   rotor windows advance, the **Signal Path** traces plugboard → rotors → reflector
   → back. Hit **⚙ Double-step demo** to show the middle rotor dragging the left one
   (windows go `ADV → AEW → BFX`).
2. **The flaw** (Section 2). The substitution matrix has an **empty diagonal** — no
   letter maps to itself. Say: *"One structural leak, and the keyspace starts to crack."*
3. **Crib placement** (Section 3). The crib `WETTERBERICHT` is pre-placed. Point out
   struck-out offsets: *"No letter self-encrypts, so these placements are impossible —
   for free, before any computation."*
4. **Menu.** A surviving placement becomes a graph. The **coach** grades it; the
   challenge menu has loops. Say: *"Loops are leverage — each one kills ~25/26 of wrong
   settings."*
5. **Run the Bombe.** Scope = *current rotor order* (fast). Watch the **counters**:
   contradiction rejects, crib-recheck rejects, surviving stops. Say: *"It doesn't
   decrypt — it eliminates contradictions until only consistent stops remain."*
6. **Recover.** Open **Why this stop survived** on a verified candidate, then
   **⤓ Load into Machine & decrypt**. The crib window now reads as plaintext, and the
   success banner re-checks that for itself against the machine's live output — change a
   rotor afterwards and the banner flips to "not verified". Say: *"A stop is a recovered
   key, not a finished decrypt."* On the challenge, the `F-L` Stecker never touches the
   menu, so it is not deduced and a few letters outside the crib stay transposed until you
   wire that pair by hand.

## Expected results (challenge, fast scope)

- Crib placement eliminates most offsets immediately; one true placement survives with a
  loopy menu.
- The fast Bombe (1 rotor order × 17,576 positions) finishes in roughly 1–3 s and surfaces
  the true start position `HCT` as a verified stop (uniquely, at the fast scope).
- The stop deduces the `A-R` Stecker but not `F-L` (neither letter touches the menu), so
  loading it decrypts `WETTERBERICHT` exactly and leaves 4 of the 52 letters elsewhere
  transposed. Wire `F-L` on the plugboard by hand and the whole message reads.

## What to say if…

- **Zero stops:** the crib or placement is wrong, or the rotor scope is too narrow. Widen
  scope to *all 60 orders* (slower) or pick a different surviving offset.
- **Many stops:** the menu is under-constrained (short crib / few loops). The coach flags
  this. Use a longer crib — the **weak-menu** and **many-false-stops** examples demonstrate it.
- **It's slow:** *all 60 orders* or ring search multiplies the space; the estimate warns you,
  and **Cancel** stops it. The search runs in a Web Worker, so the UI stays responsive.

## Sharing

**🔗 Share link** copies a URL whose `#s=…` hash reproduces the exact state (settings,
message, crib, placement, scope). **{ } Copy JSON** / **📋 Import** do the same via JSON.
No data leaves the browser.

## The one-line lesson

Enigma failed not because its keyspace was small, but because exploitable structure —
no self-encryption, predictable cribs, menu loops, plugboard symmetry — turned guesses
into contradictions.
