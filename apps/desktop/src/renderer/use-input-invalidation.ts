import { useEffect, useLayoutEffect, useRef } from "react";
import type {
  IntakeChangedEvent,
  RecoverySummaryApi,
} from "@acenote/contracts";

export function useInputInvalidation(
  api: Pick<RecoverySummaryApi, "onInputsChanged"> | undefined,
  onChange: (event: IntakeChangedEvent) => void,
) {
  const latest = useRef(onChange);
  useLayoutEffect(() => {
    latest.current = onChange;
  });
  useEffect(
    () => api?.onInputsChanged((event) => latest.current(event)),
    [api],
  );
}
