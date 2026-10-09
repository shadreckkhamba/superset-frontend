# Wandikweza Maintenance Page Enhancement

## Overview
Enhanced the OfflineOverlay component to intelligently detect and display different types of connection errors with appropriate messaging for the Wandikweza dashboard system.

## Changes Made

### 1. **Intelligent Error Detection**
The system now distinguishes between three types of errors:

#### **Maintenance Mode** (Red overlay)
- Triggered when:
  - Server responds with 5xx status codes
  - 3+ consecutive failed connectivity checks
- Message: "Dashboard Under Maintenance"
- Submessage: "Please check back later or contact support"
- Does NOT attempt to reconnect automatically

#### **Network Issues** (Orange overlay)
- Triggered when:
  - Navigator reports offline status
  - Temporary connection failures (< 3 checks)
- Message: "Network Connection Lost"
- Submessage: "Attempting to reconnect..."
- Actively polls and attempts to reconnect

#### **Loading State** (Blue overlay)
- Triggered when:
  - Initial connection attempts
  - Temporary server unreachability
- Message: "Connecting to Dashboard..."
- Submessage: "This may take a moment..."
- Attempts to reconnect

### 2. **Fixed Slideshow Consistency Issues**

#### Problem
The overlay was inconsistently showing across different dashboards in slideshow mode.

#### Solution
- **Enhanced iframe detection**: Added check for parent window slideshow parameter
- **Increased polling frequency**: Changed from 1000ms to 500ms for faster mode detection
- **Added event listeners**: Now listens to `hashchange` events in addition to existing listeners
- **Cross-origin safe**: Handles iframe access errors gracefully

```typescript
const isInSlideshowIframe = (() => {
  try {
    if (window.parent && window.parent !== window) {
      const parentQuery = new URLSearchParams(window.parent.location.search);
      return parentQuery.get(SLIDESHOW_PARAM) === '1';
    }
  } catch {
    // Cross-origin iframe, can't access parent
  }
  return false;
})();
```

### 3. **Visual Improvements**

#### Color-Coded Overlays
- **Red** (#DC2626): Maintenance - serious, intentional downtime
- **Orange** (#F97316): Network issues - temporary, reconnecting
- **Blue** (#3B82F6): Loading - initial connection state

#### Dynamic Messaging
- Messages are injected into the launcher HTML at runtime
- Different styling for each error type
- Pulsing animation for reconnection states
- Static indicator for maintenance mode

### 4. **Smart Reconnection Logic**

```typescript
const MAINTENANCE_CHECK_THRESHOLD = 3;
```

- Tracks consecutive failed checks
- After 3 failures, assumes maintenance mode
- Stops aggressive reconnection attempts for maintenance
- Continues monitoring for network issues

## Files Modified

1. **`src/dashboard/components/OfflineOverlay.tsx`**
   - Enhanced `checkConnectivity()` to return status codes
   - Added `determineErrorType()` function
   - Improved `isPresentationMode()` for iframe detection
   - Added dynamic HTML injection for messages
   - Enhanced state management with `ErrorState` type

## Testing Recommendations

### Test Scenarios

1. **Maintenance Mode Test**
   ```bash
   # Stop docker containers
   docker compose down
   ```
   - Should show red "Dashboard Under Maintenance" after 3 failed checks
   - Should NOT show "Attempting to reconnect..."

2. **Network Issues Test**
   - Disable network temporarily
   - Should show orange "Network Connection Lost"
   - Should show "Attempting to reconnect..."
   - Should automatically reload when network returns

3. **Slideshow Consistency Test**
   - Open dashboard in slideshow mode
   - Navigate to "Patient Stay Time" dashboard
   - Navigate to "Clinical Service Monitoring" dashboard
   - Disconnect network
   - Overlay should appear consistently on ALL dashboards

4. **Fullscreen Mode Test**
   - Enter fullscreen mode
   - Disconnect network
   - Overlay should appear immediately

5. **Loading State Test**
   - Open dashboard with slow network
   - Should briefly show blue "Connecting to Dashboard..." message

## Technical Details

### Error Type Determination Logic

```typescript
function determineErrorType(
  failedChecks: number,
  lastStatus?: number,
): ErrorState {
  // 500+ status = server error = maintenance
  if (lastStatus && lastStatus >= 500) {
    return { type: 'maintenance', ... };
  }

  // 3+ failures = intentional shutdown = maintenance
  if (failedChecks >= MAINTENANCE_CHECK_THRESHOLD) {
    return { type: 'maintenance', ... };
  }

  // Navigator offline = network issue
  if (!navigator.onLine) {
    return { type: 'network', ... };
  }

  // Default = loading/temporary issue
  return { type: 'loading', ... };
}
```

### Presentation Mode Detection

The overlay now activates when ANY of these conditions are true:
1. `standalone=1` URL parameter
2. `slideshow=1` URL parameter
3. Browser is in fullscreen mode
4. **NEW**: Parent window has `slideshow=1` (for iframes)

## Future Enhancements

Consider adding:
1. **Manual retry button** for maintenance mode
2. **Countdown timer** showing estimated downtime
3. **Configurable thresholds** via environment variables
4. **Telemetry** to track maintenance events
5. **Graceful degradation** for partial service availability

## Deployment Notes

- No breaking changes
- No new dependencies
- Compatible with existing launcher.html
- Works with path-prefixed deployments (e.g., `/superset1/`)

## Branch Information

- **Branch**: `feature/maintenance-page`
- **Base**: `feature/stay-time-dashboard`
- **Commit**: ea69caf

## Rollback Instructions

If issues arise, rollback to previous version:
```bash
git revert ea69caf
```

The system will return to the previous behavior where all disconnections show the same generic message.
