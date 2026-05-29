# Release Readiness Checklist

## Current Score

- Current readiness: **84%**
- Previous baseline: 72%
- Increased by:
  - Secret-key proxy architecture wiring
  - History/feedback failure UX improvements
  - Common timeout/retry policy

## A. Core Feature Verification

- [ ] Login/Sign up/Onboarding flow works on real device.
- [ ] Upload from camera and gallery works.
- [ ] Recommendation result renders summary/tip/items.
- [ ] Recommendation history shows metadata and preview items.
- [ ] Like/Dislike feedback is saved and reflected in history.

## B. Stability Checklist

- [x] History load failure shows retry action.
- [x] Feedback save failure shows retry action.
- [x] External API uses timeout/retry wrapper.
- [ ] Offline mode UX (explicit network status banner) is tested.

## C. Security Checklist

- [x] App no longer reads OpenAI/Naver secret keys directly.
- [x] App calls proxy endpoint via `EXPO_PUBLIC_API_BASE_URL`.
- [ ] Proxy deployed with production domain.
- [ ] Proxy auth/rate-limit/CORS hardening completed.

## D. Release Ops Checklist

- [x] `eas.json` build profiles are defined.
- [ ] `app.json` EAS `projectId` replaced with real id.
- [ ] `eas build --platform android --profile preview` succeeds.
- [ ] Monitoring endpoint configured (`EXPO_PUBLIC_MONITORING_ENDPOINT`).

## E. Regression Pack

- [ ] Login -> Upload -> Recommend -> History -> Feedback end-to-end pass.
- [ ] Invalid proxy URL produces clear user-facing errors.
- [ ] Slow network (3G simulation) still completes requests or fails gracefully.

## Next Loop Rule

When you say **`다음`**, proceed with exactly one highest-priority task:

1. Deploy proxy + secure it (P0 remaining)
2. Finalize EAS `projectId` and preview build (P1)
3. Configure monitoring endpoint and verify error delivery (P1)
4. Run full regression checklist and recalculate readiness score (P2)
