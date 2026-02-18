#!/usr/bin/env node

/**
 * Script to upload all local assets (images, videos, icons) to Supabase Storage
 * This makes assets accessible even when your computer is closed
 * 
 * Usage: node scripts/upload-assets-to-supabase.js
 */

const fs = require('fs');
const path = require('path');

// Try to load Supabase client (will install if needed)
let createClient;
try {
  createClient = require('@supabase/supabase-js').createClient;
} catch (error) {
  console.error('❌ @supabase/supabase-js not installed!');
  console.error('Please run: npm install @supabase/supabase-js');
  process.exit(1);
}

// Try to load dotenv
try {
  require('dotenv').config({ path: path.join(__dirname, '../.env') });
} catch (error) {
  console.log('⚠️  dotenv not installed, using environment variables directly');
}

// Get Supabase credentials from environment or use your project URL
// Your Supabase project URL from constants.js
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://mdqgndyhzlnwojtubouh.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Missing Supabase credentials!');
  console.error('Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your .env file');
  console.error('\nExample .env file:');
  console.error('SUPABASE_URL=https://your-project.supabase.co');
  console.error('SUPABASE_SERVICE_ROLE_KEY=your-service-role-key');
  process.exit(1);
}

// Check if we're using anon key (which won't work for bucket creation)
if (SUPABASE_SERVICE_KEY.includes('role":"anon')) {
  console.warn('⚠️  WARNING: You appear to be using the anon key, not the service_role key!');
  console.warn('⚠️  The anon key cannot create buckets or upload files.');
  console.warn('\n📝 To get your service_role key:');
  console.warn('   1. Go to: https://supabase.com/dashboard/project/mdqgndyhzlnwojtubouh/settings/api');
  console.warn('   2. Scroll to "Project API keys"');
  console.warn('   3. Copy the "service_role" key (the SECRET one, not the anon key)');
  console.warn('   4. Update your .env file with: SUPABASE_SERVICE_ROLE_KEY=your-service-role-key');
  console.warn('\n💡 Alternatively, create the bucket manually in Supabase Dashboard:');
  console.warn('   1. Go to Storage → New Bucket');
  console.warn('   2. Name: app-assets');
  console.warn('   3. Make it Public');
  console.warn('   4. Then run this script again\n');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Asset directories to upload
const ASSET_DIRS = [
  'assets/images',
  'assets/icons',
  'assets/logos',
  'assets/videos',
  'assets/growth',
];

// Supabase storage bucket name
const BUCKET_NAME = 'app-assets';

/**
 * Create storage bucket if it doesn't exist
 */
async function ensureBucket() {
  try {
    const { data, error } = await supabase.storage.listBuckets();
    
    if (error) {
      // If we can't list buckets (anon key), assume bucket exists and try to proceed
      console.log(`⚠️  Cannot list buckets (may need service_role key), but proceeding anyway...`);
      console.log(`📦 Assuming bucket "${BUCKET_NAME}" exists (you created it manually)`);
      return true;
    }

    const bucketExists = data.some(bucket => bucket.name === BUCKET_NAME);
    
    if (!bucketExists) {
      console.log(`📦 Creating bucket: ${BUCKET_NAME}...`);
      const { data: newBucket, error: createError } = await supabase.storage.createBucket(BUCKET_NAME, {
        public: true,
        fileSizeLimit: 10485760, // 10MB
      });

      if (createError) {
        console.error('❌ Error creating bucket:', createError.message);
        if (createError.message.includes('row-level security') || createError.statusCode === '403') {
          console.error('\n💡 This usually means you need the service_role key, not the anon key.');
          console.error('   Or create the bucket manually in Supabase Dashboard first.');
          console.error('   Go to: https://supabase.com/dashboard/project/mdqgndyhzlnwojtubouh/storage/buckets');
          console.error('   Create bucket: "app-assets" (make it Public)');
          console.error('\n💡 Since you created it manually, the script will try to proceed anyway...\n');
          // Don't return false - try to proceed with uploads
          return true;
        }
        return false;
      }
      console.log('✅ Bucket created successfully');
    } else {
      console.log(`✅ Bucket "${BUCKET_NAME}" already exists`);
    }
    return true;
  } catch (error) {
    console.error('❌ Error ensuring bucket:', error);
    console.log('💡 Proceeding anyway - bucket may exist from manual creation...');
    return true; // Try to proceed
  }
}

/**
 * Upload a single file to Supabase Storage
 */
async function uploadFile(filePath, storagePath) {
  try {
    const fileContent = fs.readFileSync(filePath);
    const fileName = path.basename(filePath);
    
    console.log(`📤 Uploading: ${fileName}...`);
    
    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(storagePath, fileContent, {
        contentType: getContentType(filePath),
        upsert: true, // Overwrite if exists
      });

    if (error) {
      console.error(`❌ Error uploading ${fileName}:`, error.message);
      return null;
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(storagePath);

    console.log(`✅ Uploaded: ${fileName}`);
    return urlData.publicUrl;
  } catch (error) {
    console.error(`❌ Error uploading file ${filePath}:`, error);
    return null;
  }
}

/**
 * Get content type from file extension
 */
function getContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const types = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.mp4': 'video/mp4',
    '.mp3': 'audio/mpeg',
    '.pdf': 'application/pdf',
  };
  return types[ext] || 'application/octet-stream';
}

/**
 * Recursively get all files from a directory
 */
function getAllFiles(dirPath, arrayOfFiles = []) {
  const files = fs.readdirSync(dirPath);

  files.forEach(file => {
    const filePath = path.join(dirPath, file);
    if (fs.statSync(filePath).isDirectory()) {
      arrayOfFiles = getAllFiles(filePath, arrayOfFiles);
    } else {
      arrayOfFiles.push(filePath);
    }
  });

  return arrayOfFiles;
}

/**
 * Main upload function
 */
async function uploadAllAssets() {
  console.log('🚀 Starting asset upload to Supabase...\n');

  // Ensure bucket exists
  const bucketReady = await ensureBucket();
  if (!bucketReady) {
    console.error('❌ Failed to create/access bucket. Exiting.');
    process.exit(1);
  }

  const projectRoot = path.join(__dirname, '..');
  const assetMap = {};
  let uploadedCount = 0;
  let failedCount = 0;

  // Process each asset directory
  for (const assetDir of ASSET_DIRS) {
    const fullPath = path.join(projectRoot, assetDir);
    
    if (!fs.existsSync(fullPath)) {
      console.log(`⚠️  Directory not found: ${assetDir}`);
      continue;
    }

    console.log(`\n📁 Processing: ${assetDir}`);
    const files = getAllFiles(fullPath);

    for (const filePath of files) {
      // Skip README files
      if (path.basename(filePath).toLowerCase() === 'readme.md') {
        continue;
      }

      // Create storage path (relative to bucket root)
      const relativePath = path.relative(projectRoot, filePath);
      const storagePath = relativePath.replace(/\\/g, '/'); // Normalize path separators

      // Upload file
      const publicUrl = await uploadFile(filePath, storagePath);

      if (publicUrl) {
        // Store mapping: local require path -> Supabase URL
        const requirePath = relativePath.replace(/\\/g, '/');
        assetMap[requirePath] = publicUrl;
        uploadedCount++;
      } else {
        failedCount++;
      }
    }
  }

  // Save asset mapping to file
  const mappingPath = path.join(projectRoot, 'assets-supabase-map.json');
  fs.writeFileSync(
    mappingPath,
    JSON.stringify(assetMap, null, 2)
  );

  console.log('\n' + '='.repeat(50));
  console.log('📊 Upload Summary:');
  console.log(`✅ Successfully uploaded: ${uploadedCount} files`);
  console.log(`❌ Failed: ${failedCount} files`);
  console.log(`📝 Asset mapping saved to: assets-supabase-map.json`);
  console.log('='.repeat(50));
  console.log('\n✨ Next step: Update your code to use Supabase URLs');
  console.log('   See ASSET_MIGRATION_GUIDE.md for instructions\n');
}

// Run the script
uploadAllAssets().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});

