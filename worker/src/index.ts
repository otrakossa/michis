import { config } from "./config.js";
import { runLoop } from "./loop.js";
import "./handlers.js"; // registra los handlers

console.log("[worker] michis worker iniciado (latido)");
runLoop(config.pollIntervalMs).catch((err) => {
  console.error("[worker] error fatal:", err);
  process.exit(1);
});
