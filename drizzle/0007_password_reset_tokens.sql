CREATE TABLE `passwordResetTokens` (
  `id` int AUTO_INCREMENT NOT NULL,
  `userId` int NOT NULL,
  `tokenHash` varchar(64) NOT NULL,
  `expiresAt` timestamp NOT NULL,
  `usedAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `passwordResetTokens_id` PRIMARY KEY(`id`),
  CONSTRAINT `password_reset_token_hash_unique` UNIQUE(`tokenHash`)
);
--> statement-breakpoint
CREATE INDEX `password_reset_user_idx` ON `passwordResetTokens` (`userId`);
--> statement-breakpoint
CREATE INDEX `password_reset_expires_idx` ON `passwordResetTokens` (`expiresAt`);
