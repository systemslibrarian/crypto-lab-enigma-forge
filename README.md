# Enigma Forge

## What It Is

Enigma Forge is a faithful, in-browser simulation of the **Wehrmacht Enigma I**
(3-rotor) cipher machine, paired with the **crib + simulated-Bombe** attack that
broke it. The cipher is a symmetric, electromechanical polyalphabetic
substitution: a signal passes through the plugboard (Steckerbrett), three rotors
(chosen from I–V, with ring settings and start positions), a reflector (UKW-B or
UKW-C), back through the rotors, and out the plugboard — stepping the rotors
every keystroke. It solves the problem of a constantly-changing substitution
alphabet, and it is its own inverse (the same settings decrypt). It is **not**
secure by any modern standard: a structural flaw (no letter ever encrypts to
itself) plus predictable cribs let the demo recover settings by elimination.

## When to Use It

- **Teaching how rotor machines actually work** — the path visualizer traces a
  keystroke contact-by-contact, because the mechanism, not a formula, is the point.
- **Demonstrating the no-self-encryption flaw** — the empty diagonal is shown
  interactively and then exploited, making an abstract weakness concrete.
- **Explaining real cryptanalysis** — crib placement, menu construction, and the
  Bombe's deduction-by-contradiction mirror the historical break, not a hand-wave.
- **Showing that keyspace size isn't security** — Enigma's ~10²³ keys still fell
  because exploitable structure leaked; a vivid lesson for modern designers.
- **Do NOT use Enigma for real security.** It is broken: it has no forward
  secrecy, no authentication, a fixed-point-free reflector that leaks structure,
  and is trivially recoverable from cribbed ciphertext. This is a teaching tool only.

## Live Demo

**[systemslibrarian.github.io/crypto-lab-enigma-forge](https://systemslibrarian.github.io/crypto-lab-enigma-forge/)**

Type a message to encrypt it live (and, with identical settings, decrypt it — the
machine is its own inverse) while the lampboard, rotor windows, and signal-path
diagram update per keystroke. Controls include rotor selection and order (I–V),
ring settings (Ringstellung), initial positions (Grundstellung), reflector (B/C),
and plugboard pairs (Steckerbrett). The break workflow then takes a crib and
ciphertext through placement (self-map rejection), menu construction, and a
simulated Bombe that recovers candidate settings you can load back to read the message.

## How to Run Locally

```bash
git clone https://github.com/systemslibrarian/crypto-lab-enigma-forge
cd crypto-lab-enigma-forge
npm install
npm run dev
```

No environment variables are required — everything runs in the browser with no backend.

## Part of the Crypto-Lab Suite

> One of 100+ live browser demos at
> [systemslibrarian.github.io/crypto-lab](https://systemslibrarian.github.io/crypto-lab/)
> — spanning Atbash (600 BCE) through NIST FIPS 203/204/205 (2024).

---

*"Whether you eat or drink, or whatever you do, do all to the glory of God." — 1 Corinthians 10:31*
