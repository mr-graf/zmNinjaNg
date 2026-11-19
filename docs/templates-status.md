# Templates — working state and backlog

## Current state (as of 2026-11-19, commit 5740acae)

The first template (one large cell on the left, three stacked on the right,
four in a row at the bottom — 8 cameras total) is functional. The same
behaviour must apply to every template: only the grid differs, the logic
(camera picker, drag-and-drop, layout persistence) is shared.

### Works (do not touch)
- Drag ghost when rearranging (small screenshot under the cursor).
- Yellow highlight on all tiles in edit mode.
- Drag-and-drop swap between cells.
- Camera swap via the "three dots" menu.
- Layout persistence across restarts.
- Symmetric resize on window resize (template proportions preserved).

### Deferred (cosmetic, later)
- The up/down arrows that appear in edit mode are from the original
  column-count code. Hide them when a template is active.

### Needs work (small changes)
- Camera swap via the "three dots" menu works, but needs minor tweaks
  (details to be filled in when the next session starts).

## Notes
- Pulse issue (MJPEG flicker on returning to the starting profile) is
  documented separately; not part of the templates work.
- `my-wip-backup` branch holds the working state before pulse experiments.
