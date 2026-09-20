import { Shield } from "lucide-react";
import Link from "next/link";

export const revalidate = 3600;

export const metadata = {
  title: "Privacy Notice — Shop for Care",
  description:
    "How Shop for Care collects, uses, and protects information, including HIPAA-oriented PHI minimization.",
};

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <div className="flex items-center gap-2">
        <Shield className="size-5 text-violet-400" aria-hidden />
        <h1 className="text-2xl font-semibold text-white">Privacy notice</h1>
      </div>
      <p className="mt-4 text-sm leading-relaxed text-white/60">
        Shop for Care helps people compare publicly posted hospital prices. We design the product
        so you do not need to share protected health information (PHI) to use it.
      </p>

      <div className="mt-8 space-y-6 rounded-xl border border-white/20 bg-white/10 p-6 text-sm leading-relaxed text-white/60 backdrop-blur-sm">
        <section>
          <h2 className="text-base font-semibold text-white">Information we collect</h2>
          <ul className="mt-2 list-disc space-y-1.5 pl-5">
            <li>Optional account email and a hashed password if you register.</li>
            <li>Procedure search terms, after automated identifier redaction, for product quality.</li>
            <li>Admin audit events (action, resource, hashed IP) for security investigations.</li>
            <li>Vercel platform logs under Vercel’s data processing terms and, when executed, BAA.</li>
          </ul>
        </section>
        <section>
          <h2 className="text-base font-semibold text-white">What we ask you not to send</h2>
          <p className="mt-2">
            Do not enter Social Security numbers, medical record numbers, insurance member IDs,
            dates of birth, full names tied to a health condition, or other identifiers. Symptom
            text in Concern Explorer should stay general (for example, “knee pain”), not personally
            identifying.
          </p>
        </section>
        <section>
          <h2 className="text-base font-semibold text-white">Cookies</h2>
          <p className="mt-2">
            We use httpOnly session cookies for site access, user login, and admin mode. Cookies
            are marked Secure in production and use SameSite=Lax.
          </p>
        </section>
        <section>
          <h2 className="text-base font-semibold text-white">Analytics</h2>
          <p className="mt-2">
            Third-party Google Analytics is disabled unless explicitly enabled with a covered BAA.
            First-party Vercel Analytics may record page views without advertising identifiers.
          </p>
        </section>
        <p>
          Security and compliance controls are described on the{" "}
          <Link
            href="/hospital-prices/compliance"
            className="text-violet-300 underline underline-offset-2 hover:text-violet-200"
          >
            SOC 2 &amp; HIPAA page
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
