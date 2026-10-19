export type ItemType = 'lost' | 'found';
export type ItemSource = 'community' | 'public';

export interface Item {
  id: string;
  title: string;
  type: ItemType;
  category: string;
  color: string;
  date: string;
  /** Server-assigned ISO registration instant; date above is the lost/found event date. */
  createdAt?: string;
  region: string;
  location: string;
  description: string;
  image: string;
  source: ItemSource;
  status: 'open' | 'returned' | 'closed';
  createdBy: string;
  /** A fictional ownership clue for the local demonstration only. */
  secretAnswer?: string;
  agency?: string;
  phone?: string;
  /** Extra labelled values shown on the detail page (경찰청 detail fields such as status or region). */
  facts?: { label: string; value: string }[];
  /** Set only for items loaded from the Spring Boot API (createdBy === 'server'). */
  serverId?: number;
  ownerId?: number;
  ownershipQuestion?: string;
  ownershipConfigured?: boolean;
  /** Moderation state returned in the author's private registration history. */
  hidden?: boolean;
}

export type ReturnStatus =
  | 'pending'
  | 'owner_verified'
  | 'approved'
  | 'qr_verified'
  | 'completed'
  | 'rejected';

export interface ReturnRequest {
  id: string;
  itemId: string;
  lostItemId?: string;
  status: ReturnStatus;
  createdAt: string;
  updatedAt: string;
  requesterId?: number;
  finderId?: number;
  qrToken?: string;
  qrExpiresAt?: string;
  /** Wrong ownership answers left for this request, and whether verification is blocked (server-enforced). */
  ownershipAttemptsRemaining?: number;
  ownershipLocked?: boolean;
}

export interface Profile {
  name: string;
  xp: number;
  returnedCount: number;
  registeredCount: number;
}

export interface Notification {
  id: string;
  title: string;
  message: string;
  createdAt: string;
  read: boolean;
}

export interface AppData {
  items: Item[];
  requests: ReturnRequest[];
  profile: Profile;
  notifications: Notification[];
}

export interface MatchResult {
  item: Item;
  score: number;
  reasons: string[];
}

export type NewItem = Omit<Item, 'id' | 'status' | 'createdBy' | 'createdAt'>;
