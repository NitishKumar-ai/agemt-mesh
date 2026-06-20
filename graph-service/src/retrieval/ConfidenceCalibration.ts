export class ConfidenceCalibration {
  /**
   * Calibrates raw scores to a probability range of [0.0, 1.0].
   * It uses a logistic sigmoid function centered around a configurable midpoint.
   */
  static calibrate(score: number, midpoint = 0.5, steepness = 10): number {
    if (isNaN(score)) return 0.0;
    const probability = 1 / (1 + Math.exp(-steepness * (score - midpoint)));
    return Math.max(0.0, Math.min(1.0, Number(probability.toFixed(4))));
  }
}
