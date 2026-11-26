# crypto-lab-enigma-forge

## What It Is

Enigma Forge is a faithful, in-browser simulation of the **Wehrmacht Enigma I**
(3-rotor) cipher machine, paired with a classroom simulation of the British Bombe’s use of a **crib** (a proposed plaintext passage). The cipher is a symmetric, electromechanical polyalphabetic
substitution: a signal passes through the plugboard (Steckerbrett), three rotors
(chosen from I–V, with ring settings and start positions), a reflector (UKW-B or
UKW-C), back through the rotors, and out the plugboard — the right rotor advances before each letter is enciphered. The middle and left rotors advance at turnover. To decrypt, restore the original starting positions and use the same rotor order, rings, reflector and plugboard. It is **not**
secure by any modern standard: a structural flaw (no letter ever encrypts to
itself) helps rule out settings that contradict a crib.

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
  secrecy, no authentication, and its reflector prevents a letter from encrypting to itself. In the bundled example,
  a setting can reproduce the entire crib while decrypting other letters incorrectly.

## Live Demo

**[systemslibrarian.github.io/crypto-lab-enigma-forge](https://systemslibrarian.github.io/crypto-lab-enigma-forge/)**

Type a message to encrypt it live (and, with identical settings, decrypt it — the
machine is its own inverse) while the lampboard, rotor windows, and signal-path
diagram update per keystroke. Controls include rotor selection and order (I–V),
ring settings (Ringstellung), initial positions (Grundstellung), reflector (B/C),
and plugboard pairs (Steckerbrett). The break workflow then takes a crib and
ciphertext through placement (self-map rejection), menu construction, and a
simulated Bombe that recovers candidate settings you can load back into the machine.
Every stop is surfaced only after the crib window is genuinely re-decrypted, and the
success banner re-runs that check against the machine's live output rather than
trusting that a stop was loaded. Note the honest limit: the Bombe can only deduce
Steckers that touch the menu, so a loaded stop reproduces the crib exactly but may
leave letters elsewhere transposed until the remaining plugboard pairs are found by
hand — the bundled challenge is deliberately one of those cases.

## What Can Go Wrong

- The reflector is fixed-point-free, so no letter ever encrypts to itself — a structural leak that crib placement exploits to reject impossible alignments.
- Predictable plaintext (stereotyped openings, weather reports) gives cribs that a Bombe-style search uses to eliminate rotor and plugboard settings.
- Operator procedure failures — reused message keys, lazy rotor choices, repeated indicators — historically shrank the effective keyspace far below its theoretical size.
- The large keyspace (~10²³) creates a false sense of security; exploitable structure, not brute force, is what broke it.
- It provides no authentication or integrity and no forward secrecy, so ciphertext can be altered undetectably.

## Real-World Usage

- Historically the primary German military cipher of World War II; breaking it (the Polish Biuro Szyfrów, then Bletchley Park) materially affected the war.
- A foundational case study in cryptanalysis teaching — known-plaintext attacks, search-space reduction, and why keyspace size alone is not security.
- Polish cryptanalysts built the bomba before the British Bombe was developed. The two machines used different methods. [GCHQ’s account of the Pyry Forest meeting](https://www.gchq.gov.uk/sites/default/files/pdfs/publication/the-pyry-forest-meeting.pdf)
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
- [crypto-lab-dead-sea-cipher](https://systemslibrarian.github.io/crypto-lab-dead-sea-cipher/) — compare Enigma’s changing alphabet with three earlier pen-and-paper ciphers.
- [crypto-lab-otp-vault](https://systemslibrarian.github.io/crypto-lab-otp-vault/) — the one cipher with provable secrecy, and the key-reuse mistake that breaks it.
- [crypto-lab-biham-lens](https://systemslibrarian.github.io/crypto-lab-biham-lens/) — modern differential cryptanalysis of a substitution-permutation network.

---

*Part of the [Crypto Lab](https://crypto-lab.systemslibrarian.dev/) suite.*

*"So whether you eat or drink or whatever you do, do it all for the glory of God." — 1 Corinthians 10:31*
