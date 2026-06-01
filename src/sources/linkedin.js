import puppeteer from "puppeteer";

const LINKEDIN_SEARCH_URL = "https://www.linkedin.com/jobs/search/?keywords=MOL%20Romania&location=Romania&f_TPR=r604800";

let browser = null;

async function getBrowser() {
  if (!browser) {
    const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium';
    browser = await puppeteer.launch({
      headless: true,
      executablePath,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
  }
  return browser;
}

export async function closeBrowser() {
  if (browser) {
    await browser.close();
    browser = null;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function scrapeLinkedIn() {
  const allJobs = [];
  const seenUrls = new Set();

  console.log("  Fetching jobs from LinkedIn...");

  let page = null;
  try {
    const b = await getBrowser();
    page = await b.newPage();
    await page.setUserAgent("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");

    await page.goto(LINKEDIN_SEARCH_URL, { timeout: 30000, waitUntil: 'networkidle2' });
    await sleep(3000);

    const pageText = await page.evaluate(() => document.body.innerText);

    const jobCards = await page.evaluate(() => {
      const cards = document.querySelectorAll('.job-card-container, .jobs-search-results__list-item, .base-card, [data-job-id]');
      const results = [];
      cards.forEach(card => {
        const titleEl = card.querySelector('.job-card-list__title, .base-search-card__title, a[data-anonymize="job-title"]');
        const companyEl = card.querySelector('.job-card-container__company-name, .base-search-card__subtitle, .artdeco-entity-lockup__subtitle');
        const locationEl = card.querySelector('.job-card-container__metadata-wrapper, .job-search-card__location, .base-search-card__metadata');
        const linkEl = card.querySelector('a[data-anonymize="job-title"], a.base-card__full-link, a.job-card-list__title');

        const title = titleEl?.innerText?.trim();
        const company = companyEl?.innerText?.trim();
        const location = locationEl?.innerText?.trim();
        const url = linkEl?.href;

        if (title && url) {
          results.push({ title, company, location, url });
        }
      });
      return results;
    });

    console.log(`  Found ${jobCards.length} job cards on LinkedIn page`);

    for (const card of jobCards) {
      if (seenUrls.has(card.url)) continue;
      seenUrls.add(card.url);

      let workmode = 'on-site';
      const lowerTitle = card.title?.toLowerCase() || '';
      if (lowerTitle.includes('remote')) {
        workmode = 'remote';
      } else if (lowerTitle.includes('hybrid') || lowerTitle.includes('mix')) {
        workmode = 'hybrid';
      }

      let location = ['România'];
      if (card.location) {
        const loc = card.location.replace(/^Romania\s*/, '').trim();
        if (loc && loc !== 'Romania') {
          location = [loc];
        }
      }

      const company = card.company || 'MOL Romania';

      allJobs.push({
        url: card.url,
        title: card.title || 'Unknown Position',
        company: company.toUpperCase(),
        location,
        workmode,
        tags: [],
        description: '',
        source: 'linkedin',
        status: 'scraped'
      });
    }

    console.log(`  Collected ${allJobs.length} jobs from LinkedIn`);

  } catch (err) {
    console.log(`  Error scraping LinkedIn: ${err.message}`);
  } finally {
    if (page) await page.close();
  }

  return allJobs;
}
