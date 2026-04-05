"use client";

import { EditableText } from "./EditableText";

export function AboutTitle() {
  return (
    <EditableText
      contentKey="about.title"
      defaultValue="About Our Data"
      as="h1"
      className="text-2xl font-bold tracking-tight text-white"
    />
  );
}

export function AboutDataTitle() {
  return (
    <EditableText
      contentKey="about.data.title"
      defaultValue="Where the data comes from"
      as="h2"
      className="text-lg font-semibold text-white"
    />
  );
}

export function AboutDataBody() {
  return (
    <EditableText
      contentKey="about.data.body"
      defaultValue="Each file contains chargemaster rates, cash/self-pay prices, and negotiated rates for specific insurance plans."
      as="p"
      className="text-sm leading-relaxed text-white/60"
      multiline
    />
  );
}

export function AboutAiTitle() {
  return (
    <EditableText
      contentKey="about.ai.title"
      defaultValue="How AI is used"
      as="h2"
      className="text-lg font-semibold text-white"
    />
  );
}

export function AboutAiBody() {
  return (
    <EditableText
      contentKey="about.ai.body"
      defaultValue={`AI is used in two limited ways:\n\n• Search understanding: When you describe a procedure in plain English, AI maps your description to the correct CPT/procedure codes.\n• Data upload parsing: When hospital files use non-standard formats, AI helps detect column mappings during import.\n\nAI is never used to generate, estimate, or fabricate prices. If a price is not in our database, we tell you it's missing rather than guessing.`}
      as="div"
      className="text-sm leading-relaxed text-white/60"
      multiline
    />
  );
}

export function AboutHospitalsTitle() {
  return (
    <EditableText
      contentKey="about.hospitals.title"
      defaultValue="Covered hospitals"
      as="h2"
      className="text-lg font-semibold text-white"
    />
  );
}

export function AboutDisclaimerTitle() {
  return (
    <EditableText
      contentKey="about.disclaimer.title"
      defaultValue="Disclaimer"
      as="h2"
      className="text-lg font-semibold text-white"
    />
  );
}

export function AboutDisclaimerBody() {
  return (
    <EditableText
      contentKey="about.disclaimer.body"
      defaultValue="This tool provides price information from publicly available hospital transparency files for educational and informational purposes only. It is not medical advice. Actual costs may vary based on your specific treatment, insurance benefits, deductibles, co-pays, and provider agreements. Always verify final costs with your healthcare provider and insurance company before making decisions."
      as="p"
      className="text-sm leading-relaxed text-white/60"
      multiline
    />
  );
}
