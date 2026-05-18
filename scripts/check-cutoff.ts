import { committedCutoff } from "@/lib/sprint/cutoff";
const cutoff = committedCutoff("2026-05-10");
console.log("Cutoff for 2026-05-10:", cutoff?.toISOString(), "=", cutoff?.toLocaleString("en-AU", { timeZone: "Australia/Brisbane" }));
process.exit(0);
