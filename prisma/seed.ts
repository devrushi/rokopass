import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const AGE_GROUPS = [
  { label: "Toddlers (1-2)", minAge: 1, maxAge: 2 },
  { label: "Preschool (3-4)", minAge: 3, maxAge: 4 },
  { label: "Junior (5-7)", minAge: 5, maxAge: 7 },
  { label: "Middle (8-11)", minAge: 8, maxAge: 11 },
  { label: "Teen (12-15)", minAge: 12, maxAge: 15 },
];

async function main() {
  for (const group of AGE_GROUPS) {
    await prisma.ageGroup.upsert({
      where: { label: group.label },
      update: {},
      create: group,
    });
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
