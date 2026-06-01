# Robots.txt Analysis — MOL Romania Careers (Taleo)

Sursa: https://molgroup.taleo.net/robots.txt (nu există — 404)

## Constatare

Platforma Taleo (Oracle Cloud) nu publică un fișier `robots.txt` la nivelul
subdomeniului `molgroup.taleo.net`. În lipsa unui robots.txt, nu există
restricții explicite pentru crawler-e.

## Comportament scraper

| Acțiune | Detalii |
|---------|---------|
| API REST (Taleo) | POST către `/careersection/rest/jobboard/searchjobs` — API public, fără autentificare |
| Pagini individuale job | Accesate cu Puppeteer pentru detalii — o singură cerere per job, delay 300ms |
| Pagini de aplicare | NU sunt accesate |
| User-Agent | `job_seeker_ro_spider` (identificabil) |
| Rate limiting | 1s delay între pagini, 300ms între detalii job |

## Recomandare

- API-ul Taleo este public și nu necesită autentificare
- Comportamentul scraperului este rezonabil și non-agresiv
- Se recomandă monitorizarea eventualelor schimbări în API
- Risc minim
