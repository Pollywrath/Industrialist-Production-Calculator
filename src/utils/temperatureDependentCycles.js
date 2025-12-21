/**
 * Temperature-dependent cycle time calculations for various machines
 */

/**
 * Industrial Drill
 * - For T <= 0 : returns Infinity (seconds → ∞)
 * - For 0 < T < 400 : s = 800 / T
 * - For T >= 400 : s = 2
 */
export function industrialDrillSeconds(tempC) {
  if (tempC <= 0) return Infinity;
  if (tempC >= 400) return 2;
  return 800 / tempC;
}

/**
 * Alloyer
 * - T <= 0    => 40s
 * - 0 < T <=300 => s = 1500/T + 5
 * - 300 < T <350 => linear from 10 @300 to 8 @350 : 10 - (T-300)/25
 * - T >= 350  => 8s
 */
export function alloyerSeconds(tempC) {
  if (tempC <= 0) return 40;
  if (tempC <= 300) return 1500 / tempC + 5;
  if (tempC < 350) return 10 - (tempC - 300) / 25;
  return 8;
}

/**
 * Coal Liquefaction Plant
 * - T <= 18  => 88s
 * - 18 < T <= 300 => s = 3000/T + 10
 * - 300 < T < 350 => linear from 20 @300 to 10 @350 : 20 - 0.2*(T-300)
 * - T >= 350 => 10s
 */
export function coalLiquefactionSeconds(tempC) {
  if (tempC <= 18) return 88;
  if (tempC <= 300) return 3000 / tempC + 10;
  if (tempC < 350) return 20 - 0.2 * (tempC - 300);
  return 10;
}

/**
 * Steam Cracking Plant
 * - T <= 0                       => 30s
 * - 0 < T <= 2973/11             => linear piece passing (0,30) and (2973/11,7.5)
 *     s = 30 + m1 * T, where m1 = -165/1982
 * - 2973/11 < T < 4000/11       => linear piece passing (2973/11,7.5) and (4000/11,3)
 *     s = m2 * T + b  where m2 = -99/2054, b = 21081/1027
 * - T >= 4000/11                 => 3s
 */
export function steamCrackingSeconds(tempC) {
  if (tempC <= 0) return 30;

  const T3 = 2973 / 11;  // ~270.27°C -> 7.5s point
  const T4 = 4000 / 11;  // ~363.64°C -> 3s point

  if (tempC <= T3) {
    // slope m1 = -165/1982
    const m1 = -165 / 1982;
    return 30 + m1 * tempC;
  }

  if (tempC < T4) {
    // slope m2 = -99/2054, intercept b = 21081/1027
    const m2 = -99 / 2054;
    const b = 21081 / 1027;
    return m2 * tempC + b;
  }

  return 3;
}

/**
 * Water Treatment Plant - Cycle time calculation
 * Formula: 64 / (0.176 * |Temperature|)
 * Equivalent to: 363.636... / Temperature
 * 
 * - tempC: numeric, temperature in °C
 * 
 * Returns seconds per 64 units, or Infinity if temperature is zero/undefined.
 */
export function waterCycleTimePerUnit(tempC) {
  return tempC <= 0 ? Infinity : 64 / (0.176 * Math.abs(tempC));
}

export const TEMP_DEPENDENT_MACHINES = {
  m_industrial_drill: { type: 'steam_input', formula: industrialDrillSeconds },
  m_alloyer: { type: 'steam_input', formula: alloyerSeconds },
  m_coal_liquefaction_plant: { type: 'steam_input', formula: coalLiquefactionSeconds },
  m_steam_cracking_plant: { type: 'steam_input', formula: steamCrackingSeconds },
  m_water_treatment_plant: { type: 'steam_input', formula: waterCycleTimePerUnit }
};

/**
 * Check if a machine has temperature-dependent behavior
 */
export function hasTempDependentCycle(machineId) {
  return machineId in TEMP_DEPENDENT_MACHINES;
}

/**
 * Get the cycle time for a temperature-dependent machine
 * @param {string} machineId - The machine ID
 * @param {number} inputTemp - The input steam/water temperature in °C
 * @param {number} baseCycleTime - The base cycle time from the recipe (fallback)
 * @returns {number} The calculated cycle time in seconds
 */
export function getTempDependentCycleTime(machineId, inputTemp, baseCycleTime) {
  const machine = TEMP_DEPENDENT_MACHINES[machineId];
  if (!machine) return baseCycleTime;
  
  // For all temperature-dependent machines (including water treatment)
  const calculatedTime = machine.formula(inputTemp);
  return isFinite(calculatedTime) ? calculatedTime : baseCycleTime;
}

/**
 * Check if a recipe uses steam as input (for steam cracking plant)
 */
export function recipeUsesSteam(recipe) {
  if (!recipe || !recipe.inputs) return false;
  return recipe.inputs.some(input => 
    ['p_steam', 'p_low_pressure_steam', 'p_high_pressure_steam'].includes(input.product_id)
  );
}

/**
 * Get the index of the steam input in a recipe
 */
export function getSteamInputIndex(recipe) {
  if (!recipe || !recipe.inputs) return -1;
  return recipe.inputs.findIndex(input => 
    ['p_steam', 'p_low_pressure_steam', 'p_high_pressure_steam'].includes(input.product_id)
  );
}
