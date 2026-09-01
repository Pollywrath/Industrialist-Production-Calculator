export interface ResearchInfrastructureStats {
  researchStation1Count: number;
  researchStation2Count: number;
  researchStation3Count: number;
  researchStation3With4Count: number;
  satelliteDishControllerCount: number;
  satelliteDishCount: number;
  satelliteDishResearchPoints: number;
  optimalSatelliteDishCount: number;
}

export const EMPTY_RESEARCH_INFRASTRUCTURE_STATS: ResearchInfrastructureStats = {
  researchStation1Count: 0,
  researchStation2Count: 0,
  researchStation3Count: 0,
  researchStation3With4Count: 0,
  satelliteDishControllerCount: 0,
  satelliteDishCount: 0,
  satelliteDishResearchPoints: 0,
  optimalSatelliteDishCount: 0,
};

export function getOptimalSatelliteDishCount(
  controllerCount: number,
  researchPoints: number,
): number {
  const controllers = Math.max(0, controllerCount);
  const points = Math.max(0, researchPoints);
  if (controllers === 0) return 0;
  return Math.ceil(controllers + Math.sqrt(controllers * points));
}
