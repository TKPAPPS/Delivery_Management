-- ============================================================
-- Enforce single_customer_lock at the data layer
-- A locked delivery card may hold at most one customer. This guards every
-- insert path (incremental Add Customer, card-creation loop, order->delivery
-- bridge) and is race-safe via a row lock on the parent card.
-- ============================================================

CREATE OR REPLACE FUNCTION enforce_single_customer_lock()
RETURNS trigger AS $$
DECLARE
  locked boolean;
  existing int;
BEGIN
  -- Lock the parent card row so concurrent inserts for the same card serialize.
  SELECT single_customer_lock INTO locked
  FROM delivery_cards
  WHERE id = NEW.delivery_card_id
  FOR UPDATE;

  IF locked THEN
    SELECT count(*) INTO existing
    FROM delivery_customers
    WHERE delivery_card_id = NEW.delivery_card_id;

    IF existing >= 1 THEN
      RAISE EXCEPTION 'Card is locked to a single customer'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_single_customer_lock ON delivery_customers;
CREATE TRIGGER trg_single_customer_lock
  BEFORE INSERT ON delivery_customers
  FOR EACH ROW EXECUTE FUNCTION enforce_single_customer_lock();
