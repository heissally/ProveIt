/** Shared building blocks for every ProveIt screen (mobile-first, about 390 px wide). */
import Link from "next/link";
import type { ReactNode } from "react";

type IconProps = { className?: string };
const svg = (path: ReactNode, className = "h-6 w-6") => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    {path}
  </svg>
);
const shield = <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" />;
export const ShieldIcon = ({ className }: IconProps) => svg(<>{shield}<path d="M9 12l2 2 4-4" /></>, className);
export const ShieldXIcon = ({ className }: IconProps) => svg(<>{shield}<path d="M9.5 9.5l5 5M14.5 9.5l-5 5" /></>, className);
export const CheckIcon = ({ className }: IconProps) => svg(<path d="M5 12.5l4.5 4.5L19 7.5" />, className);
export const XIcon = ({ className }: IconProps) => svg(<path d="M6 6l12 12M18 6L6 18" />, className);
export const WarnIcon = ({ className }: IconProps) => svg(<><path d="M12 4l9 16H3l9-16z" /><path d="M12 10v4M12 17.5v.01" /></>, className);
export const LockIcon = ({ className }: IconProps) => svg(<><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 018 0v3" /></>, className);
export const InfoIcon = ({ className }: IconProps) => svg(<><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8v.01" /></>, className);
export const ClockIcon = ({ className }: IconProps) => svg(<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>, className);

/** Page frame with the ProveIt header and the "whose screen is this" badge. */
export function Screen({ role, children }: { role?: "asker" | "verifier"; children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pb-8 pt-6">
      <header className="mb-7 flex items-center justify-between">
        <Link href="/new" className="flex items-center gap-2 font-heading text-2xl font-bold text-ink">
          <ShieldIcon className="h-7 w-7 text-accent" />
          ProveIt
        </Link>
        {role === "asker" && <span className="rounded-full bg-accent-soft px-3 py-1.5 text-sm font-semibold text-accent-ink">You: the asker</span>}
        {role === "verifier" && <span className="rounded-full bg-verifier-soft px-3 py-1.5 text-sm font-semibold text-verifier-ink">You: the verifier</span>}
      </header>
      <div className="flex flex-1 flex-col">{children}</div>
      <footer className="mt-10 flex justify-center gap-4 text-sm text-muted">
        <Link href="/privacy" className="underline">Privacy</Link>
        <Link href="/verify" className="underline">Verify a result</Link>
      </footer>
    </main>
  );
}

export const H1 = ({ children }: { children: ReactNode }) => (
  <h1 className="font-heading text-[2rem] font-bold leading-tight tracking-tight">{children}</h1>
);

export const Card = ({ children, className = "" }: { children: ReactNode; className?: string }) => (
  <section className={`rounded-3xl border border-line bg-white p-5 ${className}`}>{children}</section>
);

export const Label = ({ children }: { children: ReactNode }) => <p className="mb-2 text-sm font-semibold text-muted">{children}</p>;

export function Button({ children, onClick, disabled, variant = "primary", type = "button" }: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "outline";
  type?: "button" | "submit";
}) {
  const style = variant === "primary" ? "bg-accent text-white disabled:opacity-50" : "border-2 border-accent text-accent bg-transparent";
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`w-full rounded-2xl px-4 py-4 text-lg font-semibold ${style}`}>
      {children}
    </button>
  );
}

export const ButtonLink = ({ href, children }: { href: string; children: ReactNode }) => (
  <Link href={href} className="block w-full rounded-2xl bg-accent px-4 py-4 text-center text-lg font-semibold text-white">
    {children}
  </Link>
);

/** A yellow, blue or red notice box. */
export function Notice({ tone, children }: { tone: "warn" | "info" | "danger"; children: ReactNode }) {
  const styles = {
    warn: ["bg-warn-soft text-warn-ink", <WarnIcon key="i" className="h-6 w-6 shrink-0" />],
    info: ["bg-accent-soft text-accent-ink", <InfoIcon key="i" className="h-6 w-6 shrink-0" />],
    danger: ["bg-danger-soft text-danger", <WarnIcon key="i" className="h-6 w-6 shrink-0" />],
  } as const;
  const [cls, icon] = styles[tone];
  return (
    <div className={`flex gap-3 rounded-3xl p-5 leading-snug ${cls}`}>
      {icon}
      <div>{children}</div>
    </div>
  );
}

/** A ✓ or ✗ line in a list. */
export const Tick = ({ ok, children }: { ok: boolean; children: ReactNode }) => (
  <li className="flex items-start gap-3 py-1.5">
    {ok ? <CheckIcon className="mt-0.5 h-5 w-5 shrink-0 text-success" /> : <XIcon className="mt-0.5 h-5 w-5 shrink-0 text-danger" />}
    <span>{children}</span>
  </li>
);

/** A label / value row in a details card. */
export const Row = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="flex items-baseline justify-between gap-4 border-b border-line py-3.5 last:border-b-0">
    <span className="text-muted">{label}</span>
    <span className="text-right font-semibold">{children}</span>
  </div>
);
