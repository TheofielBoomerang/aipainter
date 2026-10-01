# AI Painter – photobooth concept

Webapp die een foto van je maakt en daar met AI een schilderij van maakt.

**Flow:** Start → aftellen 3-2-1 → foto → wachtfilmpje (terwijl de AI schildert) → schilderij.
Het filmpje speelt minstens één keer helemaal af en loopt door als de AI nog niet klaar is.

## Draaien

```bash
OPENAI_API_KEY=sk-... npm start
# open http://localhost:3000
```

Geen `npm install` nodig: de server gebruikt alleen Node (18+) zelf.

Zonder `OPENAI_API_KEY` werkt de app ook, maar dan met een lokaal olieverf-filter (Kuwahara) in de browser in plaats van AI — handig om de flow te testen.

### Instellingen (env vars)

| Variabele | Standaard | Wat |
|---|---|---|
| `OPENAI_API_KEY` | – | API-key voor de beeld-AI |
| `OPENAI_IMAGE_MODEL` | `gpt-image-1` | Beeldmodel voor de image-edit API |
| `PAINT_PROMPT` | olieverf-prompt | Stijl van het schilderij |
| `PORT` | `3000` | Poort |

## Online zetten

De camera werkt in de browser alleen via **https** (of `localhost`). Zet het dus op een host met https, bijvoorbeeld Render, Railway of Fly.io: start-commando `npm start`, en stel `OPENAI_API_KEY` in als environment variable.

## Bestanden

- `server.js` – statische server + `/api/paint` (stuurt de foto naar de AI)
- `public/index.html`, `style.css`, `app.js` – de photobooth
- `public/wachtfilmpje.mp4` – het filmpje tijdens het wachten
