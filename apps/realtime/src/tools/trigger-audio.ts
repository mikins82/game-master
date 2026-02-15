// ---------------------------------------------------------------------------
// Audio cue validation
// ---------------------------------------------------------------------------

export type AudioCueResult = {
  cue: string;
  intensity: "low" | "mid" | "high";
  duration_ms?: number;
};

const VALID_INTENSITIES = ["low", "mid", "high"] as const;
type ValidIntensity = (typeof VALID_INTENSITIES)[number];

/**
 * Validate and normalise audio cue parameters.
 * Audio cues are pass-through events — realtime validates the shape and
 * writes the event for clients to render.
 */
export function validateAudioCue(
  cue: string,
  intensity?: string,
  durationMs?: number,
): AudioCueResult {
  if (!cue || cue.trim().length === 0) {
    throw new Error("Audio cue name must not be empty");
  }

  const normalisedIntensity: ValidIntensity = VALID_INTENSITIES.includes(
    intensity as ValidIntensity,
  )
    ? (intensity as ValidIntensity)
    : "mid";

  return {
    cue: cue.trim(),
    intensity: normalisedIntensity,
    duration_ms: durationMs,
  };
}
