# Vercel Deployment Configuration

## ✅ Configuration Complete

The Vercel deployment has been configured for Expo Router with static output.

## Files Created/Updated

1. **`vercel.json`** - Vercel deployment configuration
2. **`package.json`** - Added `build:web` script
3. **`app/verify.js`** - Fixed missing Image import

## Build Configuration

### Build Command
```bash
npm run build:web
```

This runs `expo export:web` which creates a static build in the `dist` directory.

### Output Directory
The static files are output to `dist/` directory.

## Vercel Settings

In your Vercel dashboard, ensure:

1. **Framework Preset**: None (or Other)
2. **Build Command**: `npm run build:web` (or leave blank to use vercel.json)
3. **Output Directory**: `dist` (or leave blank to use vercel.json)
4. **Install Command**: `npm install` (default)

## Routing Configuration

The `vercel.json` includes:
- **Rewrites**: All routes redirect to `/index.html` for client-side routing
- **Headers**: Cache control headers for `/verify` and `/verify-email` routes

## Testing the Deployment

1. **Push changes to your repository**
2. **Vercel will automatically build and deploy**
3. **Test the verification link**: `https://thrive-web-jet.vercel.app/verify?token=...&email=...`

## Troubleshooting

### If the page still shows "Loading...":

1. **Check Vercel Build Logs**:
   - Go to Vercel Dashboard → Your Project → Deployments
   - Click on the latest deployment
   - Check the build logs for errors

2. **Verify Build Output**:
   - The build should create a `dist` directory
   - Check if `dist/index.html` exists

3. **Check Environment Variables**:
   - Ensure `BACKEND_URL` and `SUPABASE_ANON_KEY` are set in Vercel
   - Go to Project Settings → Environment Variables

4. **Test Locally**:
   ```bash
   npm run build:web
   ```
   - This should create a `dist` directory
   - Check if the files are generated correctly

### Common Issues

1. **Build fails**: Check Node.js version (should be 18+)
2. **Routes not working**: Ensure `vercel.json` rewrites are correct
3. **Assets not loading**: Check if paths are correct in the build output

## Next Steps

1. **Commit and push** the changes:
   ```bash
   git add vercel.json package.json app/verify.js
   git commit -m "Configure Vercel deployment for Expo Router"
   git push
   ```

2. **Vercel will automatically deploy** the changes

3. **Test the verification link** after deployment completes

