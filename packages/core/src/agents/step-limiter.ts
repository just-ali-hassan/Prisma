/**
 * Step Limiter
 *
 * Enforces maximum step limits for agent execution.
 * Provides a stop signal that can be checked during execution.
 */

export interface StepLimiterOptions {
  maxSteps: number;
  onLimitReached?: (steps: number) => void;
}

export interface StepLimiterState {
  currentStep: number;
  maxSteps: number;
  isLimitReached: boolean;
  stopRequested: boolean;
}

export class StepLimiter {
  private state: StepLimiterState;
  private options: StepLimiterOptions;

  constructor(options: StepLimiterOptions) {
    this.options = options;
    this.state = {
      currentStep: 0,
      maxSteps: options.maxSteps,
      isLimitReached: false,
      stopRequested: false,
    };
  }

  getState(): Readonly<StepLimiterState> {
    return { ...this.state };
  }

  /**
   * Increment step counter and check limit.
   * Returns true if execution should continue, false if limit reached.
   */
  nextStep(): boolean {
    this.state.currentStep++;

    if (this.state.currentStep > this.state.maxSteps) {
      this.state.isLimitReached = true;
      this.options.onLimitReached?.(this.state.currentStep);
      return false;
    }

    return true;
  }

  /**
   * Request stop (e.g., from user clicking stop button).
   */
  requestStop(): void {
    this.state.stopRequested = true;
  }

  /**
   * Check if stop was requested.
   */
  shouldStop(): boolean {
    return this.state.stopRequested || this.state.isLimitReached;
  }

  /**
   * Reset the limiter for a new agent run.
   */
  reset(maxSteps?: number): void {
    this.state = {
      currentStep: 0,
      maxSteps: maxSteps ?? this.options.maxSteps,
      isLimitReached: false,
      stopRequested: false,
    };
  }

  /**
   * Get remaining steps.
   */
  getRemainingSteps(): number {
    return Math.max(0, this.state.maxSteps - this.state.currentStep);
  }

  /**
   * Get progress as a percentage (0-100).
   */
  getProgress(): number {
    if (this.state.maxSteps === 0) return 100;
    return Math.min(100, (this.state.currentStep / this.state.maxSteps) * 100);
  }
}

export function createStepLimiter(options: StepLimiterOptions): StepLimiter {
  return new StepLimiter(options);
}
