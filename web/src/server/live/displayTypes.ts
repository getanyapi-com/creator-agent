/**
 * The core's display object types, for the code outside web/src/server that reads what a browser may
 * receive. Types only: nothing here runs, so a browser bundle that imports it gets nothing from the core.
 */
export type {
  DisplayCreator,
  DisplayCriterion,
  DisplayEvidence,
  DisplayRun,
  DisplaySection,
  DisplaySentence,
  DisplayStep,
  DisplayVideo,
  ProgressEvent,
  SentenceLabel,
  StepKind,
} from "../../../../src/index.ts";
