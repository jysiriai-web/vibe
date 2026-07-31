export type SegmentId = "beauty" | "skincare";

export type { Company } from "./companies";

export type CreatorStatus = "확정" | "제안중" | "협의중";
export type CreatorTier = "MEGA" | "MACRO" | "MID" | "MICRO";

export interface Creator {
  rank: number;
  handle: string;
  /** thumbnail photo path */
  photo: string;
  category: string;
  followers: string;
  /** raw follower count — for the Excel/CSV export so Excel can sort & sum */
  followersRaw: number;
  engagement: string;
  tier: CreatorTier;
  status: CreatorStatus;
}

export interface Metric {
  label: string;
  value: string;
  unit?: string;
  delta?: string;
  caption: string;
}

export interface CategorySlice {
  name: string;
  pct: number;
}

export interface FollowerBucket {
  label: string;
  value: number;
}

export interface GalleryItem {
  id: string;
  /** public path to the influencer portfolio photo */
  src: string;
  /** influencer handle */
  handle: string;
  /** per-handle metrics — identical to the list view for handles in both,
      so hovering a photo reads as a data record, not a decoration */
  followers: string;
  engagement: string;
  tier: CreatorTier;
  category: string;
}

export interface Accent {
  base: string;
  deep: string;
  soft: string;
  tint: string;
}

export interface Segment {
  id: SegmentId;
  label: string;
  kicker: string;
  headline: string;
  sub: string;
  thesis: string;
  accent: Accent;
  reach: string;
  metrics: Metric[];
  categories: CategorySlice[];
  followers: FollowerBucket[];
  creators: Creator[];
  gallery: GalleryItem[];
  ticker: string[];
}
