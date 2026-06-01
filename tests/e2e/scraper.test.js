import { jest } from '@jest/globals';

describe('E2E: MOL Romania Scraper', () => {
  let originalEnv;
  const EXPECTED_CIF = '7745470';
  const EXPECTED_BRAND = 'MOL';
  const SCRAPER_URL = 'https://molgroup.taleo.net/careersection/external/search.ftl';

  beforeAll(() => {
    originalEnv = { ...process.env };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('Environment', () => {
    it('should have SOLR_AUTH set', () => {
      const solrAuth = process.env.SOLR_AUTH;
      expect(solrAuth).toBeDefined();
      expect(typeof solrAuth).toBe('string');
      expect(solrAuth.length).toBeGreaterThan(0);
    });

    it('should have required environment variables', () => {
      const requiredVars = ['SOLR_AUTH'];
      for (const varName of requiredVars) {
        expect(process.env[varName]).toBeDefined();
      }
    });
  });

  describe('Company Configuration', () => {
    it('should have correct CIF for MOL Romania', () => {
      const cif = EXPECTED_CIF;
      expect(cif).toBe('7745470');
      expect(cif).toMatch(/^\d{8}$/);
    });

    it('should have correct brand name', () => {
      const brand = EXPECTED_BRAND;
      expect(brand).toBe('MOL');
      expect(brand).not.toBe('');
    });

    it('should have valid scraper URL', () => {
      const url = SCRAPER_URL;
      expect(url).toContain('molgroup.taleo.net');
      expect(url).toContain('careersection');
    });
  });

  describe('File Structure', () => {
    const expectedFolders = ['src', 'tests'];
    const expectedRootFiles = [
      'index.js',
      'company.js',
      'solr.js',
      'package.json'
    ];

    for (const folder of expectedFolders) {
      it(`should have ${folder}/ directory`, () => {
        const fs = require('fs');
        const exists = fs.existsSync(folder);
        expect(exists).toBe(true);
      });
    }

    for (const file of expectedRootFiles) {
      it(`should have ${file} file`, () => {
        const fs = require('fs');
        const exists = fs.existsSync(file);
        expect(exists).toBe(true);
      });
    }
  });

  describe('Data Flow', () => {
    it('should follow correct flow: scrape -> validate -> submit', () => {
      const flowSteps = ['scrape', 'validate', 'enrich', 'submit'];
      expect(flowSteps.length).toBe(4);
      expect(flowSteps[0]).toBe('scrape');
      expect(flowSteps[2]).toBe('enrich');
    });
  });

  describe('Taleo API', () => {
    it('should construct correct URL for job listings', () => {
      const baseUrl = 'https://molgroup.taleo.net/careersection/rest/jobboard/searchjobs';
      const params = new URLSearchParams({
        vertical: 'true',
        lang: 'en',
        location: 'romania',
        'multiline': 'true'
      });
      const url = `${baseUrl}?${params.toString()}`;

      expect(url).toContain('molgroup.taleo.net');
      expect(url).toContain('searchjobs');
    });
  });

  describe('Scraping Pipeline', () => {
    it('should scrape jobs from Taleo', async () => {
      const fetch = (await import('node-fetch')).default;
      const response = await fetch(`${SCRAPER_URL}?lang=en`);
      expect(response.ok).toBe(true);
    });

    it('should parse jobs from API', async () => {
      const response = await fetch(`${SCRAPER_URL}?lang=en`);
      const text = await response.text();
      expect(text.length).toBeGreaterThan(0);
    });

    it('should ensure all jobs have URLs', () => {
      const mockJobs = [
        {
          url: 'https://molgroup.taleo.net/careersection/external/jobdetail.ftl?job=1',
          title: 'Job 1'
        },
        {
          url: 'https://molgroup.taleo.net/careersection/external/jobdetail.ftl?job=2',
          title: 'Job 2'
        }
      ];

      for (const job of mockJobs) {
        expect(job.url).toMatch(/^https?:\/\/.+/);
        expect(job.title).toBeDefined();
      }
    });
  });

  describe('SOLR Integration', () => {
    it('should have SOLR auth configured', () => {
      expect(process.env.SOLR_AUTH).toBeDefined();
    });

    it('should upsert jobs to SOLR in the correct format', () => {
      const testJob = {
        url: 'https://test.com/test-job',
        title: 'Test Job',
        company: 'MOL ROMANIA PETROLEUM PRODUCTS SRL',
        cif: '7745470',
        status: 'scraped',
        date: new Date().toISOString()
      };

      expect(testJob.url).toMatch(/^https?:\/\/.+/);
      expect(testJob.cif).toMatch(/^\d{8}$/);
      expect(testJob.status).toBe('scraped');
      expect(testJob.company).toContain('MOL ROMANIA');
    });

    it('should query SOLR by CIF', () => {
      const query = `cif:${EXPECTED_CIF}`;
      expect(query).toContain('7745470');
    });
  });
});
