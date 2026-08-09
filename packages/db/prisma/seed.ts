/**
 * Dev seed: creates a demo user, project, and a live API key.
 * The raw key is printed once to stdout — store it for todo-demo.
 */
import "dotenv/config";
import { createHash, randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function hashKey(
  raw: string,
  pepper = process.env.API_KEY_HASH_PEPPER ?? "",
): string {
  return createHash("sha256").update(`${pepper}${raw}`).digest("hex");
}

function generateLiveKey(): string {
  const secret = randomBytes(24).toString("hex");
  return `forge_live_${secret}`;
}

async function main() {
  const email = "dev@forge.local";
  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      name: "Forge Dev",
      googleSub: "dev-local-google-sub",
    },
  });

  const project = await prisma.project.upsert({
    where: {
      ownerId_slug: { ownerId: user.id, slug: "demo" },
    },
    update: {},
    create: {
      name: "Demo Project",
      slug: "demo",
      ownerId: user.id,
      plan: "FREE",
    },
  });

  // Revoke previous seed keys so re-seed is clean
  await prisma.apiKey.updateMany({
    where: { projectId: project.id, name: "Seed key" },
    data: { revokedAt: new Date() },
  });

  const rawKey = generateLiveKey();
  const key = await prisma.apiKey.create({
    data: {
      projectId: project.id,
      name: "Seed key",
      environment: "LIVE",
      keyPrefix: rawKey.slice(0, 16),
      keyHash: hashKey(rawKey),
      scopes: ["todos:read", "todos:write"],
    },
  });

  console.log("\n=== ForgeAPI seed complete ===");
  console.log(`User:    ${user.email} (${user.id})`);
  console.log(`Project: ${project.name} (${project.id})`);
  console.log(`Key id:  ${key.id}`);
  console.log(`API KEY (store once): ${rawKey}`);
  console.log("==============================\n");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
