-- Candidates participate in the payment-click arbitration window without consuming a slot.
ALTER TYPE public.reservation_status ADD VALUE IF NOT EXISTS 'CANDIDATE';
