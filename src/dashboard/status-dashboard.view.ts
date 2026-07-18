/**
 * Owns the standalone HTML document served by GET /getdata. Keeping the
 * presentation and browser-only behaviour here keeps AppController focused on
 * HTTP concerns and AppService focused on status data.
 */
export function renderStatusDashboardDocument(content: string): string {
  return `<!doctype html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <meta name="theme-color" content="#111827">
        <title>Status</title>
        <style>
          :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
          * { box-sizing: border-box; }
          body { margin: 0; min-width: 320px; background: #111827; color: #f8fafc; }
          .dashboard { width: min(1120px, 100%); margin: 0 auto; padding: 24px 16px 40px; }
          .dashboard-header { display: flex; align-items: center; justify-content: space-between; margin: 4px 0 20px; }
          h1 { margin: 0; font-size: clamp(28px, 7vw, 40px); letter-spacing: -.03em; }
          .refresh-button { display: grid; width: 52px; height: 36px; place-items: center; border: 1px solid #475569; border-radius: 10px; padding: 0; background: #1e293b; color: #67e8f9; font-size: 24px; line-height: 1; cursor: pointer; }
          .refresh-button:active { transform: rotate(180deg); }
          .dashboard-card { overflow: hidden; border: 1px solid #334155; border-radius: 16px; background: #1e293b; box-shadow: 0 14px 36px rgba(0, 0, 0, .24); }
          .dashboard-card-wide { margin-top: 16px; }
          .overview-row { display: grid; grid-template-columns: minmax(110px, .7fr) minmax(0, 1.2fr) minmax(0, 1.2fr); border-bottom: 1px solid rgba(148, 163, 184, .16); }
          .overview-row > * { min-width: 0; padding: 11px 14px; border-right: 1px solid rgba(148, 163, 184, .16); }
          .overview-row > *:last-child { border-right: 0; }
          .overview-heading, .promotion-heading { background: #26354b; color: #e0f2fe; font-size: 13px; font-weight: 800; }
          .overview-client, .promotion-client { color: #e2e8f0; font-size: 14px; overflow-wrap: anywhere; }
          .overview-metric { display: grid; gap: 5px; }
          .overview-count, .promotion-count { color: #5eead4; font-size: 18px; font-variant-numeric: tabular-nums; }
          .overview-names { overflow-wrap: anywhere; color: #94a3b8; font-size: 12px; line-height: 1.35; }
          .promotion-row { display: grid; grid-template-columns: minmax(0, 1fr) 90px minmax(140px, .8fr); align-items: center; border-bottom: 1px solid rgba(148, 163, 184, .16); }
          .promotion-row > * { min-width: 0; padding: 11px 14px; }
          .promotion-row:last-child { border-bottom: 0; }
          .promotion-duration { font-size: 13px; font-weight: 800; }
          .promotion-duration.age-fresh, .stage-legend-item.age-fresh { color: #4ade80; }
          .promotion-duration.age-recent, .stage-legend-item.age-recent { color: #2dd4bf; }
          .promotion-duration.age-watch, .stage-legend-item.age-watch { color: #facc15; }
          .promotion-duration.age-aging, .stage-legend-item.age-aging { color: #fb923c; }
          .promotion-duration.age-stale, .stage-legend-item.age-stale { color: #fb7185; }
          .promotion-duration.age-critical, .stage-legend-item.age-critical { color: #f43f5e; }
          .promotion-duration.age-inactive, .stage-legend-item.age-inactive { color: #f43f5e; }
          .promotion-summary-card { padding: 10px 12px; background: #172033; }
          .stage-bar { display: flex; min-height: 24px; overflow: hidden; border-radius: 7px; background: #0f172a; }
          .stage-segment { display: grid; min-width: 4px; place-items: center; color: #fff; font-size: 11px; font-variant-numeric: tabular-nums; }
          .stage-segment.age-fresh { background: #22c55e; }
          .stage-segment.age-recent { background: #14b8a6; }
          .stage-segment.age-watch { background: #eab308; }
          .stage-segment.age-aging { background: #f97316; }
          .stage-segment.age-stale { background: #f43f5e; }
          .stage-segment.age-critical, .stage-segment.age-inactive { background: #be123c; }
          .stage-legend { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 4px; margin-top: 8px; }
          .stage-legend-item { display: grid; gap: 1px; min-width: 0; padding-left: 5px; border-left: 3px solid currentColor; font-size: 10px; line-height: 1.1; }
          .stage-legend-item strong { font-size: 14px; font-variant-numeric: tabular-nums; }
          .stage-legend-item small { color: #94a3b8; font-size: 9px; white-space: nowrap; }
          .metric-empty { margin: 0; padding: 20px 16px; color: #94a3b8; font-size: 14px; text-align: center; }
          @media (max-width: 680px) {
            body { overflow: hidden; }
            .dashboard { height: 100dvh; padding: 7px; overflow: hidden; }
            .dashboard-header { margin: 0 0 5px; }
            h1 { font-size: 18px; }
            .refresh-button { width: 40px; height: 25px; border-radius: 7px; font-size: 18px; }
            .dashboard-card { border-radius: 8px; box-shadow: none; }
            .dashboard-card-wide { margin-top: 6px; }
            .overview-row { grid-template-columns: 64px minmax(0, 1fr) minmax(0, 1fr); }
            .overview-row > *, .promotion-row > * { padding: 4px 5px; }
            .overview-heading, .promotion-heading { font-size: 9px; }
            .overview-client, .promotion-client { font-size: 9px; }
            .overview-metric { gap: 1px; }
            .overview-count, .promotion-count { font-size: 12px; line-height: 1; }
            .overview-names { font-size: 8px; line-height: 1.05; }
            .promotion-row { grid-template-columns: minmax(0, 1fr) 42px 78px; min-height: 21px; }
            .promotion-duration { font-size: 9px; line-height: 1; white-space: nowrap; }
            .promotion-summary-card { margin-top: 5px; padding: 5px 7px; }
            .stage-bar { min-height: 15px; border-radius: 4px; }
            .stage-segment { font-size: 8px; }
            .stage-legend { gap: 2px; margin-top: 4px; }
            .stage-legend-item { padding-left: 3px; border-left-width: 2px; font-size: 7px; }
            .stage-legend-item strong { font-size: 10px; }
            .stage-legend-item small { display: none; }
            .metric-empty { padding: 8px; font-size: 10px; }
          }
        </style>
      </head>
      <body>
        ${content}
        <script>
          setInterval(() => window.location.reload(), 20000);
          let refreshInProgress = false;
          const refreshStatus = () => {
            if (refreshInProgress) return;
            refreshInProgress = true;
            window.location.reload();
          };
          document.querySelector('.refresh-button').addEventListener('click', refreshStatus);
          let touchStartY = 0;
          document.addEventListener('touchstart', (event) => {
            touchStartY = event.touches[0].clientY;
          }, { passive: true });
          document.addEventListener('touchmove', (event) => {
            const pullDistance = event.touches[0].clientY - touchStartY;
            if (pullDistance > 55 && window.scrollY === 0) refreshStatus();
          }, { passive: true });
          document.addEventListener('touchend', (event) => {
            const pullDistance = event.changedTouches[0].clientY - touchStartY;
            if (pullDistance > 55 && window.scrollY === 0) refreshStatus();
          }, { passive: true });
        </script>
      </body>
    </html>`;
}
