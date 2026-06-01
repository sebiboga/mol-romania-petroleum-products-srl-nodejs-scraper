import { jest } from '@jest/globals';

describe('src/sources/taleo.js', () => {
  let taleo;

  beforeAll(async () => {
    taleo = await import('../../src/sources/taleo.js');
  });

  describe('parseApiJobs', () => {
    it('should parse Taleo API response format', () => {
      const apiData = {
        requisitionList: [
          {
            jobId: 123,
            contestNo: 'R123',
            column: ['Senior Developer', '["Bucharest"]', '2026-01-15']
          }
        ],
        pagingData: { totalCount: 1 }
      };

      const result = taleo.parseApiJobs(apiData);

      expect(result.jobs).toHaveLength(1);
      expect(result.jobs[0].title).toBe('Senior Developer');
      expect(result.jobs[0].location).toEqual(['Bucharest']);
      expect(result.jobs[0].workmode).toBe('hybrid');
    });

    it('should handle empty job list', () => {
      const apiData = { requisitionList: [], pagingData: { totalCount: 0 } };

      const result = taleo.parseApiJobs(apiData);

      expect(result.jobs).toEqual([]);
    });

    it('should handle missing requisitionList', () => {
      const result = taleo.parseApiJobs({});

      expect(result.jobs).toEqual([]);
    });

    it('should detect workmode from title', () => {
      const apiData = {
        requisitionList: [
          {
            jobId: 1,
            contestNo: 'R1',
            column: ['Remote Developer', '["Bucharest"]', '2026-01-15']
          },
          {
            jobId: 2,
            contestNo: 'R2',
            column: ['On-Site Engineer', '["Cluj-Napoca"]', '2026-01-15']
          }
        ],
        pagingData: { totalCount: 2 }
      };

      const result = taleo.parseApiJobs(apiData);

      expect(result.jobs[0].workmode).toBe('remote');
      expect(result.jobs[1].workmode).toBe('on-site');
    });

    it('should tag jobs with source taleo', () => {
      const apiData = {
        requisitionList: [
          {
            jobId: 1,
            contestNo: 'R1',
            column: ['Test Job', '["Bucharest"]', '2026-01-15']
          }
        ],
        pagingData: { totalCount: 1 }
      };

      const result = taleo.parseApiJobs(apiData);

      expect(result.jobs[0].source).toBe('taleo');
    });
  });
});
