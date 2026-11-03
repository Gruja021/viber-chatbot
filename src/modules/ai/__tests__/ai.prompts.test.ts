import { ANTI_HALLUCINATION_PREFIX, NO_DATABASE_SUFFIX } from '../ai.prompts';

describe('AI Prompts', () => {
  it('ANTI_HALLUCINATION_PREFIX contains key rules', () => {
    expect(ANTI_HALLUCINATION_PREFIX).toContain('NEVER fabricate');
    expect(ANTI_HALLUCINATION_PREFIX).toContain('search_database');
    expect(ANTI_HALLUCINATION_PREFIX).toContain('could not find');
    expect(ANTI_HALLUCINATION_PREFIX).toContain('same language');
  });

  it('NO_DATABASE_SUFFIX explains missing database', () => {
    expect(NO_DATABASE_SUFFIX).toContain('No product database is configured');
  });

  it('prompts match snapshot', () => {
    expect(ANTI_HALLUCINATION_PREFIX).toMatchSnapshot();
    expect(NO_DATABASE_SUFFIX).toMatchSnapshot();
  });
});
