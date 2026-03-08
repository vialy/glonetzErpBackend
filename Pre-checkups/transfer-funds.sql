DROP PROCEDURE IF EXISTS transfer_funds;

DELIMITER $$

CREATE PROCEDURE transfer_funds(
  IN p_accountId INT,
  IN p_b_accountId INT,
  IN p_userId VARCHAR(255),
  IN p_b_userId VARCHAR(255),
  IN p_amount DECIMAL(20,4),
  IN p_b_amount DECIMAL(20,4),
  IN p_type VARCHAR(255),
  IN p_b_type VARCHAR(255),
  IN p_transaction_id VARCHAR(255),
  IN p_ref VARCHAR(255),
  IN p_status VARCHAR(10),
  IN p_narration VARCHAR(255)
)
BEGIN
-- Define variable for opening and closing balance
  DECLARE v_p_opening DECIMAL(20,4);
  DECLARE v_p_closing DECIMAL(20,4);
  DECLARE v_b_opening DECIMAL(20,4);
  DECLARE v_b_closing DECIMAL(20,4);


-- Declared variables for account 1 and 2 with account 1 being the account with the smaller id
  DECLARE acct1 INT;
  DECLARE acct2 INT;
  DECLARE balance_from DECIMAL(20,4);
  DECLARE balance_to   DECIMAL(20,4);


  
  -- ensure deterministic order of locks
  IF p_accountId < p_b_accountId THEN
    SET acct1 = p_accountId;
    SET acct2 = p_b_accountId;
  ELSE
    SET acct1 = p_b_accountId;
    SET acct2 = p_accountId;
  END IF;




  START TRANSACTION;

  -- lock both accounts in the same order always
  SELECT balance
  FROM Account
  WHERE id IN (acct1, acct2)
  FOR UPDATE;

   -- get balances for from/to specifically
  SELECT balance INTO balance_from FROM Account WHERE id = p_accountId FOR UPDATE;
  SELECT balance INTO balance_to   FROM Account WHERE id = p_b_accountId   FOR UPDATE;

  IF balance_from IS NULL OR balance_to IS NULL THEN
    ROLLBACK;
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'ACCOUNT_NOT_FOUND';
  END IF;

  IF balance_from < p_b_amount THEN
    ROLLBACK;
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'INSUFFICIENT_FUNDS';
  END IF;

  -- Calculate opening balance
  SET v_p_opening = balance_from;
  SET v_b_opening = balance_to;

  -- Calculate closing balance
  SET v_p_closing = v_p_opening - p_b_amount;
  SET v_b_closing = v_b_opening + p_b_amount;

  -- Prevent negative balance
  IF v_p_closing < 0 THEN
    ROLLBACK;
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'INSUFFICIENT_FUNDS';
  END IF;

  -- Update account balance
  UPDATE Account SET balance = v_p_closing WHERE id = p_accountId;
  UPDATE Account SET balance = v_b_closing WHERE id = p_b_accountId;

  -- Insert transaction log
  INSERT INTO Transaction (userId, accountId, type, amount, openingBalance, closingBalance, narration, reference, status, completedAt, transactionId)
  VALUES (p_b_userId, p_b_accountId, p_b_type, p_b_amount, v_b_opening, v_b_closing, p_narration, p_ref, p_status, NOW(), p_transaction_id), (p_userId, p_accountId, p_type, p_amount, v_p_opening, v_p_closing, p_narration, p_ref, p_status, NOW(), p_transaction_id);


  COMMIT;
END $$

DELIMITER ;