import { backfillBurndown } from "@/lib/actions/backfill-burndown";

(async () => {
  const sprintId = process.argv[2] ?? "1650";
  console.log(`Backfilling burndown for sprint ${sprintId}...`);
  const start = Date.now();
  const result = await backfillBurndown(sprintId);
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`Done in ${elapsed}s:`, JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
})();
