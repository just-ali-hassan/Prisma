/**
 * Step Limiter Tests
 *
 * Tests for the StepLimiter class.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { StepLimiter} from '../step-limiter';
import { createStepLimiter } from '../step-limiter';

describe('StepLimiter', () => {
  let limiter: StepLimiter;

  beforeEach(() => {
    limiter = createStepLimiter({ maxSteps: 5 });
  });

  describe('getState', () => {
    it('returns initial state', () => {
      const state = limiter.getState();

      expect(state.currentStep).toBe(0);
      expect(state.maxSteps).toBe(5);
      expect(state.isLimitReached).toBe(false);
      expect(state.stopRequested).toBe(false);
    });
  });

  describe('nextStep', () => {
    it('increments step counter', () => {
      expect(limiter.nextStep()).toBe(true);
      expect(limiter.getState().currentStep).toBe(1);
    });

    it('returns true until limit reached', () => {
      for (let i = 0; i < 5; i++) {
        expect(limiter.nextStep()).toBe(true);
      }
    });

    it('returns false when limit reached', () => {
      for (let i = 0; i < 5; i++) {
        limiter.nextStep();
      }
      expect(limiter.nextStep()).toBe(false);
    });

    it('sets isLimitReached when limit reached', () => {
      for (let i = 0; i < 5; i++) {
        limiter.nextStep();
      }
      limiter.nextStep();

      expect(limiter.getState().isLimitReached).toBe(true);
    });

    it('calls onLimitReached callback', () => {
      const callback = vi.fn();
      const limitedLimiter = createStepLimiter({ maxSteps: 2, onLimitReached: callback });

      limitedLimiter.nextStep();
      limitedLimiter.nextStep();
      limitedLimiter.nextStep();

      expect(callback).toHaveBeenCalledWith(3);
    });
  });

  describe('requestStop', () => {
    it('sets stopRequested', () => {
      limiter.requestStop();
      expect(limiter.getState().stopRequested).toBe(true);
    });
  });

  describe('shouldStop', () => {
    it('returns true when stop requested', () => {
      limiter.requestStop();
      expect(limiter.shouldStop()).toBe(true);
    });

    it('returns true when limit reached', () => {
      for (let i = 0; i < 6; i++) {
        limiter.nextStep();
      }
      expect(limiter.shouldStop()).toBe(true);
    });

    it('returns false when neither condition met', () => {
      expect(limiter.shouldStop()).toBe(false);
    });
  });

  describe('reset', () => {
    it('resets to initial state', () => {
      for (let i = 0; i < 3; i++) {
        limiter.nextStep();
      }
      limiter.requestStop();

      limiter.reset();

      const state = limiter.getState();
      expect(state.currentStep).toBe(0);
      expect(state.isLimitReached).toBe(false);
      expect(state.stopRequested).toBe(false);
    });

    it('allows changing maxSteps', () => {
      limiter.reset(10);
      expect(limiter.getState().maxSteps).toBe(10);
    });
  });

  describe('getRemainingSteps', () => {
    it('returns max steps initially', () => {
      expect(limiter.getRemainingSteps()).toBe(5);
    });

    it('decrements with each step', () => {
      limiter.nextStep();
      expect(limiter.getRemainingSteps()).toBe(4);
    });

    it('returns 0 when limit reached', () => {
      for (let i = 0; i < 6; i++) {
        limiter.nextStep();
      }
      expect(limiter.getRemainingSteps()).toBe(0);
    });
  });

  describe('getProgress', () => {
    it('returns 0 initially', () => {
      expect(limiter.getProgress()).toBe(0);
    });

    it('returns percentage progress', () => {
      limiter.nextStep(); // 1/5 = 20%
      expect(limiter.getProgress()).toBe(20);

      limiter.nextStep(); // 2/5 = 40%
      expect(limiter.getProgress()).toBe(40);
    });

    it('caps at 100%', () => {
      for (let i = 0; i < 6; i++) {
        limiter.nextStep();
      }
      expect(limiter.getProgress()).toBe(100);
    });

    it('returns 100% when maxSteps is 0', () => {
      limiter.reset(0);
      expect(limiter.getProgress()).toBe(100);
    });
  });
});