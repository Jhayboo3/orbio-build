# Demo video storyboard

Updated: 2026-09-06

Generate the silent screen-capture draft:

```bash
npm run video:record
```

Output: `docs/assets/orbio-guard-demo.mp4`.

The generated clip uses synthetic demo state and visible top-right captions. Add the
narration from `docs/pitch-script.md` in a video editor or record a live voiceover while
running `orbio-guard demo --hold`.

## Shot sequence

1. **Opening dashboard:** two active agents, `$100` synthetic account balance, protected
   key, and zero spend.
2. **Alpha allowed:** Alpha confirms `$0.10`; dashboard and activity update.
3. **Beta allowed:** Beta confirms `$0.15` against its `$0.20` budget.
4. **Beta blocked:** Beta's next `$0.15` reservation returns `429`; the blocked event
   appears without an upstream spend event.
5. **Fleet continues:** Alpha confirms another `$0.10` while Beta remains constrained.
6. **Ledger close:** scroll to the metadata-only activity panel and hold on the blocked
   decision.

## Narration cues

- “One Orbio account, two separate Guard identities.”
- “Every request reserves spend before the upstream key is loaded.”
- “Beta reaches its policy limit and is blocked before provider access.”
- “Alpha continues, so one agent cannot take down the fleet.”
- “The ledger records cost and decisions, never prompts or secrets.”

## Final-video checklist

- Keep the demo-mode label visible.
- Add product title and closing card if desired.
- Use the full pitch script for a two-minute version.
- Export H.264 MP4 at 1080p or the platform's preferred dimensions.
- Review the final frame for credentials, complete wallet addresses, notifications, and
  unrelated desktop content before publishing.
