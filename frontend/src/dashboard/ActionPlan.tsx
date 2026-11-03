import { hypothesisName } from "../format";

/** Maintenance guidance for one base fault class. Static engineering practice, not
 * machine-specific instructions; shown under the diagnosis so an engineer sees what
 * to do about the finding, not only its probability. */
type FaultGuide = {
  lookAt: string;
  rootCauses: string[];
  actions: string[];
  verify: string;
};

const GUIDES: Record<string, FaultGuide> = {
  imbalance: {
    lookAt: "Rotor disc and anything mounted on it (fans, blades, balance weights)",
    rootCauses: [
      "Lost or loosened balance weight",
      "Deposit build-up or erosion on the rotor",
      "A repair that changed the mass distribution (new weld, replaced blade)",
    ],
    actions: [
      "Lock out the machine; inspect the rotor for deposits, damage and missing weights, and clean it",
      "Check that any recently replaced part matches the original's mass",
      "Field-balance the rotor to the machine's ISO 21940 balance grade",
    ],
    verify:
      "The 1x amplitude falls at the speed that showed it, and no longer grows near the critical speed.",
  },
  misalignment: {
    lookAt: "Coupling and motor mounting",
    rootCauses: [
      "Motor re-mounted or moved since the last alignment",
      "Soft foot: one mounting foot not sitting flat",
      "Thermal growth since a cold alignment",
      "Worn coupling element",
    ],
    actions: [
      "Lock out the machine; inspect the coupling element for wear and the mounting bolts for torque",
      "Check for soft foot with a dial indicator before aligning",
      "Laser-align the shafts to the coupling maker's tolerance, at operating temperature if possible",
    ],
    verify: "The 2x line falls back toward the sensor floor under load and the bearing runs cooler.",
  },
  friction: {
    lookAt: "Bearings, their seals and lubrication",
    rootCauses: [
      "Missed lubrication interval, or wrong or aged grease",
      "Seal failure letting in contamination",
      "Bearing wear from any of the above",
    ],
    actions: [
      "If the bearing temperature is still climbing, stop the machine",
      "Relubricate with the specified grease and quantity",
      "If the broadband floor or the temperature stays high afterwards, replace the bearing and seal and fix the lubrication schedule",
    ],
    verify:
      "The bearing temperature returns to its baseline and the broadband floor drops at the same speed and load.",
  },
  healthy: {
    lookAt: "No component implicated",
    rootCauses: [],
    actions: [
      "Keep the routine monitoring interval",
      "Recheck if the alarm repeats, and compare against these recorded readings",
    ],
    verify: "Readings stay at their reference levels on the next routine check.",
  },
};

/** Practical ordering notes when two faults are present at once. */
const COMBINATION_NOTES: Record<string, string> = {
  "imbalance+misalignment":
    "Align first, then balance: misalignment distorts the 1x reading a balancing job relies on.",
  "imbalance+friction":
    "Restore the bearing first, then re-measure: a dry bearing raises the noise floor that hides balancing results.",
};

export default function ActionPlan({ hypothesis }: { hypothesis: string }) {
  const parts = hypothesis.split("+").filter((part) => part in GUIDES);
  if (parts.length === 0) return null;
  const note = COMBINATION_NOTES[hypothesis];

  return (
    <section aria-labelledby="action-plan-heading" className="space-y-2 rounded border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-700 dark:bg-slate-800/50">
      <h4 id="action-plan-heading" className="font-semibold">
        Action plan — {hypothesisName(hypothesis)}
      </h4>
      {note ? <p className="font-medium">{note}</p> : null}
      {parts.map((part) => {
        const guide = GUIDES[part];
        return (
          <div key={part} className="space-y-1">
            {parts.length > 1 ? (
              <h5 className="font-medium">{hypothesisName(part)}</h5>
            ) : null}
            <p>
              <span className="font-medium">Where to look: </span>
              {guide.lookAt}.
            </p>
            {guide.rootCauses.length > 0 ? (
              <p>
                <span className="font-medium">Likely root causes: </span>
                {guide.rootCauses.join("; ").toLowerCase()}.
              </p>
            ) : null}
            <ol className="list-inside list-decimal space-y-0.5">
              {guide.actions.map((action) => (
                <li key={action}>{action}</li>
              ))}
            </ol>
            <p>
              <span className="font-medium">Confirm the fix: </span>
              {guide.verify}
            </p>
          </div>
        );
      })}
      <p className="text-xs text-slate-500 dark:text-slate-400">
        General guidance for this fault class, not a machine-specific work order.
      </p>
    </section>
  );
}
