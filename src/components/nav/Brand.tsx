import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/cn";

/** Logo lockup: MS monogram + MIKISAI wordmark with "Accounting" as a small eyebrow beneath. */
export function Brand({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <Link href="/" className={cn("flex items-center gap-3 min-w-0", className)} aria-label="MikiSai Accounting">
      <Image src="/brand/ms-monogram.svg" alt="" width={36} height={36} priority className="h-9 w-9 shrink-0 rounded-[10px]" />
      <span className={cn("flex flex-col leading-none", compact && "sr-only sm:not-sr-only sm:flex")}>
        <Image src="/brand/wordmark.svg" alt="MIKISAI" width={110} height={20} priority className="h-5 w-auto" />
        <span className="eyebrow mt-1 text-[0.6rem]">Accounting</span>
      </span>
    </Link>
  );
}
