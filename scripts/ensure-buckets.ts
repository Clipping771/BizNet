import { CreateBucketCommand, HeadBucketCommand } from "@aws-sdk/client-s3";
import { s3Client, S3_BUCKET_PRIVATE, S3_BUCKET_PUBLIC } from "../lib/storage";

// Creates the public and private buckets if missing (local MinIO / CI).
async function main() {
  for (const bucket of [S3_BUCKET_PUBLIC, S3_BUCKET_PRIVATE]) {
    try {
      await s3Client.send(new HeadBucketCommand({ Bucket: bucket }));
      console.log(`bucket ${bucket}: exists`);
    } catch {
      await s3Client.send(new CreateBucketCommand({ Bucket: bucket }));
      console.log(`bucket ${bucket}: created`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
