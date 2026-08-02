const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function reset() {
  const email = process.argv[2];
  if (!email) {
    console.error("Please provide the user email! Usage: node resetStripe.js <email>");
    process.exit(1);
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.error(`User with email ${email} not found.`);
    process.exit(1);
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      stripeAccountId: null,
      stripeChargesEnabled: false,
      stripeDetailsSubmitted: false
    }
  });

  console.log(`✅ Successfully reset Stripe Connect data for ${email}`);
  console.log("You can now refresh the Wallet page and test the 'Connect with Stripe' flow again.");
}

reset()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
