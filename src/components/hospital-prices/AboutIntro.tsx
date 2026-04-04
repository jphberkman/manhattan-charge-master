"use client";

import { EditableText } from "./EditableText";

export function AboutIntro() {
  return (
    <EditableText
      contentKey="about.intro"
      defaultValue="Every price on this site comes from publicly available machine-readable files that hospitals are legally required to publish under the Hospital Price Transparency Rule (CMS-1717-F2), which took effect January 1, 2021. We collect, parse, and normalize these files from 10 Manhattan hospitals."
      as="p"
      className="text-sm leading-relaxed text-white/60"
      multiline
    />
  );
}
