"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Tour } from "./Tour";

/** Button on More → Help that reopens the first-run tour from step one. */
export function HelpTour({ label }: { label: string }) {
  const [run, setRun] = useState(0);
  return (
    <>
      <Button type="button" onClick={() => setRun((n) => n + 1)}>
        {label}
      </Button>
      {run > 0 ? <Tour key={run} forceOpen onClose={() => setRun(0)} /> : null}
    </>
  );
}
