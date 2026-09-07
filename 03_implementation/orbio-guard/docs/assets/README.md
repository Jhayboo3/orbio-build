# Submission assets

The PNG files are generated from the current public product pages and deterministic
enforcement demo. Dashboard account, wallet, agent, and key data is synthetic; the public
landing and technical pages describe separately verified live capabilities.

Regenerate them with:

```bash
npm run assets:capture
```

Generate the silent MP4 demo draft with:

```bash
npm run video:record
```

Generate the synthetic narrated MP4 draft with:

```bash
npm run video:narrate
```

Generated video outputs:

- `orbio-guard-demo.mp4` - silent dashboard sequence.
- `orbio-guard-demo-narrated.mp4` - synthetic Samantha-voice narration draft.
- `orbio-guard-pitch-draft.mp4` - longer narrated product-pitch walkthrough.
- `orbio-guard-technical-draft.mp4` - narrated engineering walkthrough.

Do not replace them with screenshots containing live secrets or complete wallet data.
