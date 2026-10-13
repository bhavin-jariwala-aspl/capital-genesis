'use strict';

/**
 * Dashboard catalogue — validated against the live analytics catalogue and the
 * chart renderer's contract.
 *
 * A widget is three loosely-coupled things: a dataset key, a chart type and an
 * appearance blob. Nothing at runtime rejects a mismatch — a widget pointing at
 * a dataset that no longer exists, or ranking rows of an OHLC series, simply
 * renders wrong on someone's dashboard. These tests are the gate, in the same
 * spirit as report-registry-schema.test.js.
 */

const {
  DASHBOARDS, SIZES, GRID_COLUMNS, CHART_TYPES, APPEARANCE_KEYS, NUMBER_FORMATS,
  NON_MEASURE_CHARTS, WIDGET_TYPE_BY_SHAPE, buildDashboard,
} = require('../prisma/crm-dashboards');
const { DATASETS } = require('../src/services/analytics.service');
const { chartTypesUsed, LIBRARY_CHARTS } = require('../scripts/seed-dashboards');

const datasetByKey = new Map(DATASETS.map((d) => [d.key, d]));
const allWidgets = DASHBOARDS.flatMap((d) => d.widgets.map((w) => ({ ...w, dashboard: d.name, palette: d.palette })));

describe('catalogue shape', () => {
  it('has uniquely named dashboards and exactly one default', () => {
    const names = DASHBOARDS.map((d) => d.name);
    expect(new Set(names).size).toBe(names.length);
    expect(DASHBOARDS.filter((d) => d.is_default)).toHaveLength(1);
  });

  it('gives every dashboard a label, a description and a palette', () => {
    for (const d of DASHBOARDS) {
      expect(d.label).toBeTruthy();
      expect(d.description).toBeTruthy();
      expect(d.palette).toBeTruthy();
      expect(d.widgets.length).toBeGreaterThan(0);
    }
  });

  it('uses only known sizes', () => {
    for (const w of allWidgets) {
      if (w.size !== undefined) expect(Object.keys(SIZES)).toContain(w.size);
    }
  });
});

describe('every widget matches a real dataset', () => {
  it('references datasets that exist in the analytics catalogue', () => {
    const unknown = allWidgets.filter((w) => !datasetByKey.has(w.dataset));
    expect(unknown.map((w) => `${w.dashboard}:${w.dataset}`)).toEqual([]);
  });

  it('draws a chart only for a series dataset, a tile only for a metric, a list only for rows', () => {
    for (const w of allWidgets) {
      const d = datasetByKey.get(w.dataset);
      const widgetType = WIDGET_TYPE_BY_SHAPE[d.shape];
      expect(widgetType).toBeTruthy();
      // A chart override on a non-series dataset would be silently ignored.
      if (widgetType !== 'chart') {
        expect(w.chart).toBeUndefined();
        expect(w.appearance).toBeUndefined();
      }
    }
  });

  it('uses chart types the renderer can actually draw', () => {
    for (const w of allWidgets) {
      const d = datasetByKey.get(w.dataset);
      if (d.shape !== 'series') continue;
      expect([...CHART_TYPES]).toContain(w.chart ?? d.chart_type);
    }
  });
});

describe('appearance is valid', () => {
  const appearances = allWidgets.filter((w) => w.appearance).map((w) => ({ ...w, a: w.appearance }));

  it('uses only keys the chart layer reads', () => {
    for (const { dashboard, dataset, a } of appearances) {
      for (const key of Object.keys(a)) {
        expect({ where: `${dashboard}:${dataset}`, key }).toEqual({ where: `${dashboard}:${dataset}`, key: APPEARANCE_KEYS.has(key) ? key : `UNKNOWN(${key})` });
      }
    }
  });

  it('uses known number formats and sane decimals', () => {
    for (const { a } of appearances) {
      if (a.format !== undefined) expect([...NUMBER_FORMATS]).toContain(a.format);
      if (a.decimals !== undefined) expect(a.decimals).toBeGreaterThanOrEqual(0);
      if (a.decimals !== undefined) expect(a.decimals).toBeLessThanOrEqual(4);
    }
  });

  it('uses known legend positions and positive top-N', () => {
    for (const { a } of appearances) {
      if (a.legend !== undefined) expect(['auto', 'top', 'bottom', 'hidden']).toContain(a.legend);
      if (a.sort !== undefined) expect(['none', 'asc', 'desc']).toContain(a.sort);
      if (a.topN !== undefined) expect(a.topN).toBeGreaterThan(0);
      if (a.goal !== undefined) expect(Number.isFinite(a.goal)).toBe(true);
    }
  });

  /**
   * The renderer ranks and folds rows by the first series key. On a Gantt row,
   * an OHLC candle or an (x, y, r) point, that key is not a magnitude — sorting
   * would reorder the picture into nonsense and top-N would sum unrelated
   * fields. Nothing at runtime prevents it, so prevent it here.
   */
  it('never ranks a chart whose y-key is not a measure', () => {
    const offenders = allWidgets.filter((w) => {
      const d = datasetByKey.get(w.dataset);
      if (!d || d.shape !== 'series') return false;
      const type = w.chart ?? d.chart_type;
      const a = w.appearance ?? {};
      return NON_MEASURE_CHARTS.has(type) && (a.sort || a.topN);
    });
    expect(offenders.map((w) => `${w.dashboard}:${w.dataset}`)).toEqual([]);
  });

  it('only sets a goal line on a chart type that draws one', () => {
    const GOAL_CAPABLE = new Set(['bar', 'bar_stacked', 'line', 'area', 'area_stacked', 'composed']);
    const offenders = allWidgets.filter((w) => {
      const d = datasetByKey.get(w.dataset);
      if (!d || d.shape !== 'series') return false;
      return w.appearance?.goal !== undefined && !GOAL_CAPABLE.has(w.chart ?? d.chart_type);
    });
    expect(offenders.map((w) => `${w.dashboard}:${w.dataset}`)).toEqual([]);
  });

  it('formats money as currency and counts as integers, never the other way round', () => {
    // A dataset whose label or key talks about premium/coverage/commission is
    // money; showing it as a bare integer is the exact flatness this catalogue
    // set out to remove.
    const MONEY = /premium|coverage|commission|revenue|amount|claimed|paid|pipeline|financials/i;
    for (const w of allWidgets) {
      const d = datasetByKey.get(w.dataset);
      if (!d || d.shape !== 'series' || !w.appearance?.format) continue;
      const isMoney = MONEY.test(d.key) || MONEY.test(String(d.yKey));
      if (isMoney) {
        expect({ dataset: d.key, format: w.appearance.format })
          .toEqual({ dataset: d.key, format: expect.stringMatching(/^currency/) });
      }
    }
  });
});

describe('buildDashboard', () => {
  it('packs widgets into the 12-column grid without overflowing a row', () => {
    for (const def of DASHBOARDS) {
      const { widgets } = buildDashboard(def, datasetByKey);
      for (const w of widgets) {
        expect(w.x).toBeGreaterThanOrEqual(0);
        expect(w.x + w.w).toBeLessThanOrEqual(GRID_COLUMNS);
        expect(w.h).toBeGreaterThan(0);
      }
      // order_index is 1-based and dense, so the runtime renderer's flow order
      // matches the order authored in the catalogue.
      expect(widgets.map((w) => w.order_index)).toEqual(widgets.map((_, i) => i + 1));
    }
  });

  it('never overlaps two widgets in the grid', () => {
    for (const def of DASHBOARDS) {
      const { widgets } = buildDashboard(def, datasetByKey);
      const cells = new Set();
      for (const w of widgets) {
        for (let x = w.x; x < w.x + w.w; x++) {
          for (let y = w.y; y < w.y + w.h; y++) {
            const cell = `${x},${y}`;
            expect(cells.has(cell)).toBe(false);
            cells.add(cell);
          }
        }
      }
    }
  });

  it('writes the axis keys the dataset declares, plus the dashboard palette', () => {
    const { widgets } = buildDashboard(DASHBOARDS[0], datasetByKey);
    for (const w of widgets.filter((x) => x.widget_type === 'chart')) {
      const d = datasetByKey.get(w.data_source.dataset);
      expect(w.config.xAxisKey).toBe(d.xKey);
      expect(w.config.yAxisKey).toBe(d.yKey);
      expect(w.config.appearance.palette).toBe(DASHBOARDS[0].palette);
    }
  });

  it('gives metric tiles and lists their own config, with no chart keys', () => {
    for (const def of DASHBOARDS) {
      const { widgets } = buildDashboard(def, datasetByKey);
      for (const w of widgets) {
        if (w.widget_type === 'metric') expect(w.config).toEqual({ valueKey: 'value', changeKey: 'change' });
        if (w.widget_type === 'list') expect(w.config).toHaveProperty('columns');
        if (w.widget_type !== 'chart') expect(w.config.chart_type).toBeUndefined();
      }
    }
  });

  it('rejects a dashboard that references an unknown dataset', () => {
    const broken = { ...DASHBOARDS[0], widgets: [{ dataset: 'no-such-dataset', size: 'half' }] };
    expect(() => buildDashboard(broken, datasetByKey)).toThrow(/unknown analytics dataset/);
  });
});

describe('the catalogue demonstrates the whole chart library', () => {
  it('puts every chart type the renderer supports on a dashboard', () => {
    const used = new Set(chartTypesUsed());
    const missing = [...CHART_TYPES].filter((t) => !used.has(t));
    expect(missing).toEqual([]);
  });

  it('keeps the saved chart library pointing at real datasets and valid types', () => {
    for (const [name, datasetKey, chartType] of LIBRARY_CHARTS) {
      expect(datasetByKey.has(datasetKey)).toBe(true);
      expect([...CHART_TYPES]).toContain(chartType);
      expect(name).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });
});
