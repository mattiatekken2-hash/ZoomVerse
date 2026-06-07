---
name: Marketplace buy economics
description: How /market/buy charges buyers and credits sellers; the 50/50 wallet split and value-conservation rule; equipment shares the same TON endpoint.
---

# Marketplace buy economics

The single `/market/buy` endpoint (artifacts/api-server/src/routes/marketplace.ts)
serves BOTH planet and equipment listings. Currency is TON, not $ZOOM.

## 50/50 wallet split (buyer)
- Buyer pays the listing price 50% from `deposit_balance` (depositBalance) and
  50% from `earned_balance` (tonBalance / column `ton_balance`).
- Both halves debited in ONE race-safe UPDATE guarded on BOTH wallets
  (`deposit_balance >= half` AND `ton_balance >= half`); if either is short the
  row doesn't match and the tx rolls back.

## Seller / admin
- Seller receives net (price - 10% fee) credited 100% to `deposit_balance`;
  the seller's `ton_balance` (earned) is NEVER touched.
- Admin keeps the 10% fee, credited to admin's `ton_balance`.

## Value conservation (avoid rounding mint/burn)
- Each half is `+(price*0.5).toFixed(6)`. Compute `totalDebit = depositHalf + earnedHalf`,
  then `adminShare = totalDebit*0.1`, `sellerShare = totalDebit - adminShare`.
- **Why:** rounding seller and admin independently from `price` can make
  seller+admin diverge from buyer debit by micro-TON. Deriving both from the
  actual `totalDebit` makes `seller + admin == buyer debit` by construction.

## Client mirroring gotcha
- The client must mirror the same debit: deduct `+(price*0.5).toFixed(6)` from
  BOTH depositBalance and tonBalance (serverBuyComplete + buyEquipmentFromMarket
  in useGameState.ts), and gate buy buttons on both wallets in MarketPage.
- **Equipment trap:** the equipment client path historically gated/deducted
  `$ZOOM balance` (with a 25% ZOOM fee) even though the server charges TON via
  the shared endpoint. Any equipment buy work must use TON wallets, not ZOOM.
