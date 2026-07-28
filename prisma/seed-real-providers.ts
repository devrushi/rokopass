/**
 * Real Leicester activity providers — a directory-only dataset built from a spreadsheet of real
 * local businesses (name/venue/contact details as supplied), kept separate from
 * prisma/seed-demo.ts's entirely fictional pitch-demo dataset (which uses .example.com emails
 * specifically to avoid any real-world privacy/impersonation concern).
 *
 * These are directory listings, not login-capable accounts: each provider gets a random,
 * immediately-discarded password hash (satisfies the NOT NULL passwordHash column, but nobody
 * holds the plaintext, so signing in isn't practically possible). Real emails and phone numbers
 * are stored and shown, per explicit instruction — see AGENTS.md for the full rationale.
 *
 * Deliberately excluded from the source spreadsheet: entries with no usable email (a contact-form
 * URL isn't an email address), and one venue-for-hire that isn't itself a children's activity
 * provider. See AGENTS.md for the exact exclusion list. Two pairs of near-duplicate rows (same
 * business, listed twice under slightly different names) were merged into one entry each.
 *
 * Run with:
 *
 *   npx tsx prisma/seed-real-providers.ts
 *
 * Safe to re-run: providers are upserted by email, activities by providerId+title (no compound
 * unique constraint on Activity, so this looks the row up by hand — same pattern as seed-demo.ts).
 */
import { prisma } from "../src/lib/prisma";
import { hashPassword } from "../src/lib/password";
import { generateActivityPhoto } from "./demo-assets";
import crypto from "node:crypto";

async function getAgeGroupId(label: string): Promise<string> {
  const group = await prisma.ageGroup.findUniqueOrThrow({ where: { label } });
  return group.id;
}

interface RealProviderSeed {
  name: string;
  category: string;
  venue?: string;
  websiteUrl?: string;
  email: string;
  rawPhone?: string;
}

// Categories normalized to Title Case for a clean Browse filter; venue/postcode copied from the
// spreadsheet's "Venue_Area_Postcode" column verbatim. rawPhone is exactly as given, including
// spreadsheet artifacts like a stripped leading 0 — normalizePhone() below fixes those up.
const PROVIDERS: RealProviderSeed[] = [
  {
    name: "118 Dance Studio",
    category: "Dance",
    venue: "The Y Theatre, 7 East St, Leicester LE1 6EY",
    websiteUrl: "https://www.118dance.co.uk/",
    email: "enquiries@118dance.co.uk",
    rawPhone: "07852 270890",
  },
  {
    name: "Bamboozle Theatre",
    category: "Performing Arts",
    venue: "Unit 10, St Marys Work, Burnmoor St, Leicester LE2 7JL",
    email: "info@bamboozletheatre.co.uk",
    rawPhone: "0116 255 2065",
  },
  {
    name: "Drama Kids (Knighton)",
    category: "Performing Arts",
    venue: "Knighton, LE2",
    websiteUrl: "https://www.dramakids.co.uk/knighton/",
    email: "leicestercity@dramakids.co.uk",
    rawPhone: "07917 953983",
  },
  {
    // Merged with the duplicate "Ftmdance.co.uk" row — kept the fuller venue.
    name: "FTM Dance",
    category: "Dance",
    venue: "Embrace Arts Centre, LE1 7HB",
    websiteUrl: "https://ftmdance.co.uk/",
    email: "referrals@ftmdance.co.uk",
    rawPhone: "07543 068872",
  },
  {
    name: "King Academy",
    category: "Performing Arts",
    venue: "All Saints Church Hall, Bushloe End, Wigston LE18 2BQ",
    websiteUrl: "https://kingacademy.co.uk/",
    email: "info@kingacademy.co.uk",
    rawPhone: "07947 844111",
  },
  {
    name: "Leicester Dance Company",
    category: "Dance",
    venue: "St Peter's Centre, Wigston Rd, Oadby LE2 5QE",
    websiteUrl: "https://www.the-leicester-dance-company.com/",
    email: "melanie.may2@btinternet.com",
    rawPhone: "07811 630670",
  },
  {
    name: "Leicester Theatre Group",
    category: "Performing Arts",
    venue: "39 Pool Rd, Leicester LE3 9GH",
    websiteUrl: "https://www.leicestertheatregroup.co.uk/",
    email: "leicestertheatregroup@gmail.com",
    rawPhone: "07500 900737",
  },
  {
    name: "Nupur Arts",
    category: "Dance",
    venue: "Peepul Centre, Orchardson Avenue, Leicester LE4 6DP",
    websiteUrl: "http://www.nupurarts.org.uk/",
    email: "info@nupurarts.org.uk",
    rawPhone: "07801 365779",
  },
  {
    name: "PQA Leicester",
    category: "Performing Arts",
    venue: "College, Downing Dr, Leicester LE5 6LN",
    websiteUrl: "https://www.pqacademy.com/academies/leicester/",
    email: "membershipteam@pqacademy.com",
    rawPhone: "07850 468141",
  },
  {
    name: "Rascals Performing Arts",
    category: "Performing Arts",
    venue: "St. John the Baptist Church, 4a Clarendon Park Road, Leicester LE2 3AD",
    websiteUrl: "https://www.rascals-uk.com/clarendon-park-leicester",
    email: "info@rascals-uk.com",
    // "331543" in the source sheet — too short to be a full UK number, left unusable on purpose.
  },
  {
    name: "STARS Performing Arts School",
    category: "Performing Arts",
    venue: "120A Hartopp Road, Clarendon Park, Leicester LE2 1WF",
    websiteUrl: "https://www.starsperformingarts.uk/",
    email: "su@starsperformingarts.com",
    rawPhone: "07840 616287",
  },
  {
    name: "SideKick Dance",
    category: "Dance",
    websiteUrl: "https://sidekickdance.co.uk/",
    email: "charlotte@sidekickdance.co.uk",
  },
  {
    name: "Studio 79",
    category: "Dance",
    venue: "35 Rydal St, Leicester LE2 7DS",
    websiteUrl: "https://www.studio79youth.co.uk/studio79youth",
    email: "laura@studio79.co.uk",
    rawPhone: "0116 251 7570",
  },
  {
    name: "The Arella School Of Performing Arts",
    category: "Performing Arts",
    venue: "Westgate School Hall, Glenfield Road, Leicester LE3 6DG",
    websiteUrl: "https://www.thearellaschool.co.uk/",
    email: "becca@thearellaschool.co.uk",
    rawPhone: "07923 544909",
  },
  {
    name: "Turned On Its Head Dance Company",
    category: "Dance",
    websiteUrl: "https://turnedonitshead.org/",
    email: "liz@turnedonitshead.org",
  },
  {
    name: "Urban Young Actors",
    category: "Performing Arts",
    venue: "Quad Studios, 78 Friday St, Leicester LE1 3BW",
    websiteUrl: "https://urbanyoungactors.com/",
    email: "info@urbanyoungactors.com",
    rawPhone: "07775431112",
  },
  {
    name: "Addictdanceacademy",
    category: "Dance",
    venue: "133-149 St Nicholas Cir, Leicester LE1 4LF",
    websiteUrl: "https://addictdanceacademy.co.uk/",
    email: "info@addictdanceacademy.co.uk",
    rawPhone: "0116 319 2490",
  },
  {
    name: "Dance-central.co.uk",
    category: "Dance",
    venue: "Inglehurst Junior School, Ingle St, Leicester LE3 9FS",
    websiteUrl: "https://dance-central.co.uk/",
    email: "cb.dancecentral@gmail.com",
    rawPhone: "07934 110047",
  },
  {
    name: "Dupontdance.com",
    category: "Dance",
    venue: "Dupont Dance Stage School, Memory Lane, Leicester LE1 3UL",
    websiteUrl: "https://www.dupontdance.com/",
    email: "info@dupontdance.com",
    rawPhone: "0116 262 9229",
  },
  {
    name: "Etoileperformance.co.uk",
    category: "Dance",
    venue: "EPA Studios, 2B Empire Rd, Leicester LE3 5HE",
    websiteUrl: "https://www.etoileperformance.co.uk/",
    email: "etoileperformance@hotmail.com",
    rawPhone: "07756 666866",
  },
  {
    // Merged with the duplicate "TheatreWorks Dance School & Performing Arts Leicester" row.
    name: "Theatreworkspa.com",
    category: "Performing Arts",
    venue: "Active Arts, 47-51 Pool Rd, Leicester LE3 9GH",
    websiteUrl: "https://www.theatreworkspa.com/",
    email: "theatreworksperformingarts@gmail.com",
    rawPhone: "07812382081",
  },
  {
    name: "Thestarlets.co.uk",
    category: "Dance",
    websiteUrl: "https://www.thestarlets.co.uk/joinus",
    email: "starletsperformingarts@hotmail.com",
  },
  {
    name: "Be Science",
    category: "STEM",
    venue: "Imperial House, St Nicholas Cir, Leicester LE1 4LF",
    websiteUrl: "https://bescience.org.uk/",
    email: "hello@bescience.org.uk",
  },
  {
    name: "National Space Academy",
    category: "STEM",
    venue: "Exploration Drive, Leicester LE4 5NS",
    websiteUrl: "https://nationalspaceacademy.org/",
    email: "nsa@spacecentre.co.uk",
    rawPhone: "0116 258 2147",
  },
  {
    name: "City Cricket Academy",
    category: "Cricket",
    venue: "8 Commercial Square, Leicester LE2 7SR",
    websiteUrl: "http://www.citycricketacademy.co.uk/",
    email: "info@citycricketacademy.co.uk",
    rawPhone: "1162543333",
  },
  {
    name: "Leicester Sports Centre - Cricket & Football",
    category: "Multi Sports",
    venue: "16 Commercial Square, Leicester LE2 7SR",
    email: "kulvindersidki@hotmail.co.uk",
    rawPhone: "07752 157158",
  },
  {
    name: "CDCA Academy",
    category: "Dance",
    venue: "Darker St, Leicester LE1 4SL",
    websiteUrl: "http://www.cdca-academy.com/",
    email: "cdca-academy@hotmail.com",
    rawPhone: "7701341110",
  },
  {
    name: "AFC Andrews",
    category: "Football",
    venue: "Knighton Ln E, Aylestone, Leicester LE2 6FT",
    websiteUrl: "https://www.afcandrews.com/",
    email: "pablogibbo66@gmail.com",
    rawPhone: "7970180346",
  },
  {
    name: "What a goal",
    category: "Football",
    venue: "29 Lewisher Rd, Leicester LE4 9LR",
    websiteUrl: "http://www.whatagoal.co.uk/",
    email: "bookings@whatagoal.co.uk",
    rawPhone: "1163970940",
  },
  {
    name: "Razzamataz Theatre School Leicester South",
    category: "Performing Arts",
    venue: "Sir Jonathan North College, Knighton Ln E, Leicester LE2 6FU",
    websiteUrl: "https://www.razzamataz.co.uk/school/20/Leicester0South/",
    email: "leicestersouth@razzamataz.co.uk",
    rawPhone: "7553031067",
  },
  {
    name: "The Ann Oliver Stage School",
    category: "Performing Arts",
    venue: "Garden St, Leicester LE1 3UA",
    websiteUrl: "http://www.annoliver.co.uk/",
    email: "info@annoliver.co.uk",
    rawPhone: "1164829948",
  },
  {
    name: "Petite Street Play Village",
    category: "Soft Play",
    venue: "Unit 14, Stoughton Grange, Gartree Rd, Oadby, Leicester LE2 2FB",
    websiteUrl: "http://www.petitestreetplayvillage.co.uk/",
    email: "enquiries@petitestreetplayvillage.co.uk",
    rawPhone: "1164319497",
  },
  {
    name: "Beanies Soft Play",
    category: "Soft Play",
    venue: "Leicester Rd, Anstey, Leicester LE7 7AT",
    websiteUrl: "https://potterscarpetsandbeds.co.uk/beanies-soft-play/",
    email: "kellie@beaniessoftplay.co.uk",
    rawPhone: "0116 2362880",
  },
];

/**
 * The source spreadsheet came out of Excel, which silently drops a leading 0 from any all-digit
 * cell it treats as a number (e.g. "01162543333" -> "1162543333", mobile or landline alike).
 * Every UK national number is 11 digits starting with 0, so a bare 10-digit result gets that
 * digit restored; anything that still isn't exactly 11 digits starting with 0 is left unset
 * rather than guessed at.
 *
 * whatsappNumber only gets set for mobiles (07... -> +447...) since a landline can't take a
 * wa.me deep link — phoneNumber (a plain tel: link) covers both.
 */
function normalizePhone(raw: string | undefined): { phoneNumber: string | null; whatsappNumber: string | null } {
  if (!raw) return { phoneNumber: null, whatsappNumber: null };
  let digits = raw.replace(/\(.*?\)/g, "").replace(/\D/g, "");
  if (digits.length === 10) {
    digits = `0${digits}`;
  }
  if (digits.length !== 11 || !digits.startsWith("0")) {
    return { phoneNumber: null, whatsappNumber: null };
  }
  const phoneNumber = `${digits.slice(0, 5)} ${digits.slice(5)}`;
  const whatsappNumber = digits.startsWith("07") ? `+44${digits.slice(1)}` : null;
  return { phoneNumber, whatsappNumber };
}

function ageGroupLabelFor(category: string): string {
  return category === "Soft Play" ? "Preschool (3-4)" : "Middle (8-11)";
}

// Fixed, clearly-arbitrary defaults — the spreadsheet has no capacity/pricing data, and this is
// a directory listing rather than a bookable class, so these exist only to satisfy the schema's
// required columns.
const DEFAULT_CAPACITY = 15;
const DEFAULT_CREDIT_COST = 3;

async function seedProvidersAndActivities() {
  let providerCount = 0;
  let activityCount = 0;

  for (const p of PROVIDERS) {
    const { phoneNumber, whatsappNumber } = normalizePhone(p.rawPhone);

    // Random, discarded on the spot — nobody holds this plaintext, so this account is not
    // practically loggable-into. Just enough to satisfy the NOT NULL passwordHash column.
    const passwordHash = await hashPassword(crypto.randomBytes(32).toString("hex"));

    const provider = await prisma.user.upsert({
      where: { email: p.email },
      update: {
        firstName: p.name,
        phoneNumber,
        whatsappNumber,
        websiteUrl: p.websiteUrl ?? null,
        verificationStatus: "APPROVED",
      },
      create: {
        email: p.email,
        passwordHash,
        firstName: p.name,
        lastName: "",
        role: "PROVIDER",
        verificationStatus: "APPROVED",
        phoneNumber,
        whatsappNumber,
        websiteUrl: p.websiteUrl,
      },
    });
    providerCount += 1;

    const ageGroupId = await getAgeGroupId(ageGroupLabelFor(p.category));
    const title = p.name;
    const description = `${p.name} runs ${p.category.toLowerCase()} sessions for children in the Leicester area. Contact them directly for current class times and availability.`;
    const location = p.venue ?? "Leicester";

    const existingActivity = await prisma.activity.findFirst({
      where: { providerId: provider.id, title },
    });
    if (existingActivity) {
      await prisma.activity.update({
        where: { id: existingActivity.id },
        data: { description, category: p.category, location, ageGroupId },
      });
    } else {
      const activity = await prisma.activity.create({
        data: {
          providerId: provider.id,
          ageGroupId,
          title,
          description,
          category: p.category,
          location,
          capacity: DEFAULT_CAPACITY,
          creditCost: DEFAULT_CREDIT_COST,
        },
      });
      // SKIP_MEDIA is for running this script from a plain local shell against a *remote*
      // database without Netlify Blobs credentials on hand — persistAssetBuffer would otherwise
      // default to writing the photo to this machine's own disk, which the live site (Blobs-
      // backed there) can't actually serve, producing a broken image rather than a photo. Leaving
      // an activity with no photo falls back to Browse's plain placeholder tile instead, which is
      // the better failure mode. Not needed for local dev (disk storage matches local dev's own
      // serving path) or a future run with RUNNING_IN_NETLIFY_FUNCTION + Blobs creds set.
      if (process.env.SKIP_MEDIA !== "true") {
        await prisma.activityMedia.create({
          data: {
            activityId: activity.id,
            type: "ACTIVITY_PHOTO",
            url: await generateActivityPhoto(p.category),
            caption: p.name,
          },
        });
      }
    }
    activityCount += 1;
  }

  console.log(`Seeded ${providerCount} real providers and ${activityCount} directory activities.`);
}

seedProvidersAndActivities()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
