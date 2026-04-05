// ── Content Registry ─────────────────────────────────────────────────────────
// Maps every editable key to metadata for the admin dashboard.

export interface ContentField {
  key: string;
  label: string;
  page: string;
  section: string;
  maxLength: number;
  multiline: boolean;
}

export const CONTENT_REGISTRY: ContentField[] = [
  // Home Page — Hero
  { key: "home.hero.badge", label: "Hero Badge Text", page: "Home Page", section: "Hero", maxLength: 80, multiline: false },
  { key: "home.hero.headline", label: "Hero Headline (Line 1)", page: "Home Page", section: "Hero", maxLength: 100, multiline: false },
  { key: "home.hero.headline2", label: "Hero Headline (Line 2)", page: "Home Page", section: "Hero", maxLength: 100, multiline: false },
  { key: "home.hero.subheadline", label: "Hero Subheadline", page: "Home Page", section: "Hero", maxLength: 200, multiline: true },
  // Home Page — Trust
  { key: "home.trust.label", label: "Trust Section Label", page: "Home Page", section: "Trust Cards", maxLength: 50, multiline: false },
  { key: "home.trust.realdata.title", label: "Real Data Card Title", page: "Home Page", section: "Trust Cards", maxLength: 50, multiline: false },
  { key: "home.trust.realdata.body", label: "Real Data Card Body", page: "Home Page", section: "Trust Cards", maxLength: 200, multiline: true },
  { key: "home.trust.notai.title", label: "Not AI Card Title", page: "Home Page", section: "Trust Cards", maxLength: 50, multiline: false },
  { key: "home.trust.notai.body", label: "Not AI Card Body", page: "Home Page", section: "Trust Cards", maxLength: 200, multiline: true },
  { key: "home.trust.entries.title", label: "Entries Card Title", page: "Home Page", section: "Trust Cards", maxLength: 50, multiline: false },
  { key: "home.trust.entries.body", label: "Entries Card Body", page: "Home Page", section: "Trust Cards", maxLength: 200, multiline: true },
  { key: "home.trust.insurance.title", label: "Insurance Card Title", page: "Home Page", section: "Trust Cards", maxLength: 50, multiline: false },
  { key: "home.trust.insurance.body", label: "Insurance Card Body", page: "Home Page", section: "Trust Cards", maxLength: 200, multiline: true },
  // Home Page — How It Works
  { key: "home.howitworks.title", label: "How It Works Title", page: "Home Page", section: "How It Works", maxLength: 50, multiline: false },
  { key: "home.howitworks.subtitle", label: "How It Works Subtitle", page: "Home Page", section: "How It Works", maxLength: 200, multiline: true },
  { key: "home.step1.title", label: "Step 1 Title", page: "Home Page", section: "How It Works", maxLength: 50, multiline: false },
  { key: "home.step1.body", label: "Step 1 Description", page: "Home Page", section: "How It Works", maxLength: 200, multiline: true },
  { key: "home.step2.title", label: "Step 2 Title", page: "Home Page", section: "How It Works", maxLength: 50, multiline: false },
  { key: "home.step2.body", label: "Step 2 Description", page: "Home Page", section: "How It Works", maxLength: 200, multiline: true },
  { key: "home.step3.title", label: "Step 3 Title", page: "Home Page", section: "How It Works", maxLength: 50, multiline: false },
  { key: "home.step3.body", label: "Step 3 Description", page: "Home Page", section: "How It Works", maxLength: 200, multiline: true },
  // Home Page — Data Sources
  { key: "home.datasource.title", label: "Data Section Title", page: "Home Page", section: "Data Sources", maxLength: 60, multiline: false },
  { key: "home.datasource.subtitle", label: "Data Section Subtitle", page: "Home Page", section: "Data Sources", maxLength: 250, multiline: true },
  // Search Page
  { key: "search.header.title", label: "Search Page Title", page: "Search Page", section: "Header", maxLength: 60, multiline: false },
  { key: "search.header.description", label: "Search Page Description", page: "Search Page", section: "Header", maxLength: 200, multiline: true },
  { key: "search.trustBadge", label: "Trust Badge Text", page: "Search Page", section: "Header", maxLength: 200, multiline: false },
  // Concern Explorer
  { key: "explore.header.title", label: "Explore Page Title", page: "Concern Explorer", section: "Header", maxLength: 50, multiline: false },
  { key: "explore.header.subtitle", label: "Explore Page Subtitle", page: "Concern Explorer", section: "Header", maxLength: 200, multiline: true },
  { key: "explore.disclaimer", label: "AI Disclaimer Text", page: "Concern Explorer", section: "Disclaimers", maxLength: 500, multiline: true },
  { key: "explore.section.condition", label: "\"What is this condition?\" Heading", page: "Concern Explorer", section: "Result Sections", maxLength: 60, multiline: false },
  { key: "explore.section.causes", label: "\"Common causes\" Heading", page: "Concern Explorer", section: "Result Sections", maxLength: 60, multiline: false },
  { key: "explore.section.treatments", label: "\"Common treatment options\" Heading", page: "Concern Explorer", section: "Result Sections", maxLength: 60, multiline: false },
  { key: "explore.section.seekCare", label: "\"When to seek care\" Heading", page: "Concern Explorer", section: "Result Sections", maxLength: 60, multiline: false },
  { key: "explore.section.questions", label: "\"Questions to ask your doctor\" Heading", page: "Concern Explorer", section: "Result Sections", maxLength: 60, multiline: false },
  { key: "explore.section.relatedPrices", label: "\"Look up real hospital prices\" Heading", page: "Concern Explorer", section: "Result Sections", maxLength: 60, multiline: false },
  { key: "explore.disclaimer.footer.title", label: "Bottom Disclaimer Title", page: "Concern Explorer", section: "Disclaimers", maxLength: 60, multiline: false },
  { key: "explore.searchAgain", label: "\"Explore another concern\" Button Text", page: "Concern Explorer", section: "Actions", maxLength: 60, multiline: false },
  // About Page
  { key: "about.title", label: "About Page Title", page: "About Page", section: "Header", maxLength: 60, multiline: false },
  { key: "about.intro", label: "About Page Introduction", page: "About Page", section: "Introduction", maxLength: 500, multiline: true },
  { key: "about.data.title", label: "Data Source Section Title", page: "About Page", section: "Data Source", maxLength: 60, multiline: false },
  { key: "about.data.body", label: "Data Source Section Body", page: "About Page", section: "Data Source", maxLength: 300, multiline: true },
  { key: "about.ai.title", label: "AI Usage Section Title", page: "About Page", section: "AI Usage", maxLength: 60, multiline: false },
  { key: "about.ai.body", label: "AI Usage Section Body", page: "About Page", section: "AI Usage", maxLength: 800, multiline: true },
  { key: "about.hospitals.title", label: "Covered Hospitals Section Title", page: "About Page", section: "Hospitals", maxLength: 60, multiline: false },
  { key: "about.disclaimer.title", label: "Disclaimer Section Title", page: "About Page", section: "Disclaimer", maxLength: 60, multiline: false },
  { key: "about.disclaimer.body", label: "Disclaimer Section Body", page: "About Page", section: "Disclaimer", maxLength: 500, multiline: true },
  // Footer
  { key: "footer.disclaimer", label: "Footer Disclaimer", page: "Footer", section: "Legal", maxLength: 500, multiline: true },
  { key: "footer.brand", label: "Footer Brand Description", page: "Footer", section: "Brand", maxLength: 200, multiline: true },
  { key: "footer.cmsRule", label: "Footer CMS Rule Text", page: "Footer", section: "Legal", maxLength: 200, multiline: false },
];
