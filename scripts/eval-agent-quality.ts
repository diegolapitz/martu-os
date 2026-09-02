import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import {
  AgentQualityEvaluator,
  type AgentQualitySample,
} from "../src/server/agent/evals/quality-evaluator";

async function main() {
  const [inputPath, outputPath = ".data/agent-evals/quality-baseline.json"] = process.argv.slice(2);
  if (!inputPath) throw new Error("Uso: pnpm eval:quality <samples.json> [resultado.json]");
  if (!hasUsableApiKey(process.env.OPENAI_API_KEY)) {
    throw new Error("OPENAI_API_KEY no está disponible localmente para correr el evaluator.");
  }

  const samples = parseSamples(await readFile(resolve(inputPath), "utf8"));
  const evaluator = new AgentQualityEvaluator();
  const results = [];
  for (const sample of samples) results.push({ id: sample.id, ...(await evaluator.evaluate(sample)) });

  const overall = results.length
    ? results.reduce((total, result) => total + result.overall, 0) / results.length
    : 0;
  const output = {
    generatedAt: new Date().toISOString(),
    evaluatorModel: process.env.OPENAI_EVAL_MODEL ?? "gpt-5-mini",
    samples: results,
    overall,
  };
  const target = resolve(outputPath);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  process.stdout.write(`Quality baseline: ${results.length} casos · ${overall.toFixed(2)}/5\n`);
}

function hasUsableApiKey(value: string | undefined) {
  return Boolean(value?.trim() && value !== "[SENSITIVE]");
}

function parseSamples(raw: string): AgentQualitySample[] {
  const value: unknown = JSON.parse(raw);
  if (!Array.isArray(value)) throw new Error("El archivo de muestras debe ser un array JSON.");
  return value as AgentQualitySample[];
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : "No se pudo correr el evaluator."}\n`);
  process.exitCode = 1;
});
