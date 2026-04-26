# Cum să scrapezi pagini JavaScript (Taleo)

## Problema

Taleo și alte site-uri folosesc JavaScript pentru a încărca conținutul. curl/wget nu funcționează - pagina apare goală.

## Soluția: Puppeteer + Headless Chrome

```bash
npm install puppeteer
```

## Folosire în scraper

```javascript
import puppeteer from "puppeteer";

let browser = null;

async function getBrowser() {
  if (!browser) {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
  }
  return browser;
}

async function fetchJobDetailWithPuppeteer(jobId) {
  const b = await getBrowser();
  const page = await b.newPage();
  
  await page.goto(url, { timeout: 20000 });
  await new Promise(r => setTimeout(r, 4000)); // Așteaptă JS să încarce
  
  const text = await page.evaluate(() => document.body.innerText());
  
  return { text, isExpired: text.includes('no longer available') };
}
```

## GitHub Actions

```yaml
- name: Install Chrome for Puppeteer
  run: |
    sudo apt-get update
    wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | sudo gpg --dearmor -o /usr/share/keyrings/google-chrome.gpg
    echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google-chrome.gpg] http://dl.google.com/linux/chrome/deb stable main" | sudo tee /etc/apt/sources.list.d/google-chrome.list
    sudo apt-get update
    sudo apt-get install -y google-chrome-stable
```

## Extragere tags + salary

```javascript
function extractTagsFromText(text, title) {
  const tags = new Set();
  const lowerText = text.toLowerCase();
  
  const SKILL_KEYWORDS = [...];
  
  for (const skill of SKILL_KEYWORDS) {
    if (lowerText.includes(skill)) {
      tags.add(skill.toLowerCase());
    }
  }
  
  // Extrage ani experiență
  const yearMatches = lowerText.match(/(\d+)-(\d+)\s*ani/gi);
  if (yearMatches) tags.add('3-ani');
  
  // Extrage salariu
  const salaryMatch = lowerText.match(/(\d{3,4})\s*-\s*(\d{3,4})\s*(ron|eur)/i);
  const salary = salaryMatch ? `${salaryMatch[1]}-${salaryMatch[2]} ${salaryMatch[3].toUpperCase()}` : undefined;
  
  return { tags: Array.from(tags).slice(0, 20), salary };
}
```

## Note

- Taleo/Taleo Cloud necesită JavaScript rendering
- webfetch/API fetch returnează doar HTML static
- Puppeteer execută JS și așteaptă să se încarce
- Verifică "no longer available" pentru job-uri expirate