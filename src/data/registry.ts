import type { SpecialRecipe } from '../types/specialRecipes';
import { air_separation_unit } from './special_recipes/air_separation_unit';
import {
  alloyer_ferroaluminium,
  alloyer_purple_gold,
  alloyer_brass,
} from './special_recipes/alloyer';
import {
  boiler_standard,
  boiler_preheater,
  boiler_self_heating,
  boiler_coolant_loop,
} from './special_recipes/boiler';
import { chemical_plant_recipes } from './special_recipes/chemical_plant';
import { coal_liquefaction_01 } from './special_recipes/coal_liquefaction_plant';
import { cooling_tower_01 } from './special_recipes/cooling_tower';
import {
  electric_water_heater_01,
  electric_water_heater_02,
  electric_water_heater_03,
} from './special_recipes/electric_water_heater';
import {
  geothermal_well_01,
  geothermal_well_02,
  geothermal_well_03,
} from './special_recipes/geothermal_well';
import { hand_crank_mk2_01 } from './special_recipes/hand_crank_mk2';
import {
  heat_exchanger_standard,
  heat_exchanger_preheat,
} from './special_recipes/heat_exchanger';
import { huge_truck_depot_01 } from './special_recipes/huge_truck_depot';
import {
  m_industrial_drill_01,
  m_industrial_drill_02,
  m_industrial_drill_03,
} from './special_recipes/industrial_drill';
import {
  industrial_firebox_01,
  industrial_firebox_02,
  industrial_firebox_03,
  industrial_firebox_04,
  industrial_firebox_05,
  industrial_firebox_06,
  industrial_firebox_07,
} from './special_recipes/industrial_firebox';
import { large_liquid_truck_depot_01 } from './special_recipes/large_liquid_truck_depot';
import { large_turbine_01 } from './special_recipes/large_turbine';
import { liquid_burner_01 } from './special_recipes/liquid_burner';
import { liquid_dump_01 } from './special_recipes/liquid_dump';
import { liquid_truck_depot_01 } from './special_recipes/liquid_truck_depot';
import { logic_assembler_01 } from './special_recipes/logic_assembler';
import { m_mineshaft_drill_01 } from './special_recipes/mineshaft_drill';
import { m_research_station2_01 } from './special_recipes/research_station2';
import { m_research_station3_01 } from './special_recipes/research_station3';
import { satellite_dish_controller_01 } from './special_recipes/satellite_dish_controller';
import {
  steam_cracking_plant_01,
  steam_cracking_plant_02,
  steam_cracking_plant_03,
} from './special_recipes/steam_cracking_plant';
import { steam_turbine_01 } from './special_recipes/steam_turbine';
import { tree_farm_01 } from './special_recipes/tree_farm';
import { m_truck_depot_01 } from './special_recipes/truck_depot';
import { m_van_depot_01 } from './special_recipes/van_depot';
import {
  vertical_heat_exchanger_standard,
  vertical_heat_exchanger_preheat,
} from './special_recipes/vertical_heat_exchanger';
import { underground_waste_facility_01 } from './special_recipes/underground_waste_facility';
import {
  water_treatment_plant_01,
  water_treatment_plant_02,
  water_treatment_plant_03,
} from './special_recipes/water_treatment_plant';

export const SPECIAL_RECIPES: Record<string, SpecialRecipe> = {
  [air_separation_unit.id]: air_separation_unit,
  [alloyer_ferroaluminium.id]: alloyer_ferroaluminium,
  [alloyer_purple_gold.id]: alloyer_purple_gold,
  [alloyer_brass.id]: alloyer_brass,
  [boiler_standard.id]: boiler_standard,
  [boiler_preheater.id]: boiler_preheater,
  [boiler_self_heating.id]: boiler_self_heating,
  [boiler_coolant_loop.id]: boiler_coolant_loop,
  [coal_liquefaction_01.id]: coal_liquefaction_01,
  [cooling_tower_01.id]: cooling_tower_01,
  [electric_water_heater_01.id]: electric_water_heater_01,
  [electric_water_heater_02.id]: electric_water_heater_02,
  [electric_water_heater_03.id]: electric_water_heater_03,
  [geothermal_well_01.id]: geothermal_well_01,
  [geothermal_well_02.id]: geothermal_well_02,
  [geothermal_well_03.id]: geothermal_well_03,
  [hand_crank_mk2_01.id]: hand_crank_mk2_01,
  [heat_exchanger_standard.id]: heat_exchanger_standard,
  [heat_exchanger_preheat.id]: heat_exchanger_preheat,
  [huge_truck_depot_01.id]: huge_truck_depot_01,
  [m_industrial_drill_01.id]: m_industrial_drill_01,
  [m_industrial_drill_02.id]: m_industrial_drill_02,
  [m_industrial_drill_03.id]: m_industrial_drill_03,
  [industrial_firebox_01.id]: industrial_firebox_01,
  [industrial_firebox_02.id]: industrial_firebox_02,
  [industrial_firebox_03.id]: industrial_firebox_03,
  [industrial_firebox_04.id]: industrial_firebox_04,
  [industrial_firebox_05.id]: industrial_firebox_05,
  [industrial_firebox_06.id]: industrial_firebox_06,
  [industrial_firebox_07.id]: industrial_firebox_07,
  [large_liquid_truck_depot_01.id]: large_liquid_truck_depot_01,
  [large_turbine_01.id]: large_turbine_01,
  [liquid_burner_01.id]: liquid_burner_01,
  [liquid_dump_01.id]: liquid_dump_01,
  [liquid_truck_depot_01.id]: liquid_truck_depot_01,
  [logic_assembler_01.id]: logic_assembler_01,
  [m_mineshaft_drill_01.id]: m_mineshaft_drill_01,
  [m_research_station2_01.id]: m_research_station2_01,
  [m_research_station3_01.id]: m_research_station3_01,
  [satellite_dish_controller_01.id]: satellite_dish_controller_01,
  [steam_cracking_plant_01.id]: steam_cracking_plant_01,
  [steam_cracking_plant_02.id]: steam_cracking_plant_02,
  [steam_cracking_plant_03.id]: steam_cracking_plant_03,
  [steam_turbine_01.id]: steam_turbine_01,
  [tree_farm_01.id]: tree_farm_01,
  [m_truck_depot_01.id]: m_truck_depot_01,
  [m_van_depot_01.id]: m_van_depot_01,
  [vertical_heat_exchanger_standard.id]: vertical_heat_exchanger_standard,
  [vertical_heat_exchanger_preheat.id]: vertical_heat_exchanger_preheat,
  [underground_waste_facility_01.id]: underground_waste_facility_01,
  [water_treatment_plant_01.id]: water_treatment_plant_01,
  [water_treatment_plant_02.id]: water_treatment_plant_02,
  [water_treatment_plant_03.id]: water_treatment_plant_03,
};

for (const cp of chemical_plant_recipes) {
  SPECIAL_RECIPES[cp.id] = cp;
}

export function getSpecialRecipe(recipeId: string): SpecialRecipe | undefined {
  return SPECIAL_RECIPES[recipeId];
}

export function getAllSpecialRecipes(): SpecialRecipe[] {
  return Object.values(SPECIAL_RECIPES);
}
