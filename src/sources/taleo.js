import fetch from "node-fetch";
import puppeteer from "puppeteer";

const TALEO_BASE = "https://molgroup.taleo.net";
const TALEO_PORTAL = "8205100397";
const ROMANIA_LOCATION_ID = "4505100397";

const SKILL_KEYWORDS = [
  'python', 'java', 'javascript', 'js', 'typescript', 'c++', 'c#', 'ruby', 'go', 'rust',
  'sql', 'nosql', 'mongodb', 'postgresql', 'mysql', 'oracle', 'redis', 'elasticsearch',
  'react', 'angular', 'vue', 'node', 'nodejs', 'nextjs', 'express',
  'aws', 'azure', 'gcp', 'docker', 'kubernetes', 'k8s', 'terraform', 'ansible',
  'git', 'github', 'gitlab', 'jenkins', 'ci/cd', 'devops', 'agile', 'scrum',
  'machine learning', 'ai', 'data science', 'deep learning', 'tensorflow', 'pytorch', 'nlp',
  'html', 'css', 'sass', 'less', 'bootstrap', 'tailwind',
  'rest', 'api', 'graphql', 'microservices', 'spring', 'django', 'flask', 'fastapi',
  'power bi', 'tableau', 'excel', 'statistics', 'analytics', 'etl', 'data warehouse',
  'sap', 'erp', 'crm', 'salesforce', 'dynamics',
  'project management', 'leadership', 'team management', 'communication',
  'english', 'german', 'french', 'hungarian', 'romanian',
  'supply chain', 'logistics', 'procurement', 'planning', 'forecasting',
  'finance', 'accounting', 'controlling', 'audit',
  'marketing', 'sales', 'retail', 'business development',
  'hr', 'human resources', 'recruitment', 'training',
  'security', 'compliance', 'risk management',
  'bachelor', 'master', 'mba', 'education',
  'internship', 'trainee', 'student', 'junior', 'senior',
  'planning', 'forecast', 'replenishment', 'space planning',
  'investigation', 'compliance', 'security',
  'loyalty', 'program', 'marketing',
  'data analyst', 'research', 'insights',
  'hrbp', 'compensation', 'benefits',
  'space planning', 'planogram', 'category management'
];

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

export async function closeBrowser() {
  if (browser) {
    await browser.close();
    browser = null;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function extractTagsFromText(text, title) {
  const tags = new Set();
  const lowerText = text.toLowerCase();
  const lowerTitle = title.toLowerCase();

  for (const skill of SKILL_KEYWORDS) {
    if (lowerTitle.includes(skill) || lowerText.includes(skill)) {
      tags.add(skill.toLowerCase());
    }
  }

  const yearMatches = lowerText.match(/(\d+)-(\d+)\s*ani/gi) || lowerText.match(/minimum\s*(\d+)\s*years/gi);
  if (yearMatches) {
    yearMatches.forEach(m => {
      const years = m.match(/(\d+)/g);
      if (years) tags.add(`${years[0]}-ani`);
    });
  }

  if (lowerText.includes('bachelor')) tags.add('bachelor');
  if (lowerText.includes('master')) tags.add('master');
  if (lowerText.includes('internship')) tags.add('internship');
  if (lowerText.includes('part-time') || lowerText.includes('part time')) tags.add('part-time');
  if (lowerText.includes('remote')) tags.add('remote');
  if (lowerText.includes('hybrid')) tags.add('hybrid');

  const salaryMatch = lowerText.match(/(\d{3,4})\s*-\s*(\d{3,4})\s*(ron|eur|lei)/i);

  return {
    tags: Array.from(tags).slice(0, 20),
    salary: salaryMatch ? `${salaryMatch[1]}-${salaryMatch[2]} ${salaryMatch[3].toUpperCase()}` : undefined
  };
}

async function fetchJobDetailWithPuppeteer(jobId) {
  const url = `${TALEO_BASE}/careersection/external/jobdetail.ftl?job=${jobId}`;
  let page = null;

  try {
    const b = await getBrowser();
    page = await b.newPage();
    await page.goto(url, { timeout: 20000 });
    await new Promise(r => setTimeout(r, 4000));

    const text = await page.evaluate(() => document.body.innerText());
    const title = await page.evaluate(() => {
      const h1 = document.querySelector('h1');
      return h1 ? h1.innerText : '';
    });

    await page.close();

    return { text, title, url, isExpired: text.includes('no longer available') || text.includes('404') };
  } catch (err) {
    if (page) await page.close();
    return { text: '', title: '', url, isExpired: true, error: err.message };
  }
}

async function fetchJobsPage() {
  const url = `${TALEO_BASE}/careersection/rest/jobboard/searchjobs?lang=en&portal=${TALEO_PORTAL}`;

  const postData = {
    multilineEnabled: false,
    sortingSelection: {
      sortBySelectionParam: "3",
      ascendingSortingOrder: "false"
    },
    fieldData: {
      fields: {
        KEYWORD: "",
        LOCATION: ROMANIA_LOCATION_ID,
        ORGANIZATION: ""
      },
      valid: true
    },
    filterSelectionParam: {
      searchFilterSelections: [
        { id: "LOCATION", selectedValues: [] },
        { id: "JOB_FIELD", selectedValues: [] },
        { id: "JOB_SCHEDULE", selectedValues: [] },
        { id: "ORGANIZATION", selectedValues: [] }
      ]
    },
    advancedSearchFiltersSelectionParam: {
      searchFilterSelections: [
        { id: "LOCATION", selectedValues: [] },
        { id: "JOB_FIELD", selectedValues: [] },
        { id: "JOB_LEVEL", selectedValues: [] },
        { id: "JOB_TYPE", selectedValues: [] },
        { id: "JOB_NUMBER", selectedValues: [] }
      ]
    },
    pageNo: 1
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "application/json, text/javascript, */*; q=0.01",
      "Content-Type": "application/json",
      "Origin": TALEO_BASE,
      "Referer": `${TALEO_BASE}/careersection/external/jobsearch.ftl?lang=en`,
      "X-Requested-With": "XMLHttpRequest",
      "tz": "GMT+03:00",
      "tzname": "Europe/Bucharest"
    },
    body: JSON.stringify(postData)
  });

  if (!res.ok) {
    throw new Error(`Taleo API error ${res.status}`);
  }

  const data = await res.json();
  return data;
}

export function parseApiJobs(apiData) {
  const requisitions = apiData.requisitionList || [];
  const totalCount = apiData.pagingData?.totalCount || 0;

  return {
    jobs: requisitions.map(req => {
      const jobId = req.jobId;
      const contestNo = req.contestNo;
      const title = req.column[0];
      const locationStr = req.column[1];
      const postedDate = req.column[2];

      let workmode = "hybrid";
      if (title.toLowerCase().includes("remote")) {
        workmode = "remote";
      } else if (title.toLowerCase().includes("on-site") || title.toLowerCase().includes("office")) {
        workmode = "on-site";
      }

      let location = ["România"];
      try {
        const locArray = JSON.parse(locationStr);
        location = locArray.map(l => l.replace("Romania-", "").trim());
      } catch {
        if (locationStr.includes("Bucuresti") || locationStr.includes("Bucharest")) {
          location = ["București"];
        } else if (locationStr.includes("Cluj")) {
          location = ["Cluj-Napoca"];
        }
      }

      const url = `${TALEO_BASE}/careersection/external/jobdetail.ftl?job=${jobId}`;

      return {
        url,
        title,
        uid: contestNo,
        jobId,
        workmode,
        location,
        tags: [],
        postedDate,
        source: "taleo"
      };
    }),
    total: totalCount
  };
}

export async function scrapeTaleo(testOnlyOnePage = false) {
  const allJobs = [];
  const seenUrls = new Set();

  console.log("  Fetching jobs from Taleo API (MOL Group)...");
  try {
    const data = await fetchJobsPage();
    const result = parseApiJobs(data);
    const jobs = result.jobs;

    console.log(`  Total jobs on Taleo: ${result.total}`);

    let newJobs = 0;
    for (const job of jobs) {
      if (!seenUrls.has(job.url)) {
        job.tags = [];
        job.salary = undefined;
        job.status = 'scraped';

        if (job.jobId) {
          const detail = await fetchJobDetailWithPuppeteer(job.jobId);
          if (detail && !detail.isExpired && detail.text) {
            const extracted = extractTagsFromText(detail.text, job.title);
            job.tags = extracted.tags;
            job.salary = extracted.salary;
            job.status = 'verified';
          } else if (detail && detail.isExpired) {
            console.log(`    Job ${job.jobId} is EXPIRED - skipping`);
            continue;
          }
        }

        seenUrls.add(job.url);
        allJobs.push(job);
        newJobs++;

        if (newJobs % 5 === 0) {
          console.log(`    Processed ${newJobs}/${jobs.length} jobs...`);
        }

        await sleep(300);
      }
    }
    console.log(`  Collected ${allJobs.length} unique jobs from Taleo`);

    if (testOnlyOnePage) {
      console.log("  Test mode: stopping after first fetch.");
    }
  } catch (err) {
    console.log(`  Error fetching Taleo jobs: ${err.message}`);
  }

  return allJobs;
}
