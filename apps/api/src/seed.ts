// Fills the local database with sample studios, people, invitations and
// activity so every M0 screen has something to show. Wipes existing data.
//
//   npm run seed            (stop the API first: embedded Postgres allows one process)
//
// Refuses to run against DATABASE_URL unless --force is passed.

import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { sql } from "drizzle-orm";
import type { Role } from "@coord/shared";
import { openDatabase } from "./db/client.ts";
import { auditLog, invitations, memberships, studios, users } from "./db/schema.ts";
import { hashPassword, newToken } from "./auth/crypto.ts";
import { seedCatalog, seedProposal } from "./seed-catalog.ts";

export const SEED_PASSWORD = "studio-dev-password";
const APP_ORIGIN = process.env.APP_ORIGIN ?? "http://localhost:5173";

if (process.env.DATABASE_URL && !process.argv.includes("--force")) {
  console.error("DATABASE_URL is set. Seeding wipes all data, so pass --force if you really mean it.");
  process.exit(1);
}

const dataDir = process.env.PGLITE_DIR ?? resolve(process.cwd(), ".data/pg");
if (!process.env.DATABASE_URL) mkdirSync(dirname(dataDir), { recursive: true });
const db = await openDatabase({ url: process.env.DATABASE_URL, dataDir });
const { sys } = db;

const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (d: number, hour = 10) => {
  const t = new Date(Date.now() - d * DAY);
  t.setHours(hour, Math.floor(Math.random() * 60), 0, 0);
  return t;
};

interface Person {
  key: string;
  name: string;
  email: string;
}

const people: Person[] = [
  // Hollis Interiors, a 7-person studio
  { key: "maya", name: "Maya Hollis", email: "maya@hollis.test" },
  { key: "diane", name: "Diane Park", email: "diane@hollis.test" },
  { key: "jordan", name: "Jordan Lee", email: "jordan@hollis.test" },
  { key: "renata", name: "Renata Vidal", email: "renata@hollis.test" },
  { key: "priya", name: "Priya Shah", email: "priya@hollis.test" },
  { key: "theo", name: "Theo Brooks", email: "theo@hollis.test" },
  { key: "linda", name: "Linda Morales", email: "linda@hollis.test" },
  // Fernwood Design Co., a solo practice
  { key: "sam", name: "Sam Ortiz", email: "sam@fernwood.test" },
  // Atelier Nine, a 3-person studio
  { key: "noor", name: "Noor Haddad", email: "noor@ateliernine.test" },
  { key: "eli", name: "Eli Sutton", email: "eli@ateliernine.test" },
  { key: "grace", name: "Grace Kim", email: "grace@ateliernine.test" },
];

interface StudioSeed {
  name: string;
  createdDaysAgo: number;
  // [person, role, days ago they joined]; the first entry created the studio
  members: [string, Role, number][];
  roleChanges?: [by: string, who: string, from: Role, to: Role, daysAgo: number][];
  removed?: [by: string, email: string, role: Role, daysAgo: number][];
  cancelled?: [by: string, email: string, role: Role, invitedDaysAgo: number, cancelledDaysAgo: number][];
  pending?: [by: string, email: string, role: Role, daysAgo: number][];
}

const seeds: StudioSeed[] = [
  {
    name: "Hollis Interiors",
    createdDaysAgo: 120,
    members: [
      ["maya", "owner", 120],
      ["diane", "admin", 112],
      ["jordan", "designer", 95],
      ["renata", "designer", 61],
      ["priya", "assistant", 40],
      ["linda", "bookkeeper", 33],
      ["theo", "assistant", 9],
      // Sam consults for Hollis, so Sam can switch between two studios.
      ["sam", "designer", 20],
    ],
    roleChanges: [
      ["maya", "diane", "designer", "admin", 80],
      ["diane", "renata", "assistant", "designer", 14],
    ],
    removed: [["diane", "casey@hollis.test", "assistant", 27]],
    cancelled: [["diane", "wrong.email@hollis.test", "designer", 6, 5]],
    pending: [
      ["diane", "ava@hollis.test", "designer", 2],
      ["maya", "books@hollisinteriors.test", "bookkeeper", 1],
    ],
  },
  {
    name: "Fernwood Design Co.",
    createdDaysAgo: 75,
    members: [["sam", "owner", 75]],
    pending: [["sam", "assistant@fernwood.test", "assistant", 3]],
  },
  {
    name: "Atelier Nine",
    createdDaysAgo: 200,
    members: [
      ["noor", "owner", 200],
      ["eli", "owner", 200],
      ["grace", "designer", 50],
    ],
  },
];

console.log("Wiping existing data…");
await sys.execute(sql`TRUNCATE users, studios, memberships, sessions, invitations, audit_log, clients, vendors, projects, rooms, items, item_components CASCADE`);

console.log("Creating people…");
const passwordHash = await hashPassword(SEED_PASSWORD);
const userIds = new Map<string, string>();
for (const p of people) {
  const [row] = await sys
    .insert(users)
    .values({ name: p.name, email: p.email, passwordHash, createdAt: daysAgo(200) })
    .returning({ id: users.id });
  userIds.set(p.key, row!.id);
}
const uid = (key: string) => userIds.get(key)!;
const person = (key: string) => people.find((p) => p.key === key)!;

const studioIds = new Map<string, string>();
const inviteLinks: { studio: string; email: string; role: Role; url: string }[] = [];

for (const s of seeds) {
  console.log(`Creating ${s.name}…`);
  const founder = s.members[0]![0];
  const [studio] = await sys
    .insert(studios)
    .values({ name: s.name, createdAt: daysAgo(s.createdDaysAgo, 9) })
    .returning({ id: studios.id });
  const studioId = studio!.id;
  studioIds.set(s.name, studioId);
  const log: (typeof auditLog.$inferInsert)[] = [];

  log.push({
    studioId,
    actorUserId: uid(founder),
    action: "studio.created",
    entityType: "studio",
    entityId: studioId,
    after: { name: s.name },
    createdAt: daysAgo(s.createdDaysAgo, 9),
  });

  for (const [key, role, joined] of s.members) {
    // Role at join time: before any later role change.
    const change = s.roleChanges?.find(([, who]) => who === key);
    const joinedAs = change ? change[2] : role;
    await sys.insert(memberships).values({ studioId, userId: uid(key), role, createdAt: daysAgo(joined, 11) });
    if (key === founder || joined === s.createdDaysAgo) continue;

    // Diane became admin 80 days ago; earlier joiners were invited by the founder.
    const inviter = joined > 80 ? founder : (s.members.find(([k, r]) => r === "admin" && k !== key)?.[0] ?? founder);
    const { hash } = newToken();
    const [inv] = await sys
      .insert(invitations)
      .values({
        studioId,
        email: person(key).email,
        role: joinedAs,
        tokenHash: hash,
        invitedBy: uid(inviter),
        createdAt: daysAgo(joined + 1, 15),
        expiresAt: daysAgo(joined - 6, 15),
        acceptedAt: daysAgo(joined, 11),
      })
      .returning({ id: invitations.id });
    log.push(
      {
        studioId,
        actorUserId: uid(inviter),
        action: "invitation.created",
        entityType: "invitation",
        entityId: inv!.id,
        after: { email: person(key).email, role: joinedAs },
        createdAt: daysAgo(joined + 1, 15),
      },
      {
        studioId,
        actorUserId: uid(key),
        action: "invitation.accepted",
        entityType: "invitation",
        entityId: inv!.id,
        after: { email: person(key).email, role: joinedAs },
        createdAt: daysAgo(joined, 11),
      },
    );
  }

  for (const [by, who, from, to, ago] of s.roleChanges ?? []) {
    log.push({
      studioId,
      actorUserId: uid(by),
      action: "member.role_changed",
      entityType: "user",
      entityId: uid(who),
      before: { role: from },
      after: { role: to },
      createdAt: daysAgo(ago, 14),
    });
  }

  for (const [by, email, role, ago] of s.removed ?? []) {
    log.push({
      studioId,
      actorUserId: uid(by),
      action: "member.removed",
      entityType: "user",
      entityId: null,
      before: { role, email },
      createdAt: daysAgo(ago, 16),
    });
  }

  for (const [by, email, role, invited, cancelled] of s.cancelled ?? []) {
    const { hash } = newToken();
    const [inv] = await sys
      .insert(invitations)
      .values({
        studioId,
        email,
        role,
        tokenHash: hash,
        invitedBy: uid(by),
        createdAt: daysAgo(invited, 13),
        expiresAt: daysAgo(invited - 7, 13),
        revokedAt: daysAgo(cancelled, 9),
      })
      .returning({ id: invitations.id });
    log.push(
      {
        studioId,
        actorUserId: uid(by),
        action: "invitation.created",
        entityType: "invitation",
        entityId: inv!.id,
        after: { email, role },
        createdAt: daysAgo(invited, 13),
      },
      {
        studioId,
        actorUserId: uid(by),
        action: "invitation.revoked",
        entityType: "invitation",
        entityId: inv!.id,
        before: { email },
        createdAt: daysAgo(cancelled, 9),
      },
    );
  }

  for (const [by, email, role, ago] of s.pending ?? []) {
    const { token, hash } = newToken();
    const [inv] = await sys
      .insert(invitations)
      .values({
        studioId,
        email,
        role,
        tokenHash: hash,
        invitedBy: uid(by),
        createdAt: daysAgo(ago, 10),
        expiresAt: new Date(daysAgo(ago, 10).getTime() + 7 * DAY),
      })
      .returning({ id: invitations.id });
    log.push({
      studioId,
      actorUserId: uid(by),
      action: "invitation.created",
      entityType: "invitation",
      entityId: inv!.id,
      after: { email, role },
      createdAt: daysAgo(ago, 10),
    });
    inviteLinks.push({ studio: s.name, email, role, url: `${APP_ORIGIN}/invite/${token}` });
  }

  await sys.insert(auditLog).values(log);
}

console.log("Adding vendors, clients, projects and items…");
await seedCatalog(sys, studioIds.get("Hollis Interiors")!);
await seedCatalog(sys, studioIds.get("Fernwood Design Co.")!, true);
await seedCatalog(sys, studioIds.get("Atelier Nine")!, true);
console.log("Sending a sample proposal…");
const proposalUrl = await seedProposal(db, studioIds.get("Hollis Interiors")!, APP_ORIGIN);

await db.close();

console.log(`\nDone. Every account's password is: ${SEED_PASSWORD}\n`);
console.table(
  people.map((p) => {
    const roles = seeds
      .flatMap((s) => s.members.filter(([k]) => k === p.key).map(([, r]) => `${r} @ ${s.name}`))
      .join(", ");
    return { email: p.email, name: p.name, roles };
  }),
);
console.log("\nOpen invitations (try one in a private window to see the join flow):");
for (const l of inviteLinks) console.log(`  ${l.role.padEnd(10)} ${l.email.padEnd(30)} ${l.url}`);
if (proposalUrl) {
  console.log("\nThe Hendersons' proposal, as the client sees it (local dev shows the email code on the page):");
  console.log(`  ${proposalUrl}`);
}
