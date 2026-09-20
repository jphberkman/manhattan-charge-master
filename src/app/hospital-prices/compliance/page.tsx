import { ShieldCheck, FileCheck2, Lock, Server, EyeOff, AlertTriangle } from "lucide-react";
import Link from "next/link";

export const revalidate = 3600;

export const metadata = {
  title: "SOC 2 & HIPAA Compliance — Shop for Care",
  description:
    "How Shop for Care supports SOC 2 Type II and HIPAA technical safeguards, including encryption, access control, audit logging, and PHI handling.",
};

export default function CompliancePage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <div className="flex items-center gap-2">
        <ShieldCheck className="size-5 text-emerald-400" aria-hidden />
        <h1 className="text-2xl font-semibold text-white">SOC 2 &amp; HIPAA compliance</h1>
      </div>
      <p className="mt-4 text-sm leading-relaxed text-white/60">
        Shop for Care is configured for SOC 2 Type II and HIPAA technical safeguards. Platform
        coverage (Vercel SOC 2 attestation and a HIPAA Business Associate Agreement) is a shared
        responsibility: this application implements access control, encryption in transit, audit
        logging, and PHI minimization. A Vercel HIPAA BAA must still be accepted in team Billing
        for Pro teams, or executed with Vercel for Enterprise.
      </p>
      <p className="mt-3 text-xs leading-relaxed text-white/40">
        This page is informational and is not legal advice. We do not claim that using this product
        makes your organization HIPAA- or SOC 2-certified.
      </p>

      <div className="mt-8 space-y-8">
        <Section
          icon={<FileCheck2 className="size-5 text-violet-400" aria-hidden />}
          title="SOC 2 Type II (Trust Services Criteria)"
        >
          <p>
            Controls in this application map to Security, Availability, and Confidentiality:
            unique production secrets, httpOnly secure session cookies, hashed site-access tokens,
            role-separated admin authentication, append-only audit events, and TLS-only transport
            headers (HSTS, nosniff, referrer policy).
          </p>
          <p>
            Vercel holds a SOC 2 Type II attestation for Security, Confidentiality, and Availability.
            Reports are available from{" "}
            <a
              className="text-violet-300 underline underline-offset-2 hover:text-violet-200"
              href="https://security.vercel.com/"
              rel="noreferrer"
              target="_blank"
            >
              Vercel Trust Center
            </a>{" "}
            and Team Settings → Compliance on Pro/Enterprise plans.
          </p>
        </Section>

        <Section
          icon={<Lock className="size-5 text-violet-400" aria-hidden />}
          title="HIPAA technical safeguards"
        >
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong className="text-white/80">Access control:</strong> site gate, admin session
              cookies, and unique <code className="text-white/70">ADMIN_PASSWORD</code> required in
              production (the committed default is rejected).
            </li>
            <li>
              <strong className="text-white/80">Audit controls:</strong> admin login, content edits,
              and data uploads write hashed-IP audit events. Search logs redact emails, SSNs,
              phones, MRNs, and dates of birth.
            </li>
            <li>
              <strong className="text-white/80">Integrity &amp; transmission:</strong> HTTPS with
              HSTS; session tokens are not stored as plaintext passwords.
            </li>
            <li>
              <strong className="text-white/80">Minimum necessary:</strong> Concern Explorer cache
              keys are hashed; free-text health queries are not stored as Redis keys.
            </li>
            <li>
              <strong className="text-white/80">Third-party analytics:</strong> Google Analytics is
              off by default (no Google BAA). Vercel Analytics remains available under a Vercel BAA.
            </li>
          </ul>
        </Section>

        <Section
          icon={<Server className="size-5 text-violet-400" aria-hidden />}
          title="Business associate agreements"
        >
          <p>Execute BAAs with every vendor that may create, receive, maintain, or transmit PHI:</p>
          <ul className="mt-2 list-disc space-y-2 pl-5">
            <li>
              <strong className="text-white/80">Vercel:</strong> Pro teams purchase the HIPAA BAA
              add-on under Settings → Billing. Enterprise teams request a signed BAA from their
              account team.
            </li>
            <li>
              <strong className="text-white/80">Neon (Postgres):strong> enable HIPAA on the Neon
              project and sign Neon’s BAA before storing PHI.
            </li>
            <li>
              <strong className="text-white/80">Upstash Redis / Anthropic:</strong> use
              HIPAA-eligible plans and zero data retention where PHI may appear in prompts.
            </li>
          </ul>
        </Section>

        <Section
          icon={<EyeOff className="size-5 text-violet-400" aria-hidden />}
          title="What this product stores"
        >
          <p>
            Hospital prices come from public CMS transparency files and are not PHI. User accounts
            store email and a bcrypt password hash. Search analytics store procedure queries after
            identifier redaction. Do not enter names, dates of birth, member IDs, or medical record
            numbers into search or Concern Explorer.
          </p>
          <p>
            See the <Link href="/hospital-prices/privacy" className="text-violet-300 underline underline-offset-2 hover:text-violet-200">privacy notice</Link>{" "}
            for data handling details.
          </p>
        </Section>

        <Section
          icon={<AlertTriangle className="size-5 text-amber-400" aria-hidden />}
          title="Operator checklist"
        >
          <ul className="list-disc space-y-2 pl-5">
            <li>Set unique <code className="text-white/70">JWT_SECRET</code> and <code className="text-white/70">ADMIN_PASSWORD</code> in production.</li>
            <li>Accept the Vercel HIPAA BAA in team billing (or complete Enterprise paperwork).</li>
            <li>Sign BAAs with Neon, Redis, and the AI provider if those services process PHI.</li>
            <li>Review <code className="text-white/70">AuditEvent</code> records regularly via the admin audit API.</li>
            <li>Leave Google Analytics disabled unless a covered analytics BAA is in place.</li>
          </ul>
        </Section>
      </div>
    </div>
  );
}

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-white/20 bg-white/10 p-6 backdrop-blur-sm">
      <div className="mb-3 flex items-center gap-2">
        {icon}
        <h2 className="text-base font-semibold text-white">{title}</h2>
      </div>
      <div className="space-y-3 text-sm leading-relaxed text-white/60">{children}</div>
    </section>
  );
}
