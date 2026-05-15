import { pgTable, text, timestamp, serial, index } from "drizzle-orm/pg-core";

/**
 * ROOM INVITES — peer-to-peer "visit my home" invites between EXISTING
 * players (separate from the Telegram referral system, which is for
 * onboarding NEW users).
 *
 * Flow:
 *   1. Sender opens INVITE modal, types the recipient's @username, taps
 *      "Invite to my Room". Server resolves the username to a telegramId
 *      and inserts a row with status='pending'.
 *   2. Recipient sees a banner on HOME with the sender's name + Accept /
 *      Decline. Tapping Accept flips status to 'accepted' and stamps
 *      acceptedAt = now().
 *   3. Sender's HOME polls /room-invites/visitors and renders the
 *      recipient's astronaut alongside referral friends. After 30 min
 *      from acceptedAt the visitor times out (client-side filter — the
 *      row stays in the DB for audit / re-acceptance throttling).
 *
 * Privacy: like /referral/friends we never expose raw telegramIds /
 * @usernames of OTHER users to the client — the visitors endpoint only
 * returns a salted opaque key + display name.
 *
 * Anti-abuse:
 *   - Send route enforces a per-sender outbound rate limit AND blocks
 *     resending to the same recipient if a previous invite (any status)
 *     was created within the last 5 minutes.
 *   - Cap on pending outbound invites per sender (10).
 *   - Username lookup is case-insensitive (we store usernames lowercase
 *     already in /referral/register).
 */
export const roomInvitesTable = pgTable(
  "room_invites",
  {
    id: serial("id").primaryKey(),
    fromTelegramId: text("from_telegram_id").notNull(),
    toTelegramId: text("to_telegram_id").notNull(),
    /** 'pending' | 'accepted' | 'declined' */
    status: text("status").notNull().default("pending"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    /** Set when the recipient taps Accept. NULL while pending / declined.
     *  The 30-minute visit window is measured from this timestamp. */
    acceptedAt: timestamp("accepted_at"),
  },
  (t) => [
    // Inbox lookup: "give me my pending invites".
    index("idx_room_invites_to_status").on(t.toTelegramId, t.status),
    // Active-visitors lookup: "give me invites I sent that are accepted".
    index("idx_room_invites_from_accepted").on(t.fromTelegramId, t.acceptedAt),
    // Used by the rate-limit check on send (most-recent invite from A→B).
    index("idx_room_invites_from_to_created").on(t.fromTelegramId, t.toTelegramId, t.createdAt),
  ],
);

export type RoomInvite = typeof roomInvitesTable.$inferSelect;
