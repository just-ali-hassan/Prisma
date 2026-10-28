/**
 * Cost Estimator
 *
 * Calculates token usage costs based on model pricing.
 * Tracks running totals during agent execution.
 */

import type { ModelId, ProviderId, TokenUsage, ModelPricing } from '../providers/types';
import { getModelPricing } from '../providers/capability-table';

export interface CostBreakdown {
  promptCost: number;
  completionCost: number;
  totalCost: number;
  promptTokens: number;
  completionTokens: number;
}

export interface RunningCost {
  total: number;
  breakdown: CostBreakdown[];
  currentStep: CostBreakdown | null;
}

export class CostEstimator {
  private provider: ProviderId;
  private model: ModelId;
  private runningTotal: RunningCost;

  constructor(provider: ProviderId, model: ModelId) {
    this.provider = provider;
    this.model = model;
    this.runningTotal = {
      total: 0,
      breakdown: [],
      currentStep: null,
    };
  }

  /**
   * Estimate cost for a single request/response.
   */
  estimate(promptTokens: number, completionTokens: number): CostBreakdown {
    const pricing = getModelPricing(this.provider, this.model);
    if (!pricing) {
      return {
        promptCost: 0,
        completionCost: 0,
        totalCost: 0,
        promptTokens,
        completionTokens,
      };
    }

    const promptCost = (promptTokens / 1_000_000) * pricing.inputPerMillion;
    const completionCost = (completionTokens / 1_000_000) * pricing.outputPerMillion;

    return {
      promptCost,
      completionCost,
      totalCost: promptCost + completionCost,
      promptTokens,
      completionTokens,
    };
  }

  /**
   * Add a step's cost to the running total.
   */
  addStep(promptTokens: number, completionTokens: number): CostBreakdown {
    const stepCost = this.estimate(promptTokens, completionTokens);
    this.runningTotal.breakdown.push(stepCost);
    this.runningTotal.total += stepCost.totalCost;
    this.runningTotal.currentStep = stepCost;
    return stepCost;
  }

  /**
   * Add token usage from a stream event.
   */
  addUsage(usage: TokenUsage): CostBreakdown {
    return this.addStep(usage.promptTokens, usage.completionTokens);
  }

  /**
   * Get the current running total.
   */
  getTotal(): RunningCost {
    return { ...this.runningTotal };
  }

  /**
   * Get formatted cost string (e.g., "$0.0023").
   */
  formatCost(cost: number): string {
    if (cost < 0.001) {
      return `$${(cost * 1_000_000).toFixed(2)}µ`;
    }
    if (cost < 0.01) {
      return `$${cost.toFixed(4)}`;
    }
    return `$${cost.toFixed(2)}`;
  }

  /**
   * Reset the running total.
   */
  reset(): void {
    this.runningTotal = {
      total: 0,
      breakdown: [],
      currentStep: null,
    };
  }

  /**
   * Update the model (e.g., when user switches models mid-conversation).
   */
  setModel(provider: ProviderId, model: ModelId): void {
    this.provider = provider;
    this.model = model;
  }

  /**
   * Get pricing info for current model.
   */
  getPricing(): ModelPricing | undefined {
    return getModelPricing(this.provider, this.model);
  }
}

export function createCostEstimator(provider: ProviderId, model: ModelId): CostEstimator {
  return new CostEstimator(provider, model);
}
