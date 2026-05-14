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

export type BrandId = "kafra" | "sarjan" | "richjoker" | "shinobi";

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

export type MigrationPhase = {
  id: number;
  title: string;
  status: PhaseStatus;
  owner: string;
};

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
    supabaseGroup: "Supabase account A",
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
    supabaseGroup: "Supabase account A",
    accent: "#60a5fa",
    status: "synced",
    parity: 92,
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
    supabaseGroup: "Supabase account B",
    accent: "#f59e0b",
    status: "watch",
    parity: 78,
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
    supabaseGroup: "Supabase account B",
    accent: "#d4af37",
    status: "synced",
    parity: 88,
    activeUsers: 72,
    expiredUsers: 14,
    keysIssued: 127,
    signalsToday: 14,
    revenueEstimate: "USD 2,520",
    telegramStatus: "Review",
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

export const migrationPhases: MigrationPhase[] = [
  { id: 1, title: "Normalize all 4 schemas to KAFRA parity", status: "active", owner: "Schema" },
  { id: 2, title: "Move public access/session checks to server routes", status: "done", owner: "Apps" },
  { id: 3, title: "Add brand_id columns and backfill existing data", status: "pending", owner: "Data" },
  { id: 4, title: "Create shared Supabase project and seed brands", status: "pending", owner: "Infra" },
  { id: 5, title: "Shift signal/log public reads to brand-aware API", status: "pending", owner: "Apps" },
  { id: 6, title: "Migrate brand by brand and run parity checks", status: "pending", owner: "Ops" },
];

export const nextTasks = [
  "Apply patched SARJAN schema in its current Supabase SQL editor.",
  "Add BRAND_ID environment variable to each brand app.",
  "Move signal and performance reads behind brand-aware server routes.",
  "Create HQ super admin account after shared Auth schema lands.",
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
    { id: "package-links", label: "Package Links flow", status: "watch", note: "Keep monitoring prod after rename rollout" },
    { id: "admin-header", label: "Admin header flow", status: "pass", note: "RICH JOKER Admin naming aligned" },
  ],
  shinobi: [
    { id: "access-ui", label: "Access UI parity", status: "pass", note: "Eye toggle + clear saved key available" },
    { id: "package-links", label: "Package Links flow", status: "pass", note: "Edit flow and token handling aligned" },
    { id: "admin-header", label: "Admin header flow", status: "pass", note: "Signal, refresh, logout aligned" },
  ],
};

export const systemLanes = [
  { label: "GitHub", value: "4 repos mapped", icon: GitBranch },
  { label: "Vercel", value: "4 projects mapped", icon: Activity },
  { label: "Supabase", value: "2 accounts now", icon: Database },
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

export function migrationProgress() {
  const done = migrationPhases.filter((phase) => phase.status === "done").length;
  return Math.round((done / migrationPhases.length) * 100);
}
