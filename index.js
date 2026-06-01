import fetch from "node-fetch";
import fs from "fs";
import { fileURLToPath } from "url";
import { validateAndGetCompany } from "./company.js";
import { querySOLR, deleteJobByUrl, upsertJobs, upsertCompany } from "./solr.js";
import { scrapeTaleo, closeBrowser as closeTaleoBrowser } from "./src/sources/taleo.js";
import { scrapeJobradar24 } from "./src/sources/jobradar24.js";
import { scrapeLinkedIn, closeBrowser as closeLinkedInBrowser } from "./src/sources/linkedin.js";

const COMPANY_CIF = "7745470";

let COMPANY_NAME = null;

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
  'Chitila', 'Mogoșoaia', 'Mogosoaia', 'Otopeni', 'Făgăraș', 'Fagaras'
];

const citySet = new Set(romanianCities.map(c => c.toLowerCase()));

function mapToJobModel(rawJob, cif, companyName = COMPANY_NAME) {
  const now = new Date().toISOString();

  const job = {
    url: rawJob.url,
    title: (rawJob.title || '').trim().substring(0, 200),
    company: companyName,
    cif: cif,
    location: rawJob.location?.length > 0 ? rawJob.location : undefined,
    tags: rawJob.tags?.length > 0 ? rawJob.tags : undefined,
    workmode: rawJob.workmode || undefined,
    salary: rawJob.salary || undefined,
    date: now,
    status: rawJob.status || "scraped",
    source: rawJob.source || "unknown"
  };

  Object.keys(job).forEach((k) => job[k] === undefined && delete job[k]);

  return job;
}

function transformJobsForSOLR(payload) {
  const normalizeWorkmode = (wm) => {
    if (!wm) return undefined;
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
        workmode: normalizeWorkmode(job.workmode),
        company: payload.company?.toUpperCase()
      };
    })
  };

  return transformed;
}

function deduplicateJobs(jobs) {
  const seen = new Set();
  return jobs.filter(job => {
    const key = job.url;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function scrapeAllSources(testOnlyOnePage = false) {
  const allJobs = [];

  const taleoJobs = await scrapeTaleo(testOnlyOnePage);
  allJobs.push(...taleoJobs);

  const jobradarJobs = await scrapeJobradar24();
  allJobs.push(...jobradarJobs);

  const linkedinJobs = await scrapeLinkedIn();
  allJobs.push(...linkedinJobs);

  const uniqueJobs = deduplicateJobs(allJobs);
  const dupesRemoved = allJobs.length - uniqueJobs.length;
  if (dupesRemoved > 0) {
    console.log(`  Removed ${dupesRemoved} duplicate jobs across sources`);
  }

  return uniqueJobs;
}

async function main() {
  const testOnlyOnePage = process.argv.includes("--test");

  try {
    console.log("=== Step 1: Get existing jobs count ===");
    const existingResult = await querySOLR(COMPANY_CIF);
    const existingCount = existingResult.numFound;
    console.log(`Found ${existingCount} existing jobs in SOLR`);

    console.log("=== Step 2: Validate company via ANAF ===");
    const { company, cif } = await validateAndGetCompany();
    COMPANY_NAME = company;
    const localCif = cif;

    try {
      await upsertCompany({
        id: cif,
        company,
        brand: "MOL",
        status: "activ",
        location: ["Cluj-Napoca"],
        website: ["https://www.molromania.ro"],
        career: ["https://molgroup.taleo.net/careersection/external/jobsearch.ftl?lang=en"],
        lastScraped: new Date().toISOString().split('T')[0],
        scraperFile: "https://raw.githubusercontent.com/sebiboga/mol-romania-petroleum-products-srl-nodejs-scraper/master/.github/workflows/scrape.yml"
      });
    } catch (err) {
      console.log(`Note: Could not upsert company to SOLR core: ${err.message}`);
    }

    console.log("=== Step 3: Scrape jobs from all sources ===");
    const rawJobs = await scrapeAllSources(testOnlyOnePage);
    const scrapedCount = rawJobs.length;

    const jobs = rawJobs.map(job => mapToJobModel(job, localCif));

    const payload = {
      source: "molromania.ro",
      scrapedAt: new Date().toISOString(),
      company: COMPANY_NAME,
      cif: localCif,
      jobs
    };

    console.log(`\n📊 === SCRAPING SUMMARY ===`);
    console.log(`📊 Total unique jobs scraped: ${scrapedCount}`);
    console.log(`📊 Breakdown by source:`);
    const sourceCounts = {};
    for (const job of rawJobs) {
      sourceCounts[job.source] = (sourceCounts[job.source] || 0) + 1;
    }
    for (const [source, count] of Object.entries(sourceCounts)) {
      console.log(`📊   ${source}: ${count}`);
    }

    console.log("Transforming jobs for SOLR...");
    const transformedPayload = transformJobsForSOLR(payload);
    const validCount = transformedPayload.jobs.filter(j => j.location).length;
    console.log(`📊 Jobs with valid Romanian locations: ${validCount}`);

    fs.writeFileSync("jobs.json", JSON.stringify(transformedPayload, null, 2), "utf-8");
    console.log("Saved jobs.json");

    console.log("\n=== Step 4: Upsert jobs to SOLR ===");
    await upsertJobs(transformedPayload.jobs);

    const finalResult = await querySOLR(COMPANY_CIF);
    console.log(`\n📊 === FINAL SUMMARY ===`);
    console.log(`📊 Jobs existing in SOLR before scrape: ${existingCount}`);
    console.log(`📊 Total unique jobs scraped: ${scrapedCount}`);
    console.log(`📊 Jobs in SOLR after scrape: ${finalResult.numFound}`);
    console.log(`=======================`);

    console.log("\n=== DONE ===");
    console.log("Scraper completed successfully!");

  } catch (err) {
    console.error("Scraper failed:", err);
    process.exit(1);
  }
}

export { mapToJobModel, transformJobsForSOLR, main as run };

async function closeAllBrowsers() {
  await closeTaleoBrowser();
  await closeLinkedInBrowser();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().then(() => closeAllBrowsers()).catch(async err => {
    console.error("Scraper failed:", err);
    await closeAllBrowsers();
    process.exit(1);
  });
}
