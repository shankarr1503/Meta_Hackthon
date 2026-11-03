import type { Player } from "../state/useInvestigation";
import { frameLabel } from "../state/player";

const BUTTON =
  "rounded border border-slate-300 px-3 py-1 text-sm hover:bg-slate-100 disabled:opacity-40 " +
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 " +
  "dark:border-slate-700 dark:hover:bg-slate-800";

export default function PlayerControls({ player }: { player: Player }) {
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Player controls">
      <button type="button" className={BUTTON} onClick={player.restart} disabled={player.atStart}>
        ⏮ Restart
      </button>
      <button type="button" className={BUTTON} onClick={player.back} disabled={player.atStart}>
        ◀ Back
      </button>
      {player.playing ? (
        <button type="button" className={BUTTON} onClick={player.pause}>
          ⏸ Pause
        </button>
      ) : (
        <button type="button" className={BUTTON} onClick={player.play}>
          ▶ Play
        </button>
      )}
      <button type="button" className={BUTTON} onClick={player.forward} disabled={player.atEnd}>
        Forward ▶
      </button>
      <button type="button" className={BUTTON} onClick={player.toEnd} disabled={player.atEnd}>
        Skip to end ⏭
      </button>
      <span className="ml-2 text-sm text-slate-600 dark:text-slate-400" aria-live="polite">
        {frameLabel(player.view.frame)} · {player.index + 1} / {player.total}
      </span>
    </div>
  );
}
