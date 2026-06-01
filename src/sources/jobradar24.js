import fetch from "node-fetch";
import * as cheerio from "cheerio";

const BASE_URL = "https://www.jobradar24.ro";
const SEARCH_URL = `${BASE_URL}/locuri-de-munca/mol`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function extractJobInfoFromDetailPage(html, sourceUrl) {
  const info = {
    title: null,
    company: null,
    location: null,
    description: null,
    linkoutUrl: null,
    workType: null
  };

  const titleMatch = html.match(/<title>([^<]+)<\/title>/);
  if (titleMatch) {
    const titleText = titleMatch[1].replace(/\s*\|\s*Jobradar24\s*$/, '').trim();
    const parts = titleText.split(/\s+in\s+/);
    info.title = parts[0]?.trim() || titleText;
    if (parts[1]) {
      const locMatch = parts[1].match(/^(.*?)\s+(?:la\s+|$)/);
      if (locMatch) {
        info.location = locMatch[1].trim();
      }
    }
  }

  const linkoutMatch = html.match(/"linkout_url":"([^"]+)"/);
  if (linkoutMatch) {
    info.linkoutUrl = linkoutMatch[1].replace(/\\\//g, '/');
  }

  const affiliationMatch = html.match(/"affiliation":"([^"]+)"/);
  if (affiliationMatch) {
    info.company = affiliationMatch[1];
  }

  const locationMatch = html.match(/"location_id":"([^"]+)"/);
  if (locationMatch) {
    info.location = locationMatch[1];
  }

  const workTypeMatch = html.match(/"item_category3":"([^"]+)"/);
  if (workTypeMatch) {
    info.workType = workTypeMatch[1];
  }

  const descriptionMatch = html.match(/"description":"<p><br><\\\/p>\\n\\n<p>([^"]+)/);
  if (descriptionMatch) {
    info.description = descriptionMatch[1].replace(/\\n/g, ' ').replace(/<[^>]+>/g, '');
  }

  const ogDescMatch = html.match(/<meta name="description" content="([^"]+)"/);
  if (!info.description && ogDescMatch) {
    info.description = ogDescMatch[1];
  }

  if (!info.title) {
    const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/);
    if (h1Match) {
      info.title = h1Match[1].trim();
    }
  }

  return info;
}

async function fetchJobDetail(jobUrl) {
  try {
    const res = await fetch(jobUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36"
      }
    });
    if (!res.ok) return null;
    const html = await res.text();
    return extractJobInfoFromDetailPage(html, jobUrl);
  } catch {
    return null;
  }
}

export async function scrapeJobradar24() {
  const allJobs = [];
  const seenUrls = new Set();

  console.log("  Fetching jobs from Jobradar24...");

  try {
    const res = await fetch(SEARCH_URL, {
      headers: {
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36"
      }
    });

    if (!res.ok) {
      console.log(`  Jobradar24 returned ${res.status}`);
      return allJobs;
    }

    const html = await res.text();
    const $ = cheerio.load(html);

    const jobLinks = [];
    $('link[rel="prerender"]').each((_, el) => {
      let href = $(el).attr('href');
      if (href) {
        if (href.startsWith('/')) {
          href = `${BASE_URL}${href}`;
        }
        if (href.includes('/anunt/')) {
          jobLinks.push(href);
        }
      }
    });

    console.log(`  Found ${jobLinks.length} job links on Jobradar24`);

    for (let i = 0; i < jobLinks.length; i++) {
      const jobUrl = jobLinks[i];

      if (seenUrls.has(jobUrl)) continue;
      seenUrls.add(jobUrl);

      const detail = await fetchJobDetail(jobUrl);

      if (!detail) {
        console.log(`    Could not fetch detail for: ${jobUrl}`);
        continue;
      }

      const title = detail.title || 'Unknown Position';
      const company = detail.company || 'MOL Romania';
      const location = detail.location ? [detail.location] : ['România'];

      let workmode = 'on-site';
      const lowerTitle = title.toLowerCase();
      if (lowerTitle.includes('remote')) {
        workmode = 'remote';
      } else if (lowerTitle.includes('hybrid')) {
        workmode = 'hybrid';
      }

      const tags = [];
      if (detail.description) {
        const lowerDesc = detail.description.toLowerCase();
        const skillKeywords = [
          'python', 'java', 'javascript', 'sql', 'power bi', 'excel',
          'sap', 'erp', 'project management', 'leadership',
          'english', 'romanian', 'german', 'hungarian',
          'supply chain', 'logistics', 'procurement',
          'finance', 'accounting', 'audit', 'controlling',
          'marketing', 'sales', 'retail', 'business development',
          'hr', 'human resources', 'recruitment',
          'data analyst', 'analytics', 'category management',
          'bachelor', 'master', 'negotiation', 'communication'
        ];
        for (const skill of skillKeywords) {
          if (lowerDesc.includes(skill) || lowerTitle.includes(skill)) {
            tags.push(skill);
          }
        }
      }

      const url = detail.linkoutUrl || jobUrl;

      allJobs.push({
        url,
        title,
        company: company.toUpperCase(),
        location,
        workmode,
        tags: tags.slice(0, 15),
        description: detail.description?.substring(0, 500) || '',
        source: 'jobradar24',
        status: 'scraped'
      });

      if ((i + 1) % 3 === 0) {
        console.log(`    Processed ${i + 1}/${jobLinks.length} jobs from Jobradar24`);
      }

      await sleep(500);
    }

    console.log(`  Collected ${allJobs.length} jobs from Jobradar24`);
  } catch (err) {
    console.log(`  Error scraping Jobradar24: ${err.message}`);
  }

  return allJobs;
}
