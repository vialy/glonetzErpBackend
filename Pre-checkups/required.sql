/**
 * MySQL Configuration to ensure InnoDB is the default storage engine
 * and existing tables are converted to InnoDB if necessary.
 */
[mysqld]
default-storage-engine=INNODB


/* Restart MySQL service to apply changes */
sudo systemctl restart mysql

/** 
==============================================================================================================>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
Option 2 - SQL commands to check and convert tables 
*/

/**
 * Ensure that the default storage engine is InnoDB
 * and convert existing tables to InnoDB if necessary.
 */

SHOW VARIABLES LIKE 'default_storage_engine';

ALTER TABLE Account ENGINE=InnoDB;
ALTER TABLE Transaction ENGINE=InnoDB;
