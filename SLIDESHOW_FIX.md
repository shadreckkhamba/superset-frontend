# Slideshow State Preservation Fix

## Problem
When the network was restored during a slideshow, the page would reload with `window.location.reload()`, causing the slideshow to reset to the first slide instead of continuing from the current slide.

## Root Cause
The `OfflineOverlay` component's `goOnline()` function was calling `window.location.reload()` unconditionally when network connectivity was restored. This caused:
1. The entire page to reload
2. The slideshow component's state (including `currentSlide`) to be lost
3. The slideshow to restart from slide 0

## Solution
Modified the `goOnline()` function in `src/dashboard/components/OfflineOverlay.tsx` to:
1. Check if the page is in slideshow mode (`slideshow=1` URL parameter)
2. Check if the page is in standalone mode (`standalone=1` URL parameter)
3. Skip the reload if either mode is active
4. Just hide the offline overlay and let the slideshow/standalone view continue naturally

### Code Changes
```typescript
const goOnline = () => {
  if (!offlineRef.current) return;

  offlineRef.current = false;
  setOffline(false);

  if (reloadTimerRef.current) {
    clearTimeout(reloadTimerRef.current);
  }
  if (!reloadingRef.current) {
    reloadingRef.current = true;
    reloadTimerRef.current = setTimeout(() => {
      // Check if we're in slideshow or standalone mode
      const query = new URLSearchParams(window.location.search);
      const isSlideshow = query.get(SLIDESHOW_PARAM) === '1';
      const isStandalone = query.get(STANDALONE_PARAM) === '1';
      
      // Don't reload if in slideshow or standalone mode - just let it continue
      // In slideshow mode, the parent slideshow component manages the iframes
      // In standalone mode (fullscreen), reloading would exit fullscreen
      // In both cases, just hiding the overlay is sufficient
      if (!isSlideshow && !isStandalone) {
        window.location.reload();
      }
    }, RECONNECT_DELAY_MS);
  }
};
```

## Why This Works
1. **Slideshow Mode**: The slideshow component manages multiple iframes, each with `slideshow=1` parameter. When network is restored, each iframe just hides its overlay without reloading, so the parent slideshow component maintains its state and continues from the current slide.

2. **Standalone Mode**: Similar behavior for fullscreen dashboards with `standalone=1` parameter. Reloading would exit fullscreen mode, so we just hide the overlay instead.

3. **Regular Dashboard Mode**: For normal dashboard views (without slideshow or standalone parameters), the page still reloads as before to ensure fresh data is loaded.

## Testing Instructions
1. Start the slideshow with multiple dashboards
2. Let it advance to the second or third slide
3. Simulate network disconnection (e.g., `docker compose stop` on the backend)
4. Wait for the "Network Connection Lost" overlay to appear
5. Restore network connection (e.g., `docker compose start`)
6. Verify that:
   - The overlay disappears after ~2 seconds
   - The slideshow continues from the same slide it was on
   - The slideshow does NOT reset to the first slide
   - The auto-advance timer continues normally

## Files Modified
- `src/dashboard/components/OfflineOverlay.tsx`: Updated `goOnline()` function to skip reload in slideshow/standalone modes

## Benefits
- Seamless user experience during network interruptions
- Slideshow state is preserved across network reconnections
- No disruption to the viewing experience
- Also benefits fullscreen (standalone) mode
