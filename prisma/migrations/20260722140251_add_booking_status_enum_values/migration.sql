-- Added in its own migration/transaction: Postgres requires new enum values to be committed
-- before they can be used (e.g. as a column default) — see the follow-up migration.
ALTER TYPE "BookingStatus" ADD VALUE 'PENDING_APPROVAL';
ALTER TYPE "BookingStatus" ADD VALUE 'REJECTED';
