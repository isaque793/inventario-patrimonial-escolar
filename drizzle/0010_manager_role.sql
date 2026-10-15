ALTER TABLE `users` MODIFY COLUMN `role` enum('user','manager','admin') NOT NULL DEFAULT 'user';
