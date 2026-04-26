import { describe, expect, test } from '@jest/globals';
import { parseApiJobs } from '../index.js';

describe('parseApiJobs', () => {
  test('parses empty data', () => {
    const data = { requisitionList: [], pagingData: { totalCount: 0 } };
    const result = parseApiJobs(data);
    expect(result.jobs).toEqual([]);
    expect(result.total).toBe(0);
  });
  
  test('parses job data correctly', () => {
    const data = {
      requisitionList: [
        {
          jobId: '12345',
          contestNo: 'REQ001',
          column: ['Software Engineer', 'Romania-Bucuresti', '2026-04-26']
        }
      ],
      pagingData: { totalCount: 1 }
    };
    const result = parseApiJobs(data);
    expect(result.jobs.length).toBe(1);
    expect(result.jobs[0].title).toBe('Software Engineer');
    expect(result.total).toBe(1);
  });
});

describe('Company validation', () => {
  test('has required fields', () => {
    const company = {
      name: 'MOL ROMANIA PETROLEUM PRODUCTS SRL',
      cif: '7745470'
    };
    expect(company.name).toBeTruthy();
    expect(company.cif).toBe('7745470');
  });
});