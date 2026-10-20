import { describe, it, expect, vi, afterEach } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { invalidateRecordData } from '../src/utils/invalidate';

const keysInvalidated = (spy) => spy.mock.calls.map(([f]) => JSON.stringify(f.queryKey));

describe('invalidateRecordData — one place for what a record write changes', () => {
  afterEach(() => vi.useRealTimers());

  it('invalidates by prefix, so String and Number ids and every object match', () => {
    const qc = new QueryClient();
    qc.setQueryData(['runtime-record', '42'], { data: {} });
    qc.setQueryData(['runtime-record', 42], { data: {} });
    qc.setQueryData(['runtime-records', 7], { data: [] });
    qc.setQueryData(['runtime-records', 9], { data: [] });
    invalidateRecordData(qc, { recordId: 42, objectId: 7 });
    for (const key of [['runtime-record', '42'], ['runtime-record', 42], ['runtime-records', 7], ['runtime-records', 9]]) {
      expect(qc.getQueryState(key).isInvalidated).toBe(true);
    }
  });

  it('covers lists, panels, lookups and dashboards — not the dead ["records"] key', () => {
    const qc = new QueryClient();
    const spy = vi.spyOn(qc, 'invalidateQueries');
    invalidateRecordData(qc);
    const keys = keysInvalidated(spy);
    for (const k of ['runtime-records', 'runtime-record', 'related', 'audit', 'activities', 'lookup-label', 'widget-data', 'runtime-dashboard', 'records-trash', 'lead-score-top']) {
      expect(keys).toContain(JSON.stringify([k]));
    }
    expect(keys).not.toContain(JSON.stringify(['records']));
  });

  it('re-invalidates once after server workflows had time to run (bursts share one pass)', () => {
    vi.useFakeTimers();
    const qc = new QueryClient();
    const spy = vi.spyOn(qc, 'invalidateQueries');
    invalidateRecordData(qc);
    invalidateRecordData(qc);
    const immediate = spy.mock.calls.length;
    vi.advanceTimersByTime(2500);
    const delayed = keysInvalidated(spy).slice(immediate);
    expect(delayed).toEqual(['runtime-records', 'runtime-record', 'related', 'activities', 'status-events'].map((k) => JSON.stringify([k])));
  });
});
