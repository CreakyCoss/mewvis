import { f } from "./domain.mjs";

export function finishExperiment(e) {
  let sample;
  while ((sample = f.nextSample(e))) e.samples.push(sample);
  e.status = "completed";
  return e;
}
