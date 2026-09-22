-- v3.3 (approved by the founders): the Finance statement lists every advance
-- recovery twice, once in Order details and once in Withdrawal records under
-- a different reference. The v3.1 reader stored both, so four recoveries
-- counted double (4,437 + 3,294 + 2,069 + 769). Since v3.2 the reader pairs
-- them and the wallet replay ignores the copies; this removes the four stored
-- copies, by id:
--   002ea2ea-1a0c-4fe9-85c4-025ccfe7e05b  2026-09-21  -4,437
--   4e116db0-f724-4a92-b666-7dc13f125830  2026-09-20  -3,294
--   d80d3511-f3b6-49d1-8349-b6ddca5f8381  2026-09-19  -2,069
--   75b06aac-1e02-4b06-8d3c-21552415df7e  2026-09-18    -769
-- Each is removed only while its Order details twin (same kind, day, amount,
-- no status) is still there.
delete from wallet_events w
 where w.id in (
   '002ea2ea-1a0c-4fe9-85c4-025ccfe7e05b',
   '4e116db0-f724-4a92-b666-7dc13f125830',
   'd80d3511-f3b6-49d1-8349-b6ddca5f8381',
   '75b06aac-1e02-4b06-8d3c-21552415df7e'
 )
   and exists (
     select 1 from wallet_events o
      where o.business_id = w.business_id
        and o.kind = w.kind
        and coalesce(o.status, '') = ''
        and o.event_date = w.event_date
        and o.amount = w.amount
        and o.id <> w.id
   );
