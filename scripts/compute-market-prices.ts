/** One-off run of the nightly market-price job: `pnpm prices:compute`. */
import { runComputeMarketPricesJob } from "../jobs/compute-market-prices";
import { prisma } from "../lib/prisma";

runComputeMarketPricesJob()
  .then((result) => console.log(JSON.stringify(result)))
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
