export type BreadthTrend = "rising" | "flat" | "falling";

export type GroupMember = {
  symbol: string;
  change1d: number;
  volumeMultiple: number;
  spark: number[];
};

export type GroupNearBreakout = {
  symbol: string;
  distanceFromHigh: number;
  reference: "20d" | "52w";
  volumeMultiple: number;
};

export type GroupDistributionBucket = {
  label: string;
  value: number;
};

export type GroupTapeChecks = {
  newHighsToday: number;
  above50dmaRising: boolean;
  newToTop20: boolean;
};

export type GroupScoreComponents = {
  return1d: number;
  return1w: number;
  return4w: number;
  return13w: number;
  breadth: number;
  volumePulse: number;
  persistenceBonus?: number;
};

export type GroupData = {
  id: string;
  name: string;
  activeCount: number;
  rank: number;
  score: number;
  scoreComponents: GroupScoreComponents;
  returns: {
    d: number;
    w1: number;
    w4: number;
    w13: number;
  };
  breadth: {
    above20: number;
    above50: number;
    newHighsToday: number;
    trend: BreadthTrend;
  };
  breakoutDensity: number;
  volumePulse: number;
  medianVolumeZ: number;
  liquidity: number;
  volatility: number;
  breakouts: {
    highs: number;
    lows: number;
  };
  topTickers: GroupMember[];
  nearBreakouts: GroupNearBreakout[];
  distribution: GroupDistributionBucket[];
  tapeChecks: GroupTapeChecks;
  risk: {
    above200dma: number;
  };
  entersTop20ThisWeek: boolean;
  breadthTrendStreak: number;
  rotationSignal?: "up" | "down" | null;
  advFloorBreached?: boolean;
  persistenceBonus?: boolean;
};

const createSpark = (base: number, variance: number): number[] => {
  const points: number[] = [];
  for (let i = 0; i < 16; i += 1) {
    const delta = (Math.sin((i / 16) * Math.PI * 2) * variance) / 2;
    points.push(Number((base + delta).toFixed(2)));
  }
  return points;
};

export const GROUPS_DATA: GroupData[] = [
  {
    id: "semis",
    name: "Semis",
    activeCount: 43,
    rank: 1,
    score: 2.14,
    scoreComponents: {
      return1d: 0.6,
      return1w: 0.58,
      return4w: 0.68,
      return13w: 0.2,
      breadth: 0.07,
      volumePulse: 0.01,
      persistenceBonus: 0.1,
    },
    returns: {
      d: 0.018,
      w1: 0.042,
      w4: 0.112,
      w13: 0.286,
    },
    breadth: {
      above20: 0.78,
      above50: 0.64,
      newHighsToday: 0.18,
      trend: "rising",
    },
    breakoutDensity: 0.16,
    volumePulse: 0.62,
    medianVolumeZ: 1.3,
    liquidity: 38,
    volatility: 0.032,
    breakouts: {
      highs: 5,
      lows: 1,
    },
    topTickers: [
      { symbol: "NVDA", change1d: 0.022, volumeMultiple: 1.8, spark: createSpark(1.08, 0.25) },
      { symbol: "SMCI", change1d: 0.031, volumeMultiple: 2.1, spark: createSpark(1.12, 0.35) },
      { symbol: "AVGO", change1d: 0.018, volumeMultiple: 1.4, spark: createSpark(1.06, 0.2) },
      { symbol: "ASML", change1d: 0.015, volumeMultiple: 1.2, spark: createSpark(1.04, 0.18) },
      { symbol: "AMD", change1d: 0.012, volumeMultiple: 1.6, spark: createSpark(1.05, 0.28) },
      { symbol: "CRUS", change1d: 0.019, volumeMultiple: 1.3, spark: createSpark(1.03, 0.18) },
      { symbol: "LSCC", change1d: 0.024, volumeMultiple: 1.9, spark: createSpark(1.07, 0.22) },
      { symbol: "MCHP", change1d: 0.014, volumeMultiple: 1.4, spark: createSpark(1.02, 0.16) },
      { symbol: "MRVL", change1d: 0.017, volumeMultiple: 1.8, spark: createSpark(1.05, 0.24) },
    ],
    nearBreakouts: [
      { symbol: "LSCC", distanceFromHigh: 0.012, reference: "52w", volumeMultiple: 1.5 },
      { symbol: "MRVL", distanceFromHigh: 0.017, reference: "20d", volumeMultiple: 1.4 },
      { symbol: "SMCI", distanceFromHigh: 0.008, reference: "52w", volumeMultiple: 2.1 },
    ],
    distribution: [
      { label: "<-5%", value: 2 },
      { label: "-5% to 0%", value: 6 },
      { label: "0% to +5%", value: 21 },
      { label: "+5% to +10%", value: 9 },
      { label: ">+10%", value: 5 },
    ],
    tapeChecks: {
      newHighsToday: 7,
      above50dmaRising: true,
      newToTop20: false,
    },
    risk: {
      above200dma: 0.72,
    },
    entersTop20ThisWeek: false,
    breadthTrendStreak: 4,
    rotationSignal: "up",
    persistenceBonus: true,
  },
  {
    id: "builders",
    name: "Homebuilders",
    activeCount: 28,
    rank: 2,
    score: 1.72,
    scoreComponents: {
      return1d: 0.34,
      return1w: 0.42,
      return4w: 0.52,
      return13w: 0.26,
      breadth: 0.12,
      volumePulse: 0.06,
      persistenceBonus: 0.1,
    },
    returns: {
      d: 0.012,
      w1: 0.031,
      w4: 0.084,
      w13: 0.158,
    },
    breadth: {
      above20: 0.74,
      above50: 0.68,
      newHighsToday: 0.12,
      trend: "rising",
    },
    breakoutDensity: 0.11,
    volumePulse: 0.48,
    medianVolumeZ: 0.9,
    liquidity: 22,
    volatility: 0.026,
    breakouts: {
      highs: 4,
      lows: 0,
    },
    topTickers: [
      { symbol: "LEN", change1d: 0.011, volumeMultiple: 1.3, spark: createSpark(1.04, 0.16) },
      { symbol: "DHI", change1d: 0.016, volumeMultiple: 1.5, spark: createSpark(1.06, 0.2) },
      { symbol: "TOL", change1d: 0.014, volumeMultiple: 1.4, spark: createSpark(1.05, 0.18) },
      { symbol: "PHM", change1d: 0.013, volumeMultiple: 1.3, spark: createSpark(1.03, 0.14) },
      { symbol: "NAIL", change1d: 0.028, volumeMultiple: 1.9, spark: createSpark(1.09, 0.24) },
      { symbol: "KBH", change1d: 0.012, volumeMultiple: 1.2, spark: createSpark(1.02, 0.12) },
      { symbol: "MTH", change1d: 0.015, volumeMultiple: 1.6, spark: createSpark(1.05, 0.22) },
      { symbol: "TMHC", change1d: 0.017, volumeMultiple: 1.4, spark: createSpark(1.04, 0.18) },
    ],
    nearBreakouts: [
      { symbol: "MTH", distanceFromHigh: 0.019, reference: "20d", volumeMultiple: 1.3 },
      { symbol: "LEN", distanceFromHigh: 0.013, reference: "52w", volumeMultiple: 1.2 },
    ],
    distribution: [
      { label: "<-5%", value: 1 },
      { label: "-5% to 0%", value: 5 },
      { label: "0% to +5%", value: 14 },
      { label: "+5% to +10%", value: 6 },
      { label: ">+10%", value: 2 },
    ],
    tapeChecks: {
      newHighsToday: 4,
      above50dmaRising: true,
      newToTop20: false,
    },
    risk: {
      above200dma: 0.66,
    },
    entersTop20ThisWeek: false,
    breadthTrendStreak: 3,
    rotationSignal: "up",
    persistenceBonus: true,
  },
  {
    id: "software-security",
    name: "Cybersecurity",
    activeCount: 19,
    rank: 3,
    score: 1.28,
    scoreComponents: {
      return1d: 0.42,
      return1w: 0.32,
      return4w: 0.46,
      return13w: 0.08,
      breadth: -0.06,
      volumePulse: 0.06,
    },
    returns: {
      d: 0.016,
      w1: 0.027,
      w4: 0.074,
      w13: 0.094,
    },
    breadth: {
      above20: 0.58,
      above50: 0.46,
      newHighsToday: 0.08,
      trend: "flat",
    },
    breakoutDensity: 0.09,
    volumePulse: 0.42,
    medianVolumeZ: 0.7,
    liquidity: 31,
    volatility: 0.029,
    breakouts: {
      highs: 3,
      lows: 1,
    },
    topTickers: [
      { symbol: "PANW", change1d: 0.013, volumeMultiple: 1.4, spark: createSpark(1.05, 0.22) },
      { symbol: "CRWD", change1d: 0.021, volumeMultiple: 1.6, spark: createSpark(1.07, 0.26) },
      { symbol: "ZS", change1d: 0.018, volumeMultiple: 1.5, spark: createSpark(1.06, 0.24) },
      { symbol: "FTNT", change1d: 0.009, volumeMultiple: 1.2, spark: createSpark(1.03, 0.16) },
      { symbol: "OKTA", change1d: 0.014, volumeMultiple: 1.3, spark: createSpark(1.04, 0.18) },
      { symbol: "S", change1d: 0.026, volumeMultiple: 1.9, spark: createSpark(1.08, 0.28) },
      { symbol: "RBRK", change1d: 0.017, volumeMultiple: 1.5, spark: createSpark(1.05, 0.2) },
    ],
    nearBreakouts: [
      { symbol: "ZS", distanceFromHigh: 0.024, reference: "20d", volumeMultiple: 1.4 },
      { symbol: "CRWD", distanceFromHigh: 0.018, reference: "52w", volumeMultiple: 1.5 },
    ],
    distribution: [
      { label: "<-5%", value: 2 },
      { label: "-5% to 0%", value: 8 },
      { label: "0% to +5%", value: 6 },
      { label: "+5% to +10%", value: 2 },
      { label: ">+10%", value: 1 },
    ],
    tapeChecks: {
      newHighsToday: 2,
      above50dmaRising: false,
      newToTop20: false,
    },
    risk: {
      above200dma: 0.58,
    },
    entersTop20ThisWeek: false,
    breadthTrendStreak: -1,
    rotationSignal: null,
  },
  {
    id: "uranium",
    name: "Uranium",
    activeCount: 17,
    rank: 4,
    score: 1.08,
    scoreComponents: {
      return1d: 0.18,
      return1w: 0.28,
      return4w: 0.52,
      return13w: 0.18,
      breadth: -0.12,
      volumePulse: 0.14,
      persistenceBonus: 0.1,
    },
    returns: {
      d: -0.004,
      w1: 0.022,
      w4: 0.082,
      w13: 0.124,
    },
    breadth: {
      above20: 0.44,
      above50: 0.38,
      newHighsToday: 0.05,
      trend: "falling",
    },
    breakoutDensity: 0.14,
    volumePulse: 0.56,
    medianVolumeZ: 1.5,
    liquidity: 16,
    volatility: 0.036,
    breakouts: {
      highs: 5,
      lows: 2,
    },
    topTickers: [
      { symbol: "CCJ", change1d: -0.006, volumeMultiple: 1.8, spark: createSpark(1.03, 0.24) },
      { symbol: "UEC", change1d: 0.012, volumeMultiple: 2.2, spark: createSpark(1.07, 0.3) },
      { symbol: "SMR", change1d: 0.028, volumeMultiple: 2.4, spark: createSpark(1.12, 0.34) },
      { symbol: "NNE", change1d: 0.019, volumeMultiple: 1.7, spark: createSpark(1.05, 0.26) },
      { symbol: "OKLO", change1d: 0.033, volumeMultiple: 2.6, spark: createSpark(1.15, 0.36) },
      { symbol: "VST", change1d: -0.008, volumeMultiple: 1.4, spark: createSpark(1.01, 0.18) },
    ],
    nearBreakouts: [
      { symbol: "UEC", distanceFromHigh: 0.021, reference: "20d", volumeMultiple: 1.8 },
      { symbol: "SMR", distanceFromHigh: 0.011, reference: "52w", volumeMultiple: 2.5 },
    ],
    distribution: [
      { label: "<-5%", value: 1 },
      { label: "-5% to 0%", value: 4 },
      { label: "0% to +5%", value: 7 },
      { label: "+5% to +10%", value: 3 },
      { label: ">+10%", value: 2 },
    ],
    tapeChecks: {
      newHighsToday: 3,
      above50dmaRising: false,
      newToTop20: true,
    },
    risk: {
      above200dma: 0.41,
    },
    entersTop20ThisWeek: true,
    breadthTrendStreak: -3,
    rotationSignal: "up",
    persistenceBonus: true,
  },
  {
    id: "industrial-ai",
    name: "Industrial AI",
    activeCount: 21,
    rank: 5,
    score: 0.96,
    scoreComponents: {
      return1d: 0.22,
      return1w: 0.18,
      return4w: 0.36,
      return13w: 0.22,
      breadth: 0.02,
      volumePulse: -0.04,
    },
    returns: {
      d: 0.006,
      w1: 0.018,
      w4: 0.054,
      w13: 0.094,
    },
    breadth: {
      above20: 0.62,
      above50: 0.52,
      newHighsToday: 0.07,
      trend: "rising",
    },
    breakoutDensity: 0.08,
    volumePulse: 0.34,
    medianVolumeZ: 0.2,
    liquidity: 28,
    volatility: 0.031,
    breakouts: {
      highs: 2,
      lows: 1,
    },
    topTickers: [
      { symbol: "HON", change1d: 0.007, volumeMultiple: 1.1, spark: createSpark(1.02, 0.12) },
      { symbol: "GE", change1d: 0.009, volumeMultiple: 1.3, spark: createSpark(1.03, 0.16) },
      { symbol: "DE", change1d: 0.004, volumeMultiple: 1.0, spark: createSpark(1.01, 0.1) },
      { symbol: "CAT", change1d: -0.003, volumeMultiple: 0.9, spark: createSpark(0.99, 0.1) },
      { symbol: "IR", change1d: 0.012, volumeMultiple: 1.4, spark: createSpark(1.04, 0.18) },
      { symbol: "ROK", change1d: 0.011, volumeMultiple: 1.2, spark: createSpark(1.03, 0.16) },
    ],
    nearBreakouts: [
      { symbol: "IR", distanceFromHigh: 0.022, reference: "20d", volumeMultiple: 1.3 },
      { symbol: "GE", distanceFromHigh: 0.017, reference: "52w", volumeMultiple: 1.4 },
    ],
    distribution: [
      { label: "<-5%", value: 0 },
      { label: "-5% to 0%", value: 7 },
      { label: "0% to +5%", value: 10 },
      { label: "+5% to +10%", value: 3 },
      { label: ">+10%", value: 1 },
    ],
    tapeChecks: {
      newHighsToday: 1,
      above50dmaRising: true,
      newToTop20: false,
    },
    risk: {
      above200dma: 0.62,
    },
    entersTop20ThisWeek: false,
    breadthTrendStreak: 2,
    rotationSignal: null,
  },
  {
    id: "crypto",
    name: "Crypto",
    activeCount: 15,
    rank: 6,
    score: 0.74,
    scoreComponents: {
      return1d: 0.12,
      return1w: 0.14,
      return4w: 0.28,
      return13w: 0.18,
      breadth: -0.1,
      volumePulse: 0.12,
    },
    returns: {
      d: -0.012,
      w1: 0.014,
      w4: 0.041,
      w13: 0.084,
    },
    breadth: {
      above20: 0.38,
      above50: 0.34,
      newHighsToday: 0.04,
      trend: "falling",
    },
    breakoutDensity: 0.12,
    volumePulse: 0.66,
    medianVolumeZ: 1.9,
    liquidity: 18,
    volatility: 0.048,
    breakouts: {
      highs: 3,
      lows: 2,
    },
    topTickers: [
      { symbol: "COIN", change1d: -0.018, volumeMultiple: 2.4, spark: createSpark(1.05, 0.32) },
      { symbol: "MSTR", change1d: -0.026, volumeMultiple: 2.7, spark: createSpark(1.08, 0.38) },
      { symbol: "RIOT", change1d: 0.015, volumeMultiple: 1.9, spark: createSpark(1.06, 0.34) },
      { symbol: "MARA", change1d: 0.019, volumeMultiple: 2.1, spark: createSpark(1.07, 0.36) },
      { symbol: "HOOD", change1d: 0.008, volumeMultiple: 1.6, spark: createSpark(1.03, 0.2) },
    ],
    nearBreakouts: [
      { symbol: "RIOT", distanceFromHigh: 0.021, reference: "20d", volumeMultiple: 1.8 },
      { symbol: "MARA", distanceFromHigh: 0.019, reference: "52w", volumeMultiple: 2.0 },
    ],
    distribution: [
      { label: "<-5%", value: 2 },
      { label: "-5% to 0%", value: 4 },
      { label: "0% to +5%", value: 6 },
      { label: "+5% to +10%", value: 2 },
      { label: ">+10%", value: 1 },
    ],
    tapeChecks: {
      newHighsToday: 1,
      above50dmaRising: false,
      newToTop20: true,
    },
    risk: {
      above200dma: 0.36,
    },
    entersTop20ThisWeek: true,
    breadthTrendStreak: -2,
    rotationSignal: null,
  },
  {
    id: "airlines",
    name: "Airlines",
    activeCount: 24,
    rank: 7,
    score: 0.52,
    scoreComponents: {
      return1d: -0.22,
      return1w: 0.04,
      return4w: 0.18,
      return13w: 0.08,
      breadth: -0.18,
      volumePulse: 0.06,
    },
    returns: {
      d: -0.021,
      w1: -0.004,
      w4: 0.032,
      w13: 0.058,
    },
    breadth: {
      above20: 0.32,
      above50: 0.28,
      newHighsToday: 0.01,
      trend: "falling",
    },
    breakoutDensity: 0.04,
    volumePulse: 0.38,
    medianVolumeZ: 0.4,
    liquidity: 12,
    volatility: 0.036,
    breakouts: {
      highs: 1,
      lows: 4,
    },
    topTickers: [
      { symbol: "DAL", change1d: -0.016, volumeMultiple: 1.3, spark: createSpark(0.98, 0.16) },
      { symbol: "UAL", change1d: -0.022, volumeMultiple: 1.4, spark: createSpark(0.96, 0.18) },
      { symbol: "LUV", change1d: -0.018, volumeMultiple: 1.2, spark: createSpark(0.94, 0.16) },
      { symbol: "AAL", change1d: -0.027, volumeMultiple: 1.6, spark: createSpark(0.92, 0.2) },
      { symbol: "JBLU", change1d: -0.034, volumeMultiple: 1.7, spark: createSpark(0.9, 0.22) },
    ],
    nearBreakouts: [
      { symbol: "ALK", distanceFromHigh: 0.038, reference: "20d", volumeMultiple: 1.1 },
    ],
    distribution: [
      { label: "<-5%", value: 5 },
      { label: "-5% to 0%", value: 9 },
      { label: "0% to +5%", value: 7 },
      { label: "+5% to +10%", value: 2 },
      { label: ">+10%", value: 1 },
    ],
    tapeChecks: {
      newHighsToday: 0,
      above50dmaRising: false,
      newToTop20: false,
    },
    risk: {
      above200dma: 0.29,
    },
    entersTop20ThisWeek: false,
    breadthTrendStreak: -4,
    rotationSignal: "down",
    advFloorBreached: true,
  },
  {
    id: "solar",
    name: "Solar",
    activeCount: 18,
    rank: 8,
    score: 0.41,
    scoreComponents: {
      return1d: -0.12,
      return1w: 0.06,
      return4w: 0.2,
      return13w: -0.14,
      breadth: -0.24,
      volumePulse: 0.05,
    },
    returns: {
      d: -0.028,
      w1: -0.006,
      w4: 0.021,
      w13: -0.034,
    },
    breadth: {
      above20: 0.22,
      above50: 0.18,
      newHighsToday: 0.0,
      trend: "falling",
    },
    breakoutDensity: 0.02,
    volumePulse: 0.41,
    medianVolumeZ: 0.6,
    liquidity: 9,
    volatility: 0.052,
    breakouts: {
      highs: 0,
      lows: 6,
    },
    topTickers: [
      { symbol: "FSLR", change1d: -0.021, volumeMultiple: 1.4, spark: createSpark(0.97, 0.18) },
      { symbol: "SPWR", change1d: -0.033, volumeMultiple: 1.8, spark: createSpark(0.92, 0.22) },
      { symbol: "ENPH", change1d: -0.028, volumeMultiple: 1.6, spark: createSpark(0.94, 0.2) },
      { symbol: "SEDG", change1d: -0.031, volumeMultiple: 1.7, spark: createSpark(0.91, 0.24) },
      { symbol: "RUN", change1d: -0.036, volumeMultiple: 1.9, spark: createSpark(0.9, 0.26) },
    ],
    nearBreakouts: [
      { symbol: "FSLR", distanceFromHigh: 0.061, reference: "20d", volumeMultiple: 1.3 },
    ],
    distribution: [
      { label: "<-5%", value: 6 },
      { label: "-5% to 0%", value: 8 },
      { label: "0% to +5%", value: 3 },
      { label: "+5% to +10%", value: 1 },
      { label: ">+10%", value: 0 },
    ],
    tapeChecks: {
      newHighsToday: 0,
      above50dmaRising: false,
      newToTop20: false,
    },
    risk: {
      above200dma: 0.18,
    },
    entersTop20ThisWeek: false,
    breadthTrendStreak: -5,
    rotationSignal: "down",
    advFloorBreached: true,
  },
];
