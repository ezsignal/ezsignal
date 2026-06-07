import {
  Activity,
  BadgeDollarSign,
  Bot,
  Database,
  GitBranch,
  KeyRound,
  LayoutTemplate,
  RadioTower,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type BrandId = "kafra" | "sarjan" | "richjoker" | "shinobi" | "kapitan" | "liza" | "mastery";

export type BrandStatus = "core" | "synced" | "watch" | "draft";

export type BrandRegistryItem = {
  id: BrandId;
  displayName: string;
  canonicalName: string;
  role: "Core" | "White label";
  domain: string;
  github: string;
  vercelProject: string;
  localFolder: string;
  supabaseGroup: string;
  accent: string;
  status: BrandStatus;
  parity: number;
  activeUsers: number;
  expiredUsers: number;
  keysIssued: number;
  signalsToday: number;
  revenueEstimate: string;
  telegramStatus: "Ready" | "Pending" | "Review";
  lastDeploy: string;
};

export type HqModule = {
  title: string;
  description: string;
  status: "Ready for design" | "Needs schema" | "Needs secrets" | "Later";
  icon: LucideIcon;
};

export type PhaseStatus = "done" | "active" | "pending";

export type CheckStatus = "pass" | "watch" | "todo";

export type BrandParityCheck = {
  id: string;
  label: string;
  status: CheckStatus;
  note: string;
};

export const brands: BrandRegistryItem[] = [
  {
    id: "kafra",
    displayName: "KAFRA SIGNAL",
    canonicalName: "KAFRA SIGNAL",
    role: "Core",
    domain: "signal.kafra.ai",
    github: "kafrasignal/kafrasignal",
    vercelProject: "kafrasignal",
    localFolder: "KAFRA SIGNAL",
    supabaseGroup: "EZ SIGNAL HQ (shared)",
    accent: "#5eead4",
    status: "core",
    parity: 100,
    activeUsers: 138,
    expiredUsers: 31,
    keysIssued: 224,
    signalsToday: 18,
    revenueEstimate: "USD 4,820",
    telegramStatus: "Ready",
    lastDeploy: "2d ago",
  },
  {
    id: "sarjan",
    displayName: "SARJAN SIGNAL",
    canonicalName: "SARJAN SIGNAL",
    role: "White label",
    domain: "sarjansignal.ezos.my",
    github: "sarjansignal/sarjansignal",
    vercelProject: "sarjansignal",
    localFolder: "SARJAN SIGNAL",
    supabaseGroup: "EZ SIGNAL HQ (shared)",
    accent: "#60a5fa",
    status: "synced",
    parity: 100,
    activeUsers: 86,
    expiredUsers: 17,
    keysIssued: 143,
    signalsToday: 15,
    revenueEstimate: "USD 2,940",
    telegramStatus: "Review",
    lastDeploy: "today",
  },
  {
    id: "richjoker",
    displayName: "RICH JOKER",
    canonicalName: "RICH JOKER INDI",
    role: "White label",
    domain: "richjoker.ezos.my",
    github: "richjokerindi/richjokerindi",
    vercelProject: "richjoker",
    localFolder: "RICH JOKER INDI",
    supabaseGroup: "EZ SIGNAL HQ (shared)",
    accent: "#f59e0b",
    status: "synced",
    parity: 100,
    activeUsers: 64,
    expiredUsers: 26,
    keysIssued: 118,
    signalsToday: 12,
    revenueEstimate: "USD 2,110",
    telegramStatus: "Pending",
    lastDeploy: "today",
  },
  {
    id: "shinobi",
    displayName: "SHINOBI",
    canonicalName: "SHINOBI INDI",
    role: "White label",
    domain: "shinobi.ezos.my",
    github: "shinobiindi/shinobiindi",
    vercelProject: "shinobi",
    localFolder: "SHINOBI INDI",
    supabaseGroup: "EZ SIGNAL HQ (shared)",
    accent: "#d4af37",
    status: "synced",
    parity: 100,
    activeUsers: 72,
    expiredUsers: 14,
    keysIssued: 127,
    signalsToday: 14,
    revenueEstimate: "USD 2,520",
    telegramStatus: "Review",
    lastDeploy: "today",
  },
  {
    id: "kapitan",
    displayName: "KAPITAN SIGNAL",
    canonicalName: "KAPITAN SIGNAL",
    role: "White label",
    domain: "kapitansignal.ezos.my",
    github: "kapitansignal/kapitansignal",
    vercelProject: "kapitansignal",
    localFolder: "KAPITAN SIGNAL",
    supabaseGroup: "EZ SIGNAL HQ (shared)",
    accent: "#f5c542",
    status: "synced",
    parity: 100,
    activeUsers: 0,
    expiredUsers: 0,
    keysIssued: 0,
    signalsToday: 0,
    revenueEstimate: "USD 0",
    telegramStatus: "Ready",
    lastDeploy: "today",
  },
  {
    id: "liza",
    displayName: "LIZA FX ACADEMY",
    canonicalName: "LIZA FX ACADEMY",
    role: "White label",
    domain: "lizafx.ezos.my",
    github: "lizafx/lizafx",
    vercelProject: "lizafx",
    localFolder: "LIZA",
    supabaseGroup: "EZ SIGNAL HQ (shared)",
    accent: "#f9a8d4",
    status: "synced",
    parity: 100,
    activeUsers: 0,
    expiredUsers: 0,
    keysIssued: 0,
    signalsToday: 0,
    revenueEstimate: "USD 0",
    telegramStatus: "Pending",
    lastDeploy: "—",
  },
  {
    id: "mastery",
    displayName: "MASTERY SIGNAL",
    canonicalName: "MASTERY SIGNAL",
    role: "White label",
    domain: "www.masterysignal.com",
    github: "masterysignal/masterysignal",
    vercelProject: "masterysignal",
    localFolder: "MASTERY SIGNAL",
    supabaseGroup: "EZ SIGNAL HQ (shared)",
    accent: "#1f1fd1",
    status: "synced",
    parity: 100,
    activeUsers: 0,
    expiredUsers: 0,
    keysIssued: 0,
    signalsToday: 0,
    revenueEstimate: "USD 0",
    telegramStatus: "Pending",
    lastDeploy: "today",
  },
];

export const hqModules: HqModule[] = [
  {
    title: "Brand Registry",
    description: "Domains, GitHub repos, Vercel projects, Supabase groups, and brand status.",
    status: "Ready for design",
    icon: LayoutTemplate,
  },
  {
    title: "Admin CRM",
    description: "Master admin, brand admin, signal operator, and support roles.",
    status: "Needs schema",
    icon: ShieldCheck,
  },
  {
    title: "Access Keys",
    description: "Generate, revoke, renew, reset device locks, and track key usage per brand.",
    status: "Needs schema",
    icon: KeyRound,
  },
  {
    title: "Signal Manager",
    description: "Create signal templates, publish to selected brands, and track TP or SL outcomes.",
    status: "Needs schema",
    icon: RadioTower,
  },
  {
    title: "Telegram Control",
    description: "Bot token mapping, channel IDs, message templates, delivery status, and test send.",
    status: "Needs secrets",
    icon: Bot,
  },
  {
    title: "Landing CMS",
    description: "Hero copy, pricing, FAQ, testimonials, favicon, theme colors, and launch status.",
    status: "Later",
    icon: LayoutTemplate,
  },
];

export const parityBoard: Record<BrandId, BrandParityCheck[]> = {
  kafra: [
    { id: "access-ui", label: "Access UI parity", status: "pass", note: "Core baseline" },
    { id: "package-links", label: "Package Links flow", status: "pass", note: "Edit + toggle + token flow stable" },
    { id: "admin-header", label: "Admin header flow", status: "pass", note: "Signal, refresh, logout aligned" },
  ],
  sarjan: [
    { id: "access-ui", label: "Access UI parity", status: "pass", note: "Eye toggle + clear saved key + logo added" },
    { id: "package-links", label: "Package Links flow", status: "pass", note: "Aligned with KAFRA, token length set to 4" },
    { id: "admin-header", label: "Admin header flow", status: "pass", note: "Signal, refresh, logout now aligned" },
  ],
  richjoker: [
    { id: "access-ui", label: "Access UI parity", status: "pass", note: "Eye toggle + clear saved key available" },
    { id: "package-links", label: "Package Links flow", status: "pass", note: "Live; aligned with shared API" },
    { id: "admin-header", label: "Admin header flow", status: "pass", note: "RICH JOKER Admin naming aligned" },
  ],
  shinobi: [
    { id: "access-ui", label: "Access UI parity", status: "pass", note: "Eye toggle + clear saved key available" },
    { id: "package-links", label: "Package Links flow", status: "pass", note: "Edit flow and token handling aligned" },
    { id: "admin-header", label: "Admin header flow", status: "pass", note: "Signal, refresh, logout aligned" },
  ],
  kapitan: [
    { id: "access-ui", label: "Access UI parity", status: "pass", note: "Access, dashboard, and landing theme aligned" },
    { id: "package-links", label: "Package Links flow", status: "pass", note: "Create/edit/toggle link flow aligned with shared API" },
    { id: "admin-header", label: "Admin header flow", status: "pass", note: "Signal, refresh, logout aligned" },
  ],
  liza: [
    { id: "access-ui", label: "Access UI parity", status: "pass", note: "Live; KAFRA-based access UI" },
    { id: "package-links", label: "Package Links flow", status: "pass", note: "Live; shared API flow" },
    { id: "admin-header", label: "Admin header flow", status: "pass", note: "Live; KAFRA-based admin header" },
  ],
  mastery: [
    { id: "access-ui", label: "Access UI parity", status: "pass", note: "Live; KAFRA-based, electric-blue reskin" },
    { id: "package-links", label: "Package Links flow", status: "pass", note: "Shared API flow" },
    { id: "admin-header", label: "Admin header flow", status: "pass", note: "KAFRA-based admin header" },
  ],
};

export const systemLanes = [
  { label: "GitHub", value: `${brands.length} repos mapped`, icon: GitBranch },
  { label: "Vercel", value: `${brands.length} projects mapped`, icon: Activity },
  { label: "Supabase", value: "1 shared account", icon: Database },
  { label: "Users", value: `${brands.reduce((sum, brand) => sum + brand.activeUsers, 0)} active`, icon: UsersRound },
  { label: "Revenue", value: "Demo estimates", icon: BadgeDollarSign },
];

export function getBrand(id: string) {
  return brands.find((brand) => brand.id === id);
}

export function totals() {
  return brands.reduce(
    (acc, brand) => {
      acc.activeUsers += brand.activeUsers;
      acc.expiredUsers += brand.expiredUsers;
      acc.keysIssued += brand.keysIssued;
      acc.signalsToday += brand.signalsToday;
      return acc;
    },
    {
      activeUsers: 0,
      expiredUsers: 0,
      keysIssued: 0,
      signalsToday: 0,
    },
  );
}
