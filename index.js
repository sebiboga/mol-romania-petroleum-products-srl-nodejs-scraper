/**
 * MOL Romania Job Scraper - Main Entry Point
 * 
 * PURPOSE: Scrapes job listings from MOL Romania careers (Taleo REST API) and stores them in Solr.
 * This is the primary orchestrator that coordinates company validation, job scraping,
 * data transformation, and Solr storage.
 * 
 * Source: https://molgroup.taleo.net/careersection/rest/jobboard/searchjobs
 */

import fetch from "node-fetch";
import fs from "fs";
import { fileURLToPath } from "url";
import { validateAndGetCompany } from "./company.js";
import { querySOLR, deleteJobByUrl, upsertJobs } from "./solr.js";

const COMPANY_CIF = "7745470";
const TALEO_BASE = "https://molgroup.taleo.net";
const TALEO_PORTAL = "8205100397";
const ROMANIA_LOCATION_ID = "4505100397";

let COMPANY_NAME = null;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
  'sap', 'erp', 'crm', 'salesforce', ' dynamics',
  'project management', 'leadership', 'team management', 'communication',
  'english', 'german', 'french', 'hungarian', 'romanian',
  'supply chain', 'logistics', 'procurement', 'planning', 'forecasting',
  'finance', 'accounting', 'controlling', 'audit',
  'marketing', 'sales', 'retail', 'business development',
  'hr', 'human resources', 'recruitment', 'training',
  'security', 'compliance', 'risk management',
  'bachelor', 'master', 'mba', 'education'
];

async function fetchJobDetail(jobId) {
  const url = `${TALEO_BASE}/careersection/external/jobdetail.ftl?job=${jobId}`;
  
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36",
        "Accept": "text/html,application/xhtml+xml",
        "Referer": `${TALEO_BASE}/careersection/external/jobsearch.ftl?lang=en`
      }
    });
    
    if (!res.ok) return null;
    
    const html = await res.text();
    return html;
  } catch (err) {
    console.log(`Error fetching job ${jobId}: ${err.message}`);
    return null;
  }
}

function extractTagsFromHtml(html, title) {
  const tags = new Set();
  const lowerHtml = html.toLowerCase();
  const lowerTitle = title.toLowerCase();
  
  for (const skill of SKILL_KEYWORDS) {
    if (lowerTitle.includes(skill) || lowerHtml.includes(skill)) {
      tags.add(skill.toLowerCase());
    }
  }
  
  return Array.from(tags).slice(0, 20);
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
    throw new Error(`API error ${res.status}`);
  }
  
  const data = await res.json();
  return data;
}

function parseApiJobs(apiData) {
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
      
      const tags = [];
      
      return {
        url,
        title,
        uid: contestNo,
        jobId,
        workmode,
        location,
        tags,
        postedDate
      };
    }),
    total: totalCount
  };
}

async function scrapeAllListings(testOnlyOnePage = false) {
  const allJobs = [];
  const seenUrls = new Set();

  console.log("Fetching jobs from MOL Romania Taleo API...");
  try {
    const data = await fetchJobsPage();
    const result = parseApiJobs(data);
    const jobs = result.jobs;

    console.log(`Total jobs on site: ${result.total}`);
    console.log("Fetching job details to extract tags...");

    let newJobs = 0;
    for (const job of jobs) {
      if (!seenUrls.has(job.url)) {
        job.tags = [];
        
        if (job.jobId) {
          const detailHtml = await fetchJobDetail(job.jobId);
          if (detailHtml) {
            job.tags = extractTagsFromHtml(detailHtml, job.title);
          }
        }
        
        seenUrls.add(job.url);
        allJobs.push(job);
        newJobs++;
        
        if (newJobs % 5 === 0) {
          console.log(`  Processed ${newJobs}/${jobs.length} jobs...`);
        }
        
        await sleep(300);
      }
    }
    console.log(`Collected ${allJobs.length} unique jobs with tags`);

    if (testOnlyOnePage) {
      console.log("Test mode: stopping after first fetch.");
    }
  } catch (err) {
    console.log(`Error fetching jobs: ${err.message}`);
  }

  console.log(`Total unique jobs collected: ${allJobs.length}`);
  return allJobs;
}

function mapToJobModel(rawJob, cif, companyName = COMPANY_NAME) {
  const now = new Date().toISOString();

  const job = {
    url: rawJob.url,
    title: rawJob.title?.trim().substring(0, 200),
    company: companyName,
    cif: cif,
    location: rawJob.location?.length > 0 ? rawJob.location : undefined,
    tags: rawJob.tags?.length > 0 ? rawJob.tags : undefined,
    workmode: rawJob.workmode || undefined,
    date: now,
    status: "scraped"
  };

  Object.keys(job).forEach((k) => job[k] === undefined && delete job[k]);

  return job;
}

function transformJobsForSOLR(payload) {
  const romanianCities = [
    'Bucharest', 'București', 'Cluj-Napoca', 'Cluj Napoca',
    'Timișoara', 'Timisoara', 'Iași', 'Iasi', 'Brașov', 'Brasov',
    'Constanța', 'Constanta', 'Craiova', 'Bacău', 'Sibiu',
    'Târgu Mureș', 'Targu Mures', 'Oradea', 'Baia Mare', 'Satu Mare',
    'Ploiești', 'Ploiesti', 'Pitești', 'Pitesti', 'Arad', 'Galați', 'Galati',
    'Brăila', 'Braila', 'Drobeta-Turnu Severin', 'Râmnicu Vâlcea', 'Ramnicu Valcea',
    'Buzău', 'Buzau', 'Botoșani', 'Botosani', 'Zalău', 'Zalau', 'Hunedoara', 'Deva',
    'Suceava', 'Bistrița', 'Bistrita', 'Tulcea', 'Călărași', 'Calarasi',
    'Giurgiu', 'Alba Iulia', 'Slatina', 'Piatra Neamț', 'Piatra Neamt', 'Roman',
    'Dumbrăvița', 'Dumbravita', 'Voluntari', 'Popești-Leordeni', 'Popesti-Leordeni',
    'Chitila', 'Mogoșoaia', 'Mogosoaia', 'Otopeni'
  ];

  const citySet = new Set(romanianCities.map(c => c.toLowerCase()));

  const normalizeWorkmode = (wm) => {
    if (!wm) return undefined;
    const lower = wm.toLowerCase();
    if (lower.includes('remote')) return 'remote';
    if (lower.includes('office') || lower.includes('on-site') || lower.includes('site')) return 'on-site';
    return 'hybrid';
  };

  const transformed = {
    ...payload,
    company: payload.company?.toUpperCase(),
    jobs: payload.jobs.map(job => {
      const validLocations = (job.location || []).filter(loc => {
        const lower = loc.toLowerCase().trim();
        if (lower === 'romania' || lower === 'românia') return true;
        return citySet.has(lower);
      }).map(loc => loc.toLowerCase() === 'romania' ? 'România' : loc);

      return {
        ...job,
        location: validLocations.length > 0 ? validLocations : ['România'],
        workmode: normalizeWorkmode(job.workmode)
      };
    })
  };

  return transformed;
}

async function main() {
  const testOnlyOnePage = process.argv.includes("--test");
  
  try {
    console.log("=== Step 1: Get existing jobs count ===");
    const existingResult = await querySOLR(COMPANY_CIF);
    const existingCount = existingResult.numFound;
    console.log(`Found ${existingCount} existing jobs in SOLR`);
    console.log("(Keeping existing jobs - will upsert MOL Romania jobs only)");

    console.log("=== Step 2: Validate company via ANAF ===");
    const { company, cif } = await validateAndGetCompany();
    COMPANY_NAME = company;
    const localCif = cif;
    
    const rawJobs = await scrapeAllListings(testOnlyOnePage);
    const scrapedCount = rawJobs.length;
    console.log(`📊 Jobs scraped from MOL Romania careers: ${scrapedCount}`);

    const jobs = rawJobs.map(job => mapToJobModel(job, localCif));

    const payload = {
      source: "molromania.ro",
      scrapedAt: new Date().toISOString(),
      company: COMPANY_NAME,
      cif: localCif,
      jobs
    };

    console.log("Transforming jobs for SOLR...");
    const transformedPayload = transformJobsForSOLR(payload);
    const validCount = transformedPayload.jobs.filter(j => j.location).length;
    console.log(`📊 Jobs with valid Romanian locations: ${validCount}`);

    fs.writeFileSync("jobs.json", JSON.stringify(transformedPayload, null, 2), "utf-8");
    console.log("Saved jobs.json");

    console.log("\n=== Step 4: Upsert jobs to SOLR ===");
    await upsertJobs(transformedPayload.jobs);

    const finalResult = await querySOLR(COMPANY_CIF);
    console.log(`\n📊 === SUMMARY ===`);
    console.log(`📊 Jobs existing in SOLR before scrape: ${existingCount}`);
    console.log(`📊 Jobs scraped from MOL Romania: ${scrapedCount}`);
    console.log(`📊 Jobs in SOLR after scrape: ${finalResult.numFound}`);
    console.log(`====================`);

    console.log("\n=== DONE ===");
    console.log("Scraper completed successfully!");

  } catch (err) {
    console.error("Scraper failed:", err);
    process.exit(1);
  }
}

export { parseApiJobs, mapToJobModel, transformJobsForSOLR };

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}