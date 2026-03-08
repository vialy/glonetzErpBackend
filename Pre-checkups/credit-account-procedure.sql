DROP PROCEDURE IF EXISTS credit_account;

DELIMITER $$

CREATE PROCEDURE credit_account(
  IN p_userId VARCHAR(255)
  IN p_accountId INT,
  IN p_amount DECIMAL(20,4),
  IN p_type VARCHAR(255),
  IN p_transaction_id VARCHAR(255),
  IN p_ref VARCHAR(255),
  IN p_status VARCHAR(10),
  IN p_narration VARCHAR(255)
)
BEGIN
  DECLARE v_opening DECIMAL(20,4);
  DECLARE v_closing DECIMAL(20,4);
  DECLARE v_txnId INT;

  START TRANSACTION;

  -- Lock account row
  SELECT balance INTO v_opening
  FROM Account
  WHERE id = p_accountId
  FOR UPDATE;

  IF v_opening IS NULL THEN
    ROLLBACK;
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'ACCOUNT_NOT_FOUND';
  END IF;

  -- Calculate closing balance
  SET v_closing = v_opening + p_amount;

  -- Prevent negative balance
  IF v_closing < 0 THEN
    ROLLBACK;
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'INSUFFICIENT_FUNDS';
  END IF;

  -- Update account balance
  UPDATE Account
  SET balance = v_closing
  WHERE id = p_accountId;

  -- Insert transaction log
  INSERT INTO Transaction (userId, accountId, type, amount, openingBalance, closingBalance, narration, reference, status, completedAt, transactionId)
  VALUES (p_userId, p_accountId, p_type, p_amount, v_opening, v_closing, p_narration, p_ref, p_status, NOW(), p_transaction_id);

  -- Get the inserted transaction id
  SET v_txnId = LAST_INSERT_ID();

  -- Return the created transaction row
  SELECT
    t.id        AS id,
    t.userId    AS userId,
    t.accountId AS accountId,
    t.narration AS narration,
    t.type      AS type,
    t.transactionId AS transactionId,
    t.amount    AS amount,
    t.openingBalance AS openingBalance,
    t.closingBalance AS closingBalance,
    t.currencyCode   AS currencyCode,
    t.reference AS reference,
    t.status    AS status,
    t.completedAt AS completedAt,
    t.createdAt AS createdAt,
    t.updatedAt AS updatedAt
  FROM Transaction t
  WHERE t.id = v_txnId;

  COMMIT;
END $$

DELIMITER ;
