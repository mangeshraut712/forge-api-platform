-- API key hashes must be unique so verification cannot return an arbitrary duplicate.
DROP INDEX "ApiKey_keyHash_idx";

CREATE UNIQUE INDEX "ApiKey_keyHash_key" ON "ApiKey"("keyHash");

-- Keyset pagination filters and sorts by project, createdAt, and id together.
DROP INDEX "Todo_projectId_createdAt_idx";

CREATE INDEX "Todo_projectId_createdAt_id_idx" ON "Todo"("projectId", "createdAt", "id");
