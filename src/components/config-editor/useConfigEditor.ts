import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { Timestamp } from "firebase/firestore";
import {
  emptyDraft,
  isSecureContextForHashing,
  stampDraft,
  type ConfigDraft,
} from "@/evaluation/configDraft";
import { canonicalStringify } from "@/evaluation/configHash";
import { validateEvaluationConfig } from "@/evaluation/configValidation";
import type { EventEvaluationConfigV2 } from "@/evaluation/types";
import { editorReducer, type EditorAction } from "./editorReducer";

/**
 * Editor state: the draft, plus a debounced "what would this publish as"
 * derivation (hashes + validation errors).
 *
 * Stamping is async (Web Crypto) and validation walks the whole config, so
 * both are debounced rather than run on every keystroke. The consequence
 * matters for the UI: `stamped` LAGS `draft`, so the publish button must be
 * disabled while `isDeriving` is true — otherwise a fast click could publish
 * the previous keystroke's config.
 */

const DEBOUNCE_MS = 250;

/** Firestore's hard per-document ceiling. A config approaching it is a
 * genuine risk with many categories and slots, so the byte count is surfaced
 * rather than discovered as a failed write. */
const FIRESTORE_DOC_LIMIT_BYTES = 1_048_576;

export interface ConfigEditorState {
  draft: ConfigDraft;
  dispatch: (action: EditorAction) => void;
  /** The stamped config, or null while deriving or if stamping failed. */
  stamped: EventEvaluationConfigV2 | null;
  /** Validation errors for the current stamped config. */
  errors: string[];
  isDeriving: boolean;
  /** True when the draft differs from the config it was loaded from. */
  isDirty: boolean;
  canPublish: boolean;
  approximateBytes: number;
  byteLimit: number;
  secureContext: boolean;
  reset: (draft: ConfigDraft) => void;
}

export function useConfigEditor(
  initialDraft?: ConfigDraft,
  initialConfigVersion = "config-v1"
): ConfigEditorState {
  const [draft, dispatch] = useReducer(
    editorReducer,
    initialDraft ?? emptyDraft(initialConfigVersion)
  );

  const [stamped, setStamped] = useState<EventEvaluationConfigV2 | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [isDeriving, setIsDeriving] = useState(false);

  const baseline = useRef(canonicalStringify(initialDraft ?? emptyDraft(initialConfigVersion)));
  const secureContext = useMemo(() => isSecureContextForHashing(), []);

  const serialized = useMemo(() => canonicalStringify(draft), [draft]);
  const isDirty = serialized !== baseline.current;
  const approximateBytes = useMemo(
    () => new TextEncoder().encode(serialized).length,
    [serialized]
  );

  useEffect(() => {
    if (!secureContext) {
      setErrors([
        "This page is not running in a secure context, so configuration " +
          "hashes cannot be computed. Open the app over https or on localhost.",
      ]);
      return;
    }

    setIsDeriving(true);
    let cancelled = false;
    const timer = setTimeout(() => {
      void (async () => {
        try {
          // provisionedAt is excluded from both hashes, so a fixed value here
          // keeps the derivation stable across keystrokes; the real publish
          // timestamp is stamped by the provisioning service.
          const next = await stampDraft(draft, Timestamp.fromMillis(0));
          if (cancelled) return;
          const validation = validateEvaluationConfig(next);
          setStamped(next);
          setErrors(validation.ok ? [] : validation.errors);
        } catch (error) {
          if (cancelled) return;
          setStamped(null);
          setErrors([
            error instanceof Error ? error.message : String(error),
          ]);
        } finally {
          if (!cancelled) setIsDeriving(false);
        }
      })();
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [draft, secureContext]);

  const reset = useCallback((next: ConfigDraft) => {
    baseline.current = canonicalStringify(next);
    dispatch({ type: "replaceDraft", draft: next });
  }, []);

  return {
    draft,
    dispatch,
    stamped,
    errors,
    isDeriving,
    isDirty,
    canPublish:
      secureContext &&
      !isDeriving &&
      stamped !== null &&
      errors.length === 0 &&
      approximateBytes < FIRESTORE_DOC_LIMIT_BYTES,
    approximateBytes,
    byteLimit: FIRESTORE_DOC_LIMIT_BYTES,
    secureContext,
    reset,
  };
}
