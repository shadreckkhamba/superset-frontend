# Testing Guide: Wandikweza Maintenance Page

## Quick Test Commands

### Test 1: Maintenance Mode (Docker Down)
```bash
# In your server terminal
cd ~/DevApps/Wandikweza/superset-custom-ui
docker compose down

# Expected Result:
# - Red overlay appears after ~9 seconds (3 checks × 3 seconds)
# - Message: "Dashboard Under Maintenance"
# - Submessage: "Please check back later or contact support"
# - NO pulsing animation (static indicator)
```

### Test 2: Network Connection Lost
```bash
# On your local machine:
# 1. Open dashboard in slideshow/fullscreen
# 2. Disconnect WiFi/Network
# 3. Wait 3-5 seconds

# Expected Result:
# - Orange overlay appears
# - Message: "Network Connection Lost"
# - Submessage: "Attempting to reconnect..."
# - Pulsing white indicator animation

# 4. Reconnect network
# - Dashboard should automatically reload after 2 seconds
```

### Test 3: Slideshow Consistency (Main Issue Fix)
```bash
# Steps:
1. Open Wandikweza dashboard
2. Click "Enter Slideshow" from dashboard menu
3. Wait for Clinical Service Monitoring to display
4. Wait for Patient Stay Time dashboard to display
5. While on Patient Stay Time, disconnect network

# Expected Result:
# - Overlay should appear on BOTH dashboards
# - Previously, it only appeared on Clinical Service Monitoring
# - Now it should work consistently across all slides
```

## Detailed Testing Scenarios

### Scenario 1: Initial Page Load with Slow Connection
**Setup**: Throttle network to slow 3G in browser DevTools

**Steps**:
1. Open browser DevTools (F12)
2. Go to Network tab
3. Set throttling to "Slow 3G"
4. Navigate to dashboard

**Expected**:
- Blue overlay briefly appears
- Message: "Connecting to Dashboard..."
- Page loads once connection is established

---

### Scenario 2: Maintenance Window
**Setup**: Stop backend services

**Steps**:
1. Open dashboard in slideshow mode
2. On server: `docker compose down` or `systemctl stop superset`
3. Wait 9-10 seconds

**Expected**:
- After first check (3s): Orange "Network Connection Lost"
- After second check (6s): Still orange
- After third check (9s): Changes to RED "Dashboard Under Maintenance"
- No pulsing animation (maintenance is intentional, not trying to reconnect)

**Restart**:
```bash
docker compose up -d
# Dashboard should auto-reload when it detects services are back
```

---

### Scenario 3: Intermittent Network Issues
**Setup**: Use browser to simulate intermittent connection

**Steps**:
1. Open dashboard
2. Disable network for 2 seconds
3. Enable network
4. Disable again for 2 seconds
5. Enable network

**Expected**:
- Orange overlay appears when disconnected
- Disappears and reloads when reconnected
- Never reaches maintenance mode (failures aren't consecutive enough)

---

### Scenario 4: Fullscreen Mode
**Setup**: Test fullscreen specifically

**Steps**:
1. Open dashboard (not in slideshow)
2. Click fullscreen button or press F11
3. Disconnect network

**Expected**:
- Overlay appears immediately in fullscreen
- Previously, this might not have worked consistently

---

### Scenario 5: Server Error (500)
**Setup**: Configure server to return 500 error

**Steps**:
1. If you can temporarily modify nginx/server config to return 500
2. Or simulate by modifying the health endpoint

**Expected**:
- RED overlay appears immediately (doesn't wait for 3 checks)
- Message: "Dashboard Under Maintenance"

---

## Browser Testing

### Chrome/Edge
```bash
# Test in regular mode
http://your-server/superset/dashboard/1/

# Test in fullscreen
Press F11

# Test in slideshow
Dashboard Menu → Enter Slideshow
```

### Firefox
- Same as above
- Test specifically for iframe issues (Firefox handles iframes differently)

### Mobile Safari/Chrome
- Test on tablet/phone if dashboards are displayed on kiosks
- Touch-based interaction testing

---

## Automated Testing (Optional)

If you want to create automated tests later:

```typescript
describe('OfflineOverlay', () => {
  it('shows maintenance mode after 3 failed checks', async () => {
    // Mock fetch to fail 3 times
    // Assert red overlay appears
    // Assert message is "Dashboard Under Maintenance"
  });

  it('shows network error on first failure', async () => {
    // Mock navigator.onLine = false
    // Assert orange overlay appears
    // Assert message is "Network Connection Lost"
  });

  it('detects slideshow mode in iframe', () => {
    // Mock parent window with slideshow=1
    // Assert isPresentationMode() returns true
  });
});
```

---

## Verification Checklist

After deployment, verify:

- [ ] Maintenance mode shows RED overlay with correct message
- [ ] Network issues show ORANGE overlay with pulsing indicator
- [ ] Loading state shows BLUE overlay briefly
- [ ] Slideshow works on ALL dashboard pages (not just some)
- [ ] Fullscreen mode triggers overlay correctly
- [ ] Auto-reload works when connection restored
- [ ] Messages are readable and professional
- [ ] Overlay appears on top of all content (z-index 99999)
- [ ] No console errors in browser DevTools
- [ ] Works in Chrome, Firefox, Safari, Edge

---

## Troubleshooting

### Overlay Not Appearing
**Check**:
1. Is dashboard in presentation mode? (standalone=1, slideshow=1, or fullscreen)
2. Check browser console for errors
3. Verify OfflineOverlay component is mounted

**Debug**:
```javascript
// In browser console:
console.log(new URLSearchParams(window.location.search).get('slideshow'));
console.log(document.fullscreenElement);
```

### Wrong Message Showing
**Check**:
1. How many connectivity checks have failed?
2. What status code is the server returning?
3. Is navigator.onLine reporting correctly?

**Debug**:
```javascript
// In browser console:
console.log('Navigator online:', navigator.onLine);
fetch('/health').then(r => console.log('Health status:', r.status));
```

### Overlay Not Disappearing
**Check**:
1. Is the connectivity check succeeding?
2. Is the reload timer firing?

**Solution**:
```bash
# Hard refresh
Ctrl + Shift + R

# Or clear cache
Browser Settings → Clear Browsing Data
```

---

## Monitoring in Production

### What to Watch
1. **Frequency of maintenance mode triggers**
   - Should be rare unless planned maintenance
   - Frequent triggers indicate server instability

2. **Network error patterns**
   - Helps identify connectivity issues
   - Could indicate WiFi problems in office/kiosk

3. **User feedback**
   - Are messages clear and helpful?
   - Do users understand what's happening?

### Logging (Future Enhancement)
Consider adding:
```typescript
// Log when maintenance mode is triggered
console.info('[OfflineOverlay] Maintenance mode triggered', {
  failedChecks: failedChecksRef.current,
  lastStatus: lastStatusRef.current,
  timestamp: new Date().toISOString(),
});
```

---

## Contact

For issues or questions about the maintenance page:
- Check the commit message: `ea69caf`
- Review `MAINTENANCE_PAGE_CHANGES.md`
- Test using scenarios above
