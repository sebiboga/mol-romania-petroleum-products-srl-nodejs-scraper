# FROM-EPAM.md — MOL ↔ EPAM Sync Relationship

Acest document explică relația dintre repo-urile scraper:

- **EPAM** — [`epam-systems-international-srl-nodejs-scraper`](https://github.com/sebiboga/epam-systems-international-srl-nodejs-scraper) — șablonul principal
- **MOL** — [`mol-romania-petroleum-products-srl-nodejs-scraper`](https://github.com/sebiboga/mol-romania-petroleum-products-srl-nodejs-scraper) — repo derivat

## Scop

Repo-ul EPAM conține șablonul de referință pentru structură, configurare și bune practici.
MOL este derivat din EPAM și ar trebui să rămână sincronizat.

Pentru lista completă de verificare, vezi [SYNC-CHECKLIST.md](SYNC-CHECKLIST.md).

## Diferențe cunoscute

| Aspect | EPAM | MOL |
|--------|------|-----|
| CIF | `33159615` | `7745470` |
| Company | `EPAM SYSTEMS INTERNATIONAL SRL` | `MOL ROMANIA PETROLEUM PRODUCTS SRL` |
| Sursă job-uri | API JSON (careers.epam.com) | Taleo REST API (molgroup.taleo.net) |
| `src/anaf.js` | Da (modular) | Da (modular, sincronizat) |
| Puppeteer | Nu (API JSON direct) | Da (pentru detalii job) |
