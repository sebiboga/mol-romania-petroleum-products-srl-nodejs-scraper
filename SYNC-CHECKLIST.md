# SYNC-CHECKLIST.md — Verificare sincronizare cu EPAM

Când EPAM (șablonul principal) primește actualizări, verifică dacă acestea
trebuie propagate în MOL. Vezi [FROM-EPAM.md](FROM-EPAM.md) pentru context.

## Checklist

- [ ] `AGENTS.md` — reguli AI, comenzi test, structură module
- [ ] `ISSUES.md` — proces contribuție, reguli issue
- [ ] `CONTRIBUTING.md` — ghid contribuție
- [ ] `SECURITY.md` — politici securitate
- [ ] `ROBOTS.md` — analiză robots.txt (specific sursei)
- [ ] `TOPICS.md` — topic-uri GitHub About
- [ ] `UPDATE-REPO-ABOUT.md` — ghid actualizare About
- [ ] `src/anaf.js` — modul ANAF modular
- [ ] `validate-jobs.js` — validator URL-uri job
- [ ] `tests/validate-mol-jobs.js` — validator specific MOL
- [ ] `tests/unit/` — teste unitare
- [ ] `tests/integration/` — teste integrare
- [ ] `tests/e2e/` — teste end-to-end
- [ ] `.github/workflows/scrape.yml` — workflow scrape zilnic
- [ ] `.github/workflows/test.yml` — workflow testare automată
- [ ] `.github/workflows/deploy.yml` — deploy GitHub Pages
- [ ] `.github/CODEOWNERS` — code owners
- [ ] `README.md` — badge-uri, features, structură proiect
- [ ] `package.json` — scripts, jest config
- [ ] `.gitignore` — fișiere ignorate
- [ ] `company.json` — date companie (CIF, nume)
- [ ] `UPDATE-REPO-ABOUT.md` — descriere, website, topics

## Cum se sincronizează

1. Verifică `git log` în EPAM pentru commit-uri noi
2. Pentru fiecare fișier din checklist, compară între EPAM și MOL
3. Dacă diferența e doar de configurare (CIF, nume companie, URL sursă),
   aplică modificarea în MOL
4. Dacă e o schimbare structurală, adaptează pentru specificul MOL
5. Rulează `npm test` înainte de commit
