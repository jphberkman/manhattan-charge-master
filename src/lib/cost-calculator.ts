export interface PlanDetails {
  annualDeductible: number;      // e.g. 2500
  deductibleMet: number;         // e.g. 1200 (already paid toward deductible this year)
  coinsurancePercent: number;    // e.g. 20 (patient's share as 0-100)
  oopMax: number;                // e.g. 8500
  oopSpent: number;              // e.g. 3000 (already applied to OOP max this year)
}

export interface CostBreakdown {
  totalCharge: number;           // the negotiated rate
  deductiblePortion: number;     // what goes toward remaining deductible
  coinsurancePortion: number;    // patient's coinsurance share
  patientCost: number;           // final patient cost (capped at OOP remaining)
  insurerPays: number;           // what insurance covers
  oopCapApplied: boolean;        // true if OOP max capped the cost
  deductibleRemaining: number;   // deductible remaining BEFORE this procedure
  oopRemaining: number;          // OOP max remaining BEFORE this procedure
}

/**
 * Calculate the patient's actual cost for a procedure given their plan details.
 *
 * Logic:
 * 1. Compute how much deductible is still remaining.
 * 2. The charge first fills the remaining deductible (patient pays 100% of that portion).
 * 3. Any charge above the deductible is split by coinsurance (patient pays their %).
 * 4. Total patient responsibility is capped at the remaining OOP maximum.
 * 5. Insurance pays whatever the patient doesn't.
 */
export function calculatePatientCost(
  totalCharge: number,
  plan: PlanDetails,
): CostBreakdown {
  const deductibleRemaining = Math.max(0, plan.annualDeductible - plan.deductibleMet);
  const oopRemaining = Math.max(0, plan.oopMax - plan.oopSpent);

  let deductiblePortion: number;
  let coinsurancePortion: number;

  if (totalCharge <= deductibleRemaining) {
    // Entire charge falls within the remaining deductible
    deductiblePortion = totalCharge;
    coinsurancePortion = 0;
  } else {
    // Patient pays all remaining deductible, then coinsurance on the rest
    deductiblePortion = deductibleRemaining;
    const afterDeductible = totalCharge - deductibleRemaining;
    coinsurancePortion = afterDeductible * (plan.coinsurancePercent / 100);
  }

  const rawPatientCost = deductiblePortion + coinsurancePortion;
  const oopCapApplied = rawPatientCost > oopRemaining;
  const patientCost = Math.min(rawPatientCost, oopRemaining);
  const insurerPays = totalCharge - patientCost;

  return {
    totalCharge,
    deductiblePortion: oopCapApplied ? Math.min(deductiblePortion, patientCost) : deductiblePortion,
    coinsurancePortion: oopCapApplied
      ? Math.max(0, patientCost - Math.min(deductiblePortion, patientCost))
      : coinsurancePortion,
    patientCost,
    insurerPays,
    oopCapApplied,
    deductibleRemaining,
    oopRemaining,
  };
}

/**
 * Simplified cost calculation using only a flat coinsurance percentage.
 * For users who haven't entered full plan details.
 */
export function calculateSimpleCost(
  totalCharge: number,
  coinsurancePercent: number,
): CostBreakdown {
  const patientCost = totalCharge * (coinsurancePercent / 100);
  const insurerPays = totalCharge - patientCost;

  return {
    totalCharge,
    deductiblePortion: 0,
    coinsurancePortion: patientCost,
    patientCost,
    insurerPays,
    oopCapApplied: false,
    deductibleRemaining: 0,
    oopRemaining: 0,
  };
}
