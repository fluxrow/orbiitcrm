import { defineConfig, devices } from "@playwright/test";
import os from "node:os";

/**
 * Playwright config — Mutirão E2E (Golden Paths)
 *
 * Otimizações:
 *  - fullyParallel: cada spec roda em paralelo (arquivos em workers distintos).
 *  - Dentro de cada arquivo, o describe pode optar por `serial` quando há seed compartilhado.
 *  - Workers = metade dos CPUs locais; 4 em CI (estável e sem flakiness por contenção).
 *  - Trace só no primeiro retry (barato) e screenshot só em falha.
 *  - Reuso do dev server local (não derruba/reinicia).
 */
const CI = !!process.env.CI;
const LOCAL_WORKERS = Math.max(2, Math.floor((os.cpus()?.length ?? 4) / 2));

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  workers: CI ? 4 : LOCAL_WORKERS,
  reporter: CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:8080",
    viewport: { width: 1280, height: 1800 },
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
});
