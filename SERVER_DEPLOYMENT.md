# Server Deployment Guide: Maintenance Page Enhancement

## Quick Deployment Steps

### On Server (root@ubuntu)

```bash
# Navigate to the project directory
cd ~/DevApps/Wandikweza/superset-custom-ui/superset-frontend

# Check current branch and status
git branch
git status

# Fetch the new branch from GitHub
git fetch origin feature/maintenance-page

# Create and checkout the new branch
git checkout -b feature/maintenance-page origin/feature/maintenance-page

# Verify you're on the right branch
git branch
# Should show: * feature/maintenance-page

# View the changes
git log --oneline -3
# Should show:
# 97b8b84 docs: add maintenance page enhancement documentation and testing guide
# ea69caf feat(OfflineOverlay): enhance maintenance page with intelligent error detection
# be234ec fix(DashboardSlideshow): use appRoot prefix for slide URLs in path-prefixed deployments

# Install any new dependencies (if any)
npm install

# Build the frontend
npm run build

# The build should complete successfully (takes 5-10 minutes)
```

### After Successful Build

```bash
# Restart the Docker containers to pick up the new build
cd ~/DevApps/Wandikweza/superset-custom-ui
docker compose restart

# Or if you prefer a full restart:
docker compose down
docker compose up -d

# Check if containers are running
docker compose ps
```

## Verification

### 1. Test Normal Operation
```bash
# Open the dashboard in browser
http://your-server-ip/superset/dashboard/your-dashboard-id/?slideshow=1
```

### 2. Test Maintenance Mode
```bash
# Stop containers
docker compose down

# Expected: Red overlay saying "Dashboard Under Maintenance"
# Wait ~9 seconds for it to appear
```

### 3. Test Network Issues
```bash
# With containers running, disconnect network temporarily
# Expected: Orange overlay saying "Network Connection Lost"
```

### 4. Test Slideshow Consistency
```bash
# Start slideshow mode
# Navigate through different dashboards
# Disconnect network
# Expected: Overlay appears on ALL dashboards, not just some
```

## Troubleshooting

### Build Fails with npm errors

**Issue**: npm ci fails or build fails

**Solution**:
```bash
# Clean the build cache
rm -rf node_modules
rm -rf .temp_cache
npm cache clean --force

# Reinstall
npm install

# Try building again
npm run build
```

### Build Succeeds but Changes Don't Appear

**Issue**: Old code still running

**Solution**:
```bash
# Hard restart containers
docker compose down
docker compose up -d --force-recreate

# Clear browser cache
# Or open in incognito/private window
```

### TypeScript Errors During Build

**Issue**: TypeScript compilation errors

**Note**: The project has pre-existing TypeScript errors that are safely ignored during the webpack build. As long as the webpack build completes, the code will work.

**If build completely fails**:
```bash
# Check if the OfflineOverlay.tsx file is correct
cat src/dashboard/components/OfflineOverlay.tsx | head -50

# Should start with:
# import React, { useEffect, useState, useRef } from 'react';
# import { createPortal } from 'react-dom';
#
# declare const process: { env: { LAUNCHER_HTML: string } };
# const launcherHtml: string = process.env.LAUNCHER_HTML;
```

## Rollback if Needed

If something goes wrong and you need to rollback:

```bash
# Go back to the previous working branch
git checkout feature/stay-time-dashboard

# Rebuild
npm run build

# Restart containers
cd ~/DevApps/Wandikweza/superset-custom-ui
docker compose restart
```

## Files Changed

Only 1 file was modified:
- `src/dashboard/components/OfflineOverlay.tsx`

Documentation added:
- `MAINTENANCE_PAGE_CHANGES.md`
- `TESTING_MAINTENANCE_PAGE.md`
- `SERVER_DEPLOYMENT.md` (this file)

## Expected Build Time

- **npm install**: 2-3 minutes (if dependencies changed)
- **npm run build**: 5-10 minutes
- **Total**: ~7-13 minutes

## Post-Deployment Checklist

- [ ] Build completed without fatal errors
- [ ] Docker containers restarted successfully
- [ ] Dashboard loads normally
- [ ] Slideshow mode works
- [ ] Tested maintenance mode (docker compose down)
- [ ] Tested network issues
- [ ] Overlay appears consistently on all dashboards
- [ ] Appropriate messages show for each error type

## Support

If you encounter issues:

1. Check the build logs for specific errors
2. Review `MAINTENANCE_PAGE_CHANGES.md` for technical details
3. Review `TESTING_MAINTENANCE_PAGE.md` for testing scenarios
4. Check browser console for JavaScript errors
5. Verify the branch is correct: `git branch` should show `* feature/maintenance-page`

## Notes

- The changes are backward compatible
- No database migrations required
- No configuration changes needed
- Works with existing launcher.html
- Compatible with path-prefixed deployments
