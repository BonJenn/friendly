# Friendly — Operational Playbook

## Cost Monitoring

### Where costs come from
| Source | Driver | Typical range |
|--------|--------|---------------|
| LLM (OpenAI/Anthropic) | Tokens in + out | $0.01–0.15 per conversation turn |
| TTS (ElevenLabs) | Characters synthesized | $0.03–0.10 per response |
| STT (Whisper) | Audio seconds | $0.006 per second |
| Image gen (DALL-E) | Per image | $0.02–0.08 per image |
| Cloud Run | CPU/memory seconds | ~$5–50/month at low scale |
| Firestore | Reads/writes | ~$5–20/month at low scale |
| Cloud Storage | Storage + egress | ~$1–5/month initially |
| FCM | Free | Free |

### How to monitor
```bash
# Cloud Run costs
gcloud billing accounts list
gcloud run services describe friendly-api --region=us-central1

# View Cloud Run logs
gcloud logging read \
  'resource.type="cloud_run_revision" AND resource.labels.service_name="friendly-api"' \
  --project=friendly-app --limit=100

# Firestore usage
# Firebase Console → Firestore → Usage tab

# Set budget alerts
gcloud billing budgets create \
  --billing-account=BILLING_ACCOUNT_ID \
  --display-name="Friendly Monthly" \
  --budget-amount=100USD \
  --threshold-rule=percent=50 \
  --threshold-rule=percent=90
```

### Key metrics to watch
- **Daily active users** — count unique UIDs in usage collection
- **Avg turns per session** — monitor in sessions collection
- **LLM tokens per user per day** — track via provider logging
- **Voice seconds per user per day** — tracked in usage/{uid}/days/{date}
- **Error rate** — Cloud Run error logs

---

## Tuning Caps

Caps are defined in `services/friendly-api/src/types/index.ts` → `TIER_LIMITS` and mirrored in the mobile app types.

### When to adjust
- **Revenue < costs for a tier**: Tighten caps or raise prices
- **Users hitting caps too fast**: Consider whether engagement is healthy or if caps are too restrictive
- **Churn after hitting caps**: Caps may be too aggressive — soften the cap language

### How to adjust
1. Edit `TIER_LIMITS` in both:
   - `services/friendly-api/src/types/index.ts`
   - `apps/friendly-mobile/src/types/index.ts`
2. Redeploy API: `cd infra && bash deploy.sh`
3. Ship new mobile build via EAS

### Soft vs hard caps
- **Soft cap**: Friend says "gotta go" naturally when usage is near limit. Controlled by `nearCap` hint injected into LLM system prompt.
- **Hard cap**: Server returns 429 or a canned "at cap" response. Controlled by `checkMessageCap`, `checkVoiceCap`, `checkImageCap`.

---

## Avoiding Runaway Usage

### Server-side protections
1. **Rate limiting**: 60 requests/minute per user (configurable in `config.ts`)
2. **Hard message cap**: Enforced in chat route before calling LLM
3. **Hard voice cap**: Enforced in call route before processing audio
4. **Session turn limit**: `maxTurnsPerSession` (50) prevents infinite sessions
5. **Audio file size limit**: 10MB max upload
6. **Session timeout**: 30 minutes

### Client-side protections
1. **Call max duration**: 5 minutes hard cap on client timer
2. **Recording max duration**: 30 seconds per voice turn
3. **Input max length**: 500 characters per text message

### Emergency procedures
If costs spike unexpectedly:

```bash
# 1. Scale down Cloud Run to 0 instances
gcloud run services update friendly-api \
  --region=us-central1 \
  --max-instances=0

# 2. Pause proactive outreach
gcloud scheduler jobs pause friendly-proactive-job \
  --project=friendly-app --location=us-central1

# 3. Investigate
gcloud logging read \
  'resource.type="cloud_run_revision"' \
  --project=friendly-app --limit=500 --format=json | \
  jq '.[].jsonPayload'

# 4. If a specific user is abusing:
# Set their tier to 'free' in Firestore Console
# or add them to a blocklist in the auth middleware
```

### Per-user cost guardrails
You can add an additional daily cost cap per user:

```typescript
// Example: $0.50/day max per user across all AI calls
// Track estimated cost in usage/{uid}/days/{date}.estimatedCostCents
// Check before each AI call
```

---

## Proactive Outreach Tuning

### Current parameters (in `services/proactive.ts`)
- **Schedule**: Every 15 minutes
- **Cooldown**: 4 hours between contacts
- **Random chance**: 30% of eligible users per run
- **Type split**: 70% text, 30% call
- **Follow-up on missed call**: 2 minute delay

### Adjusting
- **Too many notifications**: Increase cooldown, decrease random chance
- **Not enough engagement**: Decrease cooldown, increase random chance
- **Users complaining about calls**: Switch to 90/10 text/call split
- **Quiet hours violated**: Check timezone handling in `isInCallWindow`

---

## Adding Real AI Providers

### STT (Speech-to-Text)
Create `services/friendly-api/src/providers/stt/whisper.ts`:
```typescript
export class WhisperSTTProvider implements STTProvider {
  async transcribe(buffer: Buffer, mimeType: string): Promise<STTResult> {
    // Call OpenAI Whisper API
    // Return { text, durationSeconds, language }
  }
}
```

### LLM
Create `services/friendly-api/src/providers/llm/openai.ts`:
```typescript
export class OpenAILLMProvider implements LLMProvider {
  async chat(messages: LLMMessage[], tier: ModelTier): Promise<LLMResponseStructured> {
    // Use gpt-4o-mini for 'small', gpt-4o for 'large'
    // Parse structured JSON from response
  }
}
```

### TTS (Text-to-Speech)
Create `services/friendly-api/src/providers/tts/elevenlabs.ts`:
```typescript
export class ElevenLabsTTSProvider implements TTSProvider {
  async synthesize(text: string, voiceId: VoiceId): Promise<TTSResult> {
    // Call ElevenLabs API
    // Return { audioBuffer, durationSeconds, mimeType }
  }
}
```

### Image
Create `services/friendly-api/src/providers/image/dalle.ts`:
```typescript
export class DallEImageProvider implements ImageProvider {
  async generate(prompt: string, style?: string): Promise<ImageResult> {
    // Call DALL-E API
    // Return { imageBuffer, mimeType }
  }
}
```

Then update the provider registry in `src/index.ts`.

---

## Safety Monitoring

### Review flagged content
```bash
# In Firebase Console, check the safety_flags collection
# Fields: uid, sessionId, type, userTextSnippet, createdAt, reviewed
```

### Escalation
1. Crisis flags should be reviewed daily
2. Consider integrating with a safety review dashboard
3. Track false positive rate and tune patterns in `safety.ts`

---

## Database Maintenance

### Clean up old session turns (TTL)
Firestore doesn't have native TTL. Options:
1. Cloud Function triggered daily to delete turns older than 30 days
2. Use Firestore TTL policies (if available in your region)

```bash
# Example: Delete turns older than 30 days
# Run as a scheduled Cloud Function or one-off script
```

### Usage data retention
Keep daily usage docs for 90 days. Aggregate monthly for billing/analytics.
