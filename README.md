# crypto-lab-enigma-forge

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

## What Can Go Wrong

- The reflector is fixed-point-free, so no letter ever encrypts to itself — a structural leak that crib placement exploits to reject impossible alignments.
- Predictable plaintext (stereotyped openings, weather reports) gives cribs that a Bombe-style search uses to eliminate rotor and plugboard settings.
- Operator procedure failures — reused message keys, lazy rotor choices, repeated indicators — historically shrank the effective keyspace far below its theoretical size.
- The large keyspace (~10²³) creates a false sense of security; exploitable structure, not brute force, is what broke it.
- It provides no authentication or integrity and no forward secrecy, so ciphertext can be altered undetectably.

## Real-World Usage

- Historically the primary German military cipher of World War II; breaking it (the Polish Biuro Szyfrów, then Bletchley Park) materially affected the war.
- A foundational case study in cryptanalysis teaching — known-plaintext attacks, search-space reduction, and why keyspace size alone is not security.
- The origin point for mechanized codebreaking (the Bombe), a precursor to modern computing.
- Today purely a teaching and museum artifact, not used for any real protection.

## How to Run Locally

```bash
git clone https://github.com/systemslibrarian/crypto-lab-enigma-forge
cd crypto-lab-enigma-forge
npm install
npm run dev
```

## Related Demos

- [crypto-lab-vigenere-break](https://systemslibrarian.github.io/crypto-lab-vigenere-break/) — breaking a classical polyalphabetic cipher with Kasiski and frequency analysis.
- [crypto-lab-dead-sea-cipher](https://systemslibrarian.github.io/crypto-lab-dead-sea-cipher/) — substitution, Vigenère, and Atbash, the historical ciphers Enigma descends from.
- [crypto-lab-otp-vault](https://systemslibrarian.github.io/crypto-lab-otp-vault/) — the one cipher with provable secrecy, and the key-reuse mistake that breaks it.
- [crypto-lab-biham-lens](https://systemslibrarian.github.io/crypto-lab-biham-lens/) — modern differential cryptanalysis of a substitution-permutation network.

---

*One of 120+ browser demos in the [Crypto Lab](https://crypto-lab.systemslibrarian.dev/) suite.*

*"So whether you eat or drink or whatever you do, do it all for the glory of God." — 1 Corinthians 10:31*
