import { jest } from '@jest/globals';
import fs from 'fs';
import path from 'path';

const mockFetch = jest.fn();

jest.unstable_mockModule('node-fetch', () => ({
  default: mockFetch
}));

const COMPANY_JSON_PATH = 'company.json';

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

function anafSearchResponse(results) {
  return {
    ok: true,
    json: async () => ({ data: results, success: true })
  };
}

function anafCompanyResponse(data) {
  return {
    ok: true,
    json: async () => ({ data, success: true })
  };
}

function peviitorResponse(companies) {
  return {
    ok: true,
    json: async () => ({ companies })
  };
}

function solrResponse(numFound, docs) {
  return {
    ok: true,
    json: async () => ({ response: { numFound, docs } })
  };
}

function errorResponse(status) {
  return {
    ok: false,
    status,
    text: async () => 'Error'
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
  eFacturaRegistered: false,
  onrcStatusLabel: 'Funcțiune',
  legalForm: 'SRL',
  headquartersAddress: { locality: 'Cluj-Napoca' },
  authorizedCaenCodes: ['4730']
};

describe('company.js', () => {
  let company;
  let savedCompanyJson;

  beforeAll(async () => {
    process.env.SOLR_AUTH = 'test:test';
    savedCompanyJson = backupCompanyJson();
    company = await import('../../company.js');
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

  describe('getCompanyBrand', () => {
    it('should return the company brand', () => {
      const brand = company.getCompanyBrand();
      expect(typeof brand).toBe('string');
      expect(brand).toBe('MOL');
    });
  });

  describe('getCompanyData (no cache)', () => {
    it('should find MOL via ANAF search and return company data', async () => {
      mockFetch
        .mockResolvedValueOnce(anafSearchResponse([
          { cui: 7745470, name: 'MOL ROMANIA PETROLEUM PRODUCTS SRL', statusLabel: 'Funcțiune' }
        ]))
        .mockResolvedValueOnce(anafCompanyResponse(MOL_ANAF_RECORD));

      const result = await company.getCompanyData();

      expect(result).toHaveProperty('company', 'MOL ROMANIA PETROLEUM PRODUCTS SRL');
      expect(result).toHaveProperty('cif', '7745470');
      expect(result).toHaveProperty('active', true);
      expect(result).toHaveProperty('anafData');
      expect(result.anafData.name).toBe('MOL ROMANIA PETROLEUM PRODUCTS SRL');
    });

    it('should pick first active company when no exact match', async () => {
      mockFetch
        .mockResolvedValueOnce(anafSearchResponse([
          { cui: 11111111, name: 'SOME OTHER COMPANY SRL', statusLabel: 'Radiată' },
          { cui: 7745470, name: 'MOL ROMANIA PETROLEUM PRODUCTS SRL', statusLabel: 'Funcțiune' }
        ]))
        .mockResolvedValueOnce(anafCompanyResponse(MOL_ANAF_RECORD));

      const result = await company.getCompanyData();

      expect(result.cif).toBe('7745470');
      expect(result.active).toBe(true);
    });

    it('should throw when no companies found', async () => {
      mockFetch.mockResolvedValueOnce(anafSearchResponse([]));

      await expect(company.getCompanyData()).rejects.toThrow('No companies found');
    });

    it('should throw when no active company found', async () => {
      mockFetch.mockResolvedValueOnce(anafSearchResponse([
        { cui: 11111111, name: 'MOL SOMETHING SRL', statusLabel: 'Radiată' }
      ]));

      await expect(company.getCompanyData()).rejects.toThrow('No active company found');
    });

    it('should throw when ANAF returns no data', async () => {
      mockFetch
        .mockResolvedValueOnce(anafSearchResponse([
          { cui: 7745470, name: 'MOL ROMANIA PETROLEUM PRODUCTS SRL', statusLabel: 'Funcțiune' }
        ]))
        .mockResolvedValueOnce(anafCompanyResponse(null));

      await expect(company.getCompanyData()).rejects.toThrow('No data from ANAF');
    });

    it('should throw when ANAF returns no company name', async () => {
      mockFetch
        .mockResolvedValueOnce(anafSearchResponse([
          { cui: 7745470, name: 'MOL ROMANIA PETROLEUM PRODUCTS SRL', statusLabel: 'Funcțiune' }
        ]))
        .mockResolvedValueOnce(anafCompanyResponse({ cui: 7745470, name: null }));

      await expect(company.getCompanyData()).rejects.toThrow('ANAF returned no company name');
    });
  });

  describe('getCompanyData (with cache)', () => {
    const cachedData = {
      anaf: MOL_ANAF_RECORD,
      summary: {
        company: 'MOL ROMANIA PETROLEUM PRODUCTS SRL',
        cif: '7745470',
        active: true
      }
    };

    beforeEach(() => {
      fs.writeFileSync(COMPANY_JSON_PATH, JSON.stringify(cachedData), 'utf-8');
    });

    it('should use cached company data when available', async () => {
      const result = await company.getCompanyData();

      expect(result.company).toBe('MOL ROMANIA PETROLEUM PRODUCTS SRL');
      expect(result.cif).toBe('7745470');
      expect(result.active).toBe(true);
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('validateAndGetCompany', () => {
    it('should return company data with status active', async () => {
      mockFetch
        .mockResolvedValueOnce(anafSearchResponse([
          { cui: 7745470, name: 'MOL ROMANIA PETROLEUM PRODUCTS SRL', statusLabel: 'Funcțiune' }
        ]))
        .mockResolvedValueOnce(anafCompanyResponse(MOL_ANAF_RECORD))
        .mockResolvedValueOnce(solrResponse(5, [
          { url: 'https://test.com/1', title: 'Job 1' },
          { url: 'https://test.com/2', title: 'Job 2' }
        ]))
        .mockResolvedValueOnce(peviitorResponse([{ company: 'MOL ROMANIA PETROLEUM PRODUCTS SRL' }]));

      const result = await company.validateAndGetCompany();

      expect(result).toHaveProperty('status', 'active');
      expect(result).toHaveProperty('company', 'MOL ROMANIA PETROLEUM PRODUCTS SRL');
      expect(result).toHaveProperty('cif', '7745470');
      expect(result).toHaveProperty('existingJobsCount');
      expect(typeof result.existingJobsCount).toBe('number');
    });

    it('should return inactive status when company is inactive', async () => {
      const inactiveRecord = { ...MOL_ANAF_RECORD, inactive: true };

      mockFetch
        .mockResolvedValueOnce(anafSearchResponse([
          { cui: 7745470, name: 'MOL ROMANIA PETROLEUM PRODUCTS SRL', statusLabel: 'Funcțiune' }
        ]))
        .mockResolvedValueOnce(anafCompanyResponse(inactiveRecord))
        .mockResolvedValueOnce(solrResponse(0, []));

      const result = await company.validateAndGetCompany();

      expect(result).toHaveProperty('status', 'inactive');
    });
  });
});
