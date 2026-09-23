/**
 * Todo demo CLI — exercises the ForgeAPI SDK end-to-end, including edge cases.
 * Run: pnpm --filter @forge/todo-demo dev
 *
 * Requires:
 *   - ForgeAPI server running (pnpm --filter @forge/api dev)
 *   - FORGE_API_KEY env var set (from seed output)
 *   - FORGE_BASE_URL env var (defaults to http://localhost:4000)
 */
import "dotenv/config";
import { createForgeClient, ForgeApiError } from "@mangeshraut/forge-sdk";

const apiKey = process.env.FORGE_API_KEY ?? "";
const baseUrl = process.env.FORGE_BASE_URL ?? "http://localhost:4000";

if (!apiKey) {
  console.error(
    "❌ FORGE_API_KEY is required. Set it in .env or run `pnpm db:seed` to get one.",
  );
  process.exit(1);
}

const client = createForgeClient({ apiKey, baseUrl });

function printError(err: unknown, indent = "   ") {
  if (err instanceof ForgeApiError) {
    console.error(`${indent}Error: ${err.code} — ${err.message}`);
    if (err.requestId) console.error(`${indent}Request ID: ${err.requestId}`);
  } else {
    console.error(
      `${indent}Unexpected error:`,
      err instanceof Error ? err.message : err,
    );
  }
}

async function demoList() {
  console.log("📋 Listing existing todos...");
  try {
    const existing = await client.listTodos({ limit: 10 });
    console.log(`   Found ${existing.data.length} todo(s)`);
    for (const t of existing.data) {
      console.log(
        `   - [${t.completed ? "x" : " "}] ${t.title} (${t.id.slice(0, 8)})`,
      );
    }
  } catch (err) {
    printError(err);
  }
}

async function demoCrud() {
  const idemKey = `demo-${Date.now()}`;
  console.log("\n➕ Creating a new todo...");
  try {
    const created = await client.createTodo(
      { title: `Demo todo @ ${new Date().toISOString()}` },
      idemKey,
    );
    console.log(`   Created: ${created.title} (${created.id})`);

    console.log("\n✏️  Marking as completed...");
    const updated = await client.updateTodo(created.id, { completed: true });
    console.log(`   Updated: completed=${updated.completed}`);

    console.log("\n🔍 Fetching single todo...");
    const fetched = await client.getTodo(created.id);
    console.log(
      `   Fetched: ${fetched.title} — completed=${fetched.completed}`,
    );

    console.log("\n🗑️  Deleting todo...");
    await client.deleteTodo(created.id);
    console.log("   Deleted successfully");
  } catch (err) {
    printError(err);
  }
}

async function demoIdempotency() {
  console.log("\n🔁 Testing idempotency replay...");
  try {
    const first = await client.createTodo(
      { title: "Idempotency test" },
      "idem-replay-test",
    );
    const second = await client.createTodo(
      { title: "Idempotency test" },
      "idem-replay-test",
    );
    if (first.id === second.id) {
      console.log("   ✅ Idempotency works — same ID returned on retry");
    } else {
      console.log("   ❌ Idempotency failed — different IDs");
    }
    await client.deleteTodo(first.id);
  } catch (err) {
    printError(err);
  }
}

async function demoDuplicateCreation() {
  console.log("\n🔄 Testing duplicate creation (no idempotency key)...");
  try {
    const a = await client.createTodo({ title: "Duplicate test" });
    const b = await client.createTodo({ title: "Duplicate test" });
    if (a.id !== b.id) {
      console.log(
        "   ✅ Without idempotency key, duplicates get different IDs (expected)",
      );
    }
    await client.deleteTodo(a.id);
    await client.deleteTodo(b.id);
  } catch (err) {
    printError(err);
  }
}

async function demoInvalidKey() {
  console.log("\n🔑 Testing invalid API key format...");
  try {
    const badClient = createForgeClient({ apiKey: "not-a-valid-key", baseUrl });
    await badClient.listTodos();
    console.log("   ❌ Should have thrown");
  } catch (err) {
    if (err instanceof ForgeApiError) {
      console.log(`   ✅ Got expected error: ${err.code} — ${err.message}`);
    } else {
      console.log(
        `   ✅ Got expected error: ${err instanceof Error ? err.message : err}`,
      );
    }
  }
}

async function demoUnknownKey() {
  console.log("\n🔑 Testing unknown API key (valid format, not in DB)...");
  try {
    const badClient = createForgeClient({
      apiKey: "forge_test_" + "a".repeat(48),
      baseUrl,
    });
    await badClient.listTodos();
    console.log("   ❌ Should have thrown");
  } catch (err) {
    if (err instanceof ForgeApiError) {
      console.log(`   ✅ Got expected error: ${err.code} — ${err.message}`);
    } else {
      console.log(
        `   ✅ Got expected error: ${err instanceof Error ? err.message : err}`,
      );
    }
  }
}

async function demoTimeout() {
  console.log("\n⏱️  Testing request timeout (1ms)...");
  try {
    const fastClient = createForgeClient({ apiKey, baseUrl, timeoutMs: 1 });
    await fastClient.listTodos();
    console.log("   ❌ Should have timed out");
  } catch (err) {
    console.log(
      `   ✅ Got expected timeout error: ${err instanceof Error ? err.message : err}`,
    );
  }
}

async function demoNetworkRetry() {
  console.log("\n🌐 Testing network retry (unreachable host, GET retries)...");
  try {
    const retryClient = createForgeClient({
      apiKey,
      baseUrl: "http://localhost:59999", // nothing listening
      maxRetries: 2,
      retryBaseDelayMs: 10,
    });
    await retryClient.listTodos();
    console.log("   ❌ Should have failed after retries");
  } catch (err) {
    console.log(
      `   ✅ Got expected error after retries: ${err instanceof Error ? err.message : err}`,
    );
  }
}

async function demoQuotaExceeded() {
  console.log("\n📊 Testing quota exceeded (using a key with 0 remaining)...");
  // We can't easily force a 429 without exhausting quota, so we demonstrate
  // the error handling path by checking the rate-limit headers on a normal call.
  try {
    const res = await fetch(`${baseUrl}/v1/todos?limit=1`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const limit = res.headers.get("X-RateLimit-Limit");
    const remaining = res.headers.get("X-RateLimit-Remaining");
    console.log(
      `   Rate-limit headers: limit=${limit}, remaining=${remaining}`,
    );
    if (res.status === 429) {
      console.log("   ✅ Quota exceeded detected (429)");
    } else {
      console.log(
        "   ℹ️  Quota not exceeded yet — headers show remaining budget",
      );
    }
  } catch (err) {
    printError(err);
  }
}

async function main() {
  console.log("\n=== ForgeAPI Todo Demo ===\n");
  console.log(`Base URL: ${baseUrl}`);
  console.log("API key: configured");

  await demoList();
  await demoCrud();
  await demoIdempotency();
  await demoDuplicateCreation();
  await demoInvalidKey();
  await demoUnknownKey();
  await demoTimeout();
  await demoNetworkRetry();
  await demoQuotaExceeded();

  console.log("\n=== Demo complete ===\n");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
