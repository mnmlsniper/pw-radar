/** Public entry point for the library (types + recorder core). */

export { createRecorder } from "./recorder/recorder.js";
export type { Recorder, RawCall } from "./recorder/recorder.js";
export {
  COVERAGE_FORMAT_VERSION,
  type RecordedCall,
  type CoverageFile,
  type RecorderOptions,
} from "./recorder/types.js";
