/**
 * Cost Estimator Tests
 *
 * Tests for the CostEstimator class.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CostEstimator} from '../cost-estimator';
import { createCostEstimator } from '../cost-estimator';
import { getModelPricing } from '../../providers/capability-table';

describe('CostEstimator', () => {
  let estimator: CostEstimator;

  beforeEach(() => {
    estimator = createCostEstimator('openai', 'gpt-4o');
  });

  describe('estimate', () => {
    it('calculates cost correctly for gpt-4o', () => {
      const result = estimator.estimate(1_000_000, 1_000_000);

      expect(result.promptTokens).toBe(1_000_000);
      expect(result.completionTokens).toBe(1_000_000);
      expect(result.promptCost).toBe(2.5); // $2.5 per 1M
      expect(result.completionCost).toBe(10.0); // $10 per 1M
      expect(result.totalCost).toBe(12.5);
    });

    it('calculates cost for smaller token counts', () => {
      const result = estimator.estimate(100_000, 50_000);

      expect(result.promptCost).toBe(0.25);
      expect(result.completionCost).toBe(0.5);
      expect(result.totalCost).toBe(0.75);
    });

    it('returns zero for unknown model', () => {
      const unknownEstimator = createCostEstimator('unknown', 'unknown-model');
      const result = unknownEstimator.estimate(1_000_000, 1_000_000);

      expect(result.totalCost).toBe(0);
    });
  });

  describe('addStep', () => {
    it('adds step cost to running total', () => {
      estimator.addStep(1_000_000, 1_000_000);
      estimator.addStep(500_000, 500_000);

      const total = estimator.getTotal();
      expect(total.breakdown).toHaveLength(2);
      expect(total.total).toBeCloseTo(12.5 + 6.25); // 12.5 + 6.25
    });

    it('updates current step', () => {
      estimator.addStep(1_000_000, 1_000_000);
      const total = estimator.getTotal();

      expect(total.currentStep).toBeDefined();
      expect(total.currentStep!.totalCost).toBe(12.5);
    });
  });

  describe('addUsage', () => {
    it('adds token usage to running total', () => {
      const usage = { promptTokens: 1_000_000, completionTokens: 1_000_000, totalTokens: 2_000_000 };
      estimator.addUsage(usage);

      const total = estimator.getTotal();
      expect(total.total).toBe(12.5);
    });
  });

  describe('getTotal', () => {
    it('returns copy of running total', () => {
      estimator.addStep(1_000_000, 1_000_000);
      const total = estimator.getTotal();

      total.total = 999;
      expect(estimator.getTotal().total).toBe(12.5);
    });
  });

  describe('formatCost', () => {
    it('formats small costs in microdollars', () => {
      expect(estimator.formatCost(0.000001)).toBe('$1.00µ');
      expect(estimator.formatCost(0.00005)).toBe('$50.00µ');
    });

    it('formats medium costs with 4 decimals', () => {
      expect(estimator.formatCost(0.001)).toBe('$0.0010');
      expect(estimator.formatCost(0.005)).toBe('$0.0050');
    });

    it('formats larger costs with 2 decimals', () => {
      expect(estimator.formatCost(0.01)).toBe('$0.01');
      expect(estimator.formatCost(1.5)).toBe('$1.50');
      expect(estimator.formatCost(100)).toBe('$100.00');
    });
  });

  describe('reset', () => {
    it('clears running total', () => {
      estimator.addStep(1_000_000, 1_000_000);
      estimator.reset();

      const total = estimator.getTotal();
      expect(total.total).toBe(0);
      expect(total.breakdown).toHaveLength(0);
      expect(total.currentStep).toBeNull();
    });
  });

  describe('setModel', () => {
    it('updates model and pricing', () => {
      estimator.setModel('openai', 'gpt-4o-mini');
      const result = estimator.estimate(1_000_000, 1_000_000);

      // gpt-4o-mini: $0.15 input, $0.6 output per 1M
      expect(result.totalCost).toBe(0.75);
    });
  });

  describe('getPricing', () => {
    it('returns pricing for current model', () => {
      const pricing = estimator.getPricing();

      expect(pricing).toEqual({ inputPerMillion: 2.5, outputPerMillion: 10.0 });
    });
  });
});