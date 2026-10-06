export interface ResearchInfrastructureStats {
  researchStation1Count: number;
  researchStation1CapCount: number;
  researchStation2Count: number;
  researchStation2CapCount: number;
  researchStation2ResearchValue: number;
  researchStation3Count: number;
  researchStation3EffectiveAmount: number;
  researchStation3CapEffectiveAmount: number;
  researchStation3ResearchValue: number;
  researchStation3With4Count: number;
  researchStation4EffectiveAmount: number;
  researchStation4CapEffectiveAmount: number;
  researchStation4ResearchValue: number;
  researchStation4RawCount: number;
  satelliteDishControllerCount: number;
  satelliteDishCount: number;
  satelliteDishResearchPoints: number;
  optimalSatelliteDishCount: number;
}

export const EMPTY_RESEARCH_INFRASTRUCTURE_STATS: ResearchInfrastructureStats = {
  researchStation1Count: 0,
  researchStation1CapCount: 0,
  researchStation2Count: 0,
  researchStation2CapCount: 0,
  researchStation2ResearchValue: 0,
  researchStation3Count: 0,
  researchStation3EffectiveAmount: 0,
  researchStation3CapEffectiveAmount: 0,
  researchStation3ResearchValue: 0,
  researchStation3With4Count: 0,
  researchStation4EffectiveAmount: 0,
  researchStation4CapEffectiveAmount: 0,
  researchStation4ResearchValue: 0,
  researchStation4RawCount: 0,
  satelliteDishControllerCount: 0,
  satelliteDishCount: 0,
  satelliteDishResearchPoints: 0,
  optimalSatelliteDishCount: 0,
};

export interface ResearchTierStats {
  rpCap: number;
  rpPerSecond: number;
}

export interface ResearchOutputStats {
  researchStation1: ResearchTierStats;
  researchStation2: ResearchTierStats;
  researchStation3: ResearchTierStats;
  researchStation4: ResearchTierStats;
  satelliteEfficiencyPercent: number;
  satelliteBoostPercent: number;
  satelliteBonusRpPerSecond: number;
  currentRpPerSecond: number;
}

export function getResearchStationEffectiveAmount(
  firstProductSellPrice: number,
  secondProductSellPrice: number,
  stationCount: number,
  hasRs4Buff = false,
): number {
  const averageSellPrice =
    (Math.max(0, firstProductSellPrice) + Math.max(0, secondProductSellPrice)) / 2;
  const normalizedValue = averageSellPrice / 600;
  const moneyBuff =
    normalizedValue < 1
      ? Math.log2(Math.max(0, Math.min(normalizedValue, 1)) + 1)
      : Math.log(normalizedValue) / Math.log(4) + 1;
  return moneyBuff * Math.max(0, stationCount) * (hasRs4Buff ? 2 : 1);
}

function calculateStationCap(tier: number, amount: number): number {
  if (amount <= 0) return 0;
  if (tier === 1) return 200 * Math.log2(amount + 1);
  if (tier === 2) return 2000 * Math.log2(amount + 1);
  if (tier === 3) return 16500 * (Math.log2(amount + 1) + Math.sqrt(amount));
  return 150000 * (Math.log2(amount + 1) + Math.pow(amount, 0.9));
}

function calculateStationRpPerSecond(
  tier: number,
  amount: number,
  researchValue: number,
  rpCap: number,
  currentResearchPoints: number,
): number {
  if (rpCap <= 0 || amount <= 0) return 0;
  const factor = Math.max(currentResearchPoints / rpCap, 1);
  if (tier === 1) {
    return Math.sqrt(amount) * Math.pow(10, 1 - factor);
  }
  if (tier === 4) {
    return 2 * Math.pow(researchValue, 0.6) * Math.pow(10, 1 - Math.sqrt(factor));
  }
  return 2 * Math.pow(researchValue, 0.6) * Math.pow(10, 1 - factor);
}

export function calculateResearchOutput(
  infrastructure: ResearchInfrastructureStats,
  currentResearchPoints: number,
): ResearchOutputStats {
  const currentRp = Number.isFinite(currentResearchPoints)
    ? Math.max(0, currentResearchPoints)
    : 0;
  const tier1Cap = calculateStationCap(1, infrastructure.researchStation1CapCount);
  const tier2Cap = calculateStationCap(2, infrastructure.researchStation2CapCount);
  const tier3Cap = calculateStationCap(3, infrastructure.researchStation3CapEffectiveAmount);
  const tier4Cap = calculateStationCap(4, infrastructure.researchStation4CapEffectiveAmount);
  const tier4Buff = tier4Cap * 0.000025 * infrastructure.researchStation4RawCount;

  const researchStation1RpPerSecond = calculateStationRpPerSecond(
    1,
    infrastructure.researchStation1Count,
    0,
    tier1Cap,
    currentRp,
  );
  const researchStation2RpPerSecond = calculateStationRpPerSecond(
    2,
    infrastructure.researchStation2Count,
    infrastructure.researchStation2ResearchValue,
    tier2Cap,
    currentRp,
  );
  const researchStation3RpPerSecond = calculateStationRpPerSecond(
    3,
    infrastructure.researchStation3EffectiveAmount,
    infrastructure.researchStation3ResearchValue,
    tier3Cap,
    currentRp,
  );
  const researchStation4RpPerSecond =
    calculateStationRpPerSecond(
      4,
      infrastructure.researchStation4EffectiveAmount,
      infrastructure.researchStation4ResearchValue,
      tier4Cap,
      currentRp,
    ) + (currentRp < tier4Cap ? tier4Buff : 0);

  const satelliteRequiredDishAmount =
    infrastructure.satelliteDishControllerCount > 0
      ? Math.sqrt(
          infrastructure.satelliteDishControllerCount * infrastructure.satelliteDishResearchPoints,
        ) + infrastructure.satelliteDishControllerCount
      : 0;
  const satelliteEfficiencyPercent =
    satelliteRequiredDishAmount > 0
      ? Math.min(100, (infrastructure.satelliteDishCount * 100) / satelliteRequiredDishAmount)
      : 0;
  const satelliteBoostAtFullEfficiencyPercent =
    78 * Math.max(Math.log10(infrastructure.satelliteDishResearchPoints + 1), 0);
  const satelliteBoostPercent =
    satelliteBoostAtFullEfficiencyPercent * (satelliteEfficiencyPercent / 100);
  const satelliteMultiplier = 1 + satelliteBoostPercent / 100;
  const preSatelliteRpPerSecond =
    researchStation1RpPerSecond +
    researchStation2RpPerSecond +
    researchStation3RpPerSecond +
    researchStation4RpPerSecond;
  const satelliteBonusRpPerSecond =
    preSatelliteRpPerSecond * (satelliteBoostPercent / 100);
  const currentRpPerSecond = preSatelliteRpPerSecond * satelliteMultiplier;

  return {
    researchStation1: {
      rpCap: tier1Cap,
      rpPerSecond: researchStation1RpPerSecond,
    },
    researchStation2: {
      rpCap: tier2Cap,
      rpPerSecond: researchStation2RpPerSecond,
    },
    researchStation3: {
      rpCap: tier3Cap,
      rpPerSecond: researchStation3RpPerSecond,
    },
    researchStation4: {
      rpCap: tier4Cap,
      rpPerSecond: researchStation4RpPerSecond,
    },
    satelliteEfficiencyPercent,
    satelliteBoostPercent,
    satelliteBonusRpPerSecond,
    currentRpPerSecond,
  };
}

export function getOptimalSatelliteDishCount(
  controllerCount: number,
  researchPoints: number,
): number {
  const controllers = Math.max(0, controllerCount);
  const points = Math.max(0, researchPoints);
  if (controllers === 0) return 0;
  return Math.ceil(controllers + Math.sqrt(controllers * points));
}
