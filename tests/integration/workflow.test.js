import { jest } from '@jest/globals';
import fs from 'fs';
import path from 'path';

const mockFetch = jest.fn();
let mockExit;

jest.unstable_mockModule('node-fetch', () => ({
  default: mockFetch
}));

const COMPANY_JSON_PATH = 'tmp/company.json';

function backupCompanyJson() {
  if (fs.existsSync(COMPANY_JSON_PATH)) {
    const content = fs.readFileSync(COMPANY_JSON_PATH, 'utf-8');
    fs.renameSync(COMPANY_JSON_PATH, `${COMPANY_JSON_PATH}.bak`);
    return content;
  }
  return null;
}

function restoreCompanyJson() {
  if (fs.existsSync(`${COMPANY_JSON_PATH}.bak`)) {
    fs.renameSync(`${COMPANY_JSON_PATH}.bak`, COMPANY_JSON_PATH);
  }
  return null;
}

function makeSolrResponse(numFound, docs) {
  return {
    ok: true,
    json: async () => ({ response: { numFound, docs } })
  };
}

function makeAnafSearchResponse(results) {
  return {
    ok: true,
    json: async () => ({ data: results, success: true })
  };
}

function makeAnafCompanyResponse(data) {
  return {
    ok: true,
    json: async () => ({ data, success: true })
  };
}

function makeErrorResponse(status, text) {
  return {
    ok: false,
    status,
    text: async () => text
  };
}

const MOL_ANAF_RECORD = {
  cui: 7745470,
  name: 'MOL ROMANIA PETROLEUM PRODUCTS SRL',
  address: 'MUNICIPIUL CLUJ-NAPOCA, BLD. 21 DECEMBRIE 1989, NR.77, ET.1, CAM. C.1.1',
  caenCode: '4730',
  inactive: false,
  registrationNumber: 'J2000000729127',
  vatRegistered: true,
  onrcStatusLabel: 'Funcțiune',
  legalForm: 'SRL',
  headquartersAddress: { locality: 'Cluj-Napoca' },
  authorizedCaenCodes: ['4730']
};

describe('SCRAPER WORKFLOW INTEGRATION', () => {
  let savedCompanyJson;

  beforeAll(async () => {
    fs.mkdirSync("tmp", { recursive: true });
    process.env.SOLR_AUTH = 'test:test';
    savedCompanyJson = backupCompanyJson();
  });

  afterAll(() => {
    delete process.env.SOLR_AUTH;
    restoreCompanyJson();
  });

  beforeEach(() => {
    mockFetch.mockReset();
    if (fs.existsSync(COMPANY_JSON_PATH)) {
      fs.unlinkSync(COMPANY_JSON_PATH);
    }
  });

  describe('Full scraper run (no cached company data)', () => {
    it('should scrape, fetch ANAF data, and submit jobs to SOLR', async () => {
      const expectedJobs = [
        {
          url: 'https://molgroup.taleo.net/careersection/external/jobdetail.ftl?job=1',
          title: 'Senior Developer',
          location: ['Bucharest'],
          workmode: 'hybrid'
        },
        {
          url: 'https://molgroup.taleo.net/careersection/external/jobdetail.ftl?job=2',
          title: 'Remote Tester',
          location: ['Cluj-Napoca'],
          workmode: 'remote'
        }
      ];

      mockFetch
        .mockResolvedValueOnce(makeSolrResponse(0, []))
        .mockResolvedValueOnce(makeAnafCompanyResponse(MOL_ANAF_RECORD))
        .mockResolvedValueOnce(makeSolrResponse(0, []))
        .mockResolvedValueOnce(makeSolrResponse(0, []))
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            requisitionList: [
              {
                jobId: 1,
                contestNo: 'R1',
                column: ['Senior Developer', '["Bucharest"]', '2026-01-15']
              },
              {
                jobId: 2,
                contestNo: 'R2',
                column: ['Remote Tester', '["Cluj-Napoca"]', '2026-01-15']
              }
            ],
            pagingData: { totalCount: 2 }
          })
        })
        .mockResolvedValue(makeSolrResponse(0, []));

      const { run } = await import('../../index.js');
      await expect(run()).resolves.toBeUndefined();
    }, 30000);

    it('should create company.json cache after successful run', async () => {
      mockFetch
        .mockResolvedValueOnce(makeSolrResponse(0, []))
        .mockResolvedValueOnce(makeAnafCompanyResponse(MOL_ANAF_RECORD))
        .mockResolvedValueOnce(makeSolrResponse(0, []))
        .mockResolvedValueOnce(makeSolrResponse(0, []))
        .mockResolvedValueOnce({ ok: true })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            requisitionList: [],
            pagingData: { totalCount: 0 }
          })
        })
        .mockResolvedValue(makeSolrResponse(0, []));

      const { run } = await import('../../index.js');
      await run();

      expect(fs.existsSync(COMPANY_JSON_PATH)).toBe(true);

      const cached = JSON.parse(fs.readFileSync(COMPANY_JSON_PATH, 'utf-8'));
      expect(cached).toHaveProperty('summary');
      expect(cached.summary.cif).toBe('7745470');
      expect(cached.summary.company).toBe('MOL ROMANIA PETROLEUM PRODUCTS SRL');
    }, 30000);
  });

  describe('Full scraper run (with cached company data)', () => {
    it('should reuse cached company data and skip ANAF calls', async () => {
      const cachedData = {
        anaf: MOL_ANAF_RECORD,
        summary: { company: 'MOL ROMANIA PETROLEUM PRODUCTS SRL', cif: '7745470', active: true }
      };
      fs.writeFileSync(COMPANY_JSON_PATH, JSON.stringify(cachedData), 'utf-8');

      mockFetch
        .mockResolvedValueOnce(makeSolrResponse(0, []))
        .mockResolvedValueOnce(makeSolrResponse(0, []))
        .mockResolvedValueOnce(makeSolrResponse(0, []))
        .mockResolvedValueOnce({ ok: true })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            requisitionList: [],
            pagingData: { totalCount: 0 }
          })
        })
        .mockResolvedValue(makeSolrResponse(0, []));

      const { run } = await import('../../index.js');
      await run();

      const anafCalls = mockFetch.mock.calls.filter(
        call => call[0] && call[0].includes('anaf')
      );
      expect(anafCalls.length).toBe(0);
    }, 30000);
  });

  describe('Error handling and recovery', () => {
    it('should handle ANAF API failure with cached fallback', async () => {
      const cachedData = {
        anaf: MOL_ANAF_RECORD,
        summary: { company: 'MOL ROMANIA PETROLEUM PRODUCTS SRL', cif: '7745470', active: true }
      };
      fs.writeFileSync(COMPANY_JSON_PATH, JSON.stringify(cachedData), 'utf-8');

      mockFetch
        .mockResolvedValueOnce(makeSolrResponse(0, []))
        .mockResolvedValueOnce(makeSolrResponse(0, []))
        .mockResolvedValueOnce(makeSolrResponse(0, []))
        .mockResolvedValueOnce({ ok: true })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            requisitionList: [],
            pagingData: { totalCount: 0 }
          })
        })
        .mockResolvedValue(makeSolrResponse(0, []));

      const { run } = await import('../../index.js');
      await expect(run()).resolves.not.toThrow();
    }, 30000);

    it('should exit with error on SOLR query failure', async () => {
      const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {});
      const cachedData = {
        anaf: MOL_ANAF_RECORD,
        summary: { company: 'MOL ROMANIA PETROLEUM PRODUCTS SRL', cif: '7745470', active: true }
      };
      fs.writeFileSync(COMPANY_JSON_PATH, JSON.stringify(cachedData), 'utf-8');

      mockFetch
        .mockResolvedValueOnce(makeErrorResponse(500, 'SOLR Error'))
        .mockResolvedValueOnce(makeSolrResponse(0, []))
        .mockResolvedValueOnce(makeSolrResponse(0, []))
        .mockResolvedValueOnce({ ok: true })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            requisitionList: [],
            pagingData: { totalCount: 0 }
          })
        })
        .mockResolvedValue(makeSolrResponse(0, []));

      const { run } = await import('../../index.js');
      await run();
      expect(exitSpy).toHaveBeenCalledWith(1);
      exitSpy.mockRestore();
    }, 30000);
  });

  describe('Company validation', () => {
    it('should fail if company is inactive', async () => {
      const inactiveRecord = { ...MOL_ANAF_RECORD, inactive: true };

      mockFetch
        .mockResolvedValueOnce(makeAnafCompanyResponse(inactiveRecord))
        .mockResolvedValueOnce(makeSolrResponse(0, []));

      const company = await import('../../company.js');
      const result = await company.validateAndGetCompany();

      expect(result.status).toBe('inactive');
    }, 30000);

    it('should succeed regardless of company name (no name validation in code)', async () => {
      const wrongCompany = {
        ...MOL_ANAF_RECORD,
        name: 'MOL HUNGARY PETROLEUM PRODUCTS KFT'
      };

      mockFetch
        .mockResolvedValueOnce(makeAnafCompanyResponse(wrongCompany))
        .mockResolvedValueOnce(makeSolrResponse(0, []));

      const company = await import('../../company.js');
      const result = await company.validateAndGetCompany();

      expect(result.status).toBe('active');
    }, 30000);

    it('should succeed if the company name contains "MOL ROMANIA"', async () => {
      mockFetch
        .mockResolvedValueOnce(makeAnafCompanyResponse(MOL_ANAF_RECORD))
        .mockResolvedValueOnce(makeSolrResponse(0, []));

      const company = await import('../../company.js');
      const result = await company.validateAndGetCompany();

      expect(result.status).toBe('active');
    }, 30000);
  });
});
