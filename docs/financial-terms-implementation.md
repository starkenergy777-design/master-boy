# Craftsman payment terms and disputes

Scope: paid 180-day craftsman listings and 30-day Top 15 slots. Directly negotiated advertisement banners and customer-to-craftsman work payments are outside this change.

## Deployment order

1. Back up the database and apply `migrations/015_financial_terms_and_cases.sql` using the existing migration runner against the intended database.
2. Deploy the application only after the migration succeeds.
3. Open `/financial-terms`, registration, listing renewal, Top 15 checkout, craftsman financial cases, and the admin financial case section in a staging environment.

No migration was applied to the live Supabase project while developing this branch.

## Payment evidence

New simulated paid transactions record the accepted terms version/time, product type, and purchased service period on `payment_intents`. Existing rows keep null values; the application must not invent prior consent or service dates.

## Disputes and refunds

Craftsmen can create a case for one of their own payment IDs and see its status. General support chat limits do not apply. Staff admins and super admins can review cases and record a reason, approved amount, and provider refund reference. A closed case with a positive refund requires a provider reference. The displayed estimate is a decision aid; it uses the paid amount and purchased service period, and does not verify the actual interruption date or perform a bank refund.

Production payments remain disabled by the existing fail-closed gateway guard. Before enabling charging, integrate a real gateway with verified charge/capture and full/partial refund operations, persist provider transaction IDs, test webhook idempotency and failure recovery, and test the dispute workflow against a sandbox. Do not represent an approved case as money returned until the provider confirms it.
